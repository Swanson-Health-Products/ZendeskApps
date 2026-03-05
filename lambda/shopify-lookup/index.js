const https = require("https");
const crypto = require("crypto");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const STORE = process.env.SHOPIFY_STORE;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";
const SECRET_ARN = process.env.SHOPIFY_TOKEN_SECRET_ARN;
const API_KEY = String(process.env.API_KEY || "").trim();
const MAX_RESULTS = Number(process.env.MAX_RESULTS || 10);
const SWANSON_SCAN_PAGE_SIZE = Number(process.env.SWANSON_SCAN_PAGE_SIZE || 50);
const SWANSON_SCAN_MAX_PAGES = Number(process.env.SWANSON_SCAN_MAX_PAGES || 20);
const AUDIT_LOG_TABLE = String(process.env.AUDIT_LOG_TABLE || "").trim();
const AUDIT_LOG_TTL_DAYS = Number(process.env.AUDIT_LOG_TTL_DAYS || 90);
const SHOPIFY_HTTP_TIMEOUT_MS = Number(process.env.SHOPIFY_HTTP_TIMEOUT_MS || 15000);
const SHOPIFY_GRAPHQL_MAX_RETRIES = Number(process.env.SHOPIFY_GRAPHQL_MAX_RETRIES || 3);
const SHOPIFY_GRAPHQL_RETRY_BASE_MS = Number(process.env.SHOPIFY_GRAPHQL_RETRY_BASE_MS || 250);
const SHOPIFY_GRAPHQL_RETRY_MAX_MS = Number(process.env.SHOPIFY_GRAPHQL_RETRY_MAX_MS || 4000);
const BOGO_VARIANT_PRICING_CACHE_TTL_MS = Number(process.env.BOGO_VARIANT_PRICING_CACHE_TTL_MS || (5 * 60 * 1000));
const DRAFT_CREATE_IDEMPOTENCY_TTL_MS = Number(process.env.DRAFT_CREATE_IDEMPOTENCY_TTL_MS || (10 * 60 * 1000));

const secretsManager = new SecretsManagerClient({});
const dynamoDbClient = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamoDbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

let cachedToken = null;
let cachedTokenFetchedAt = 0;
const variantPricingCache = new Map();
const draftCreateIdempotencyCache = new Map();

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : "",
  };
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, body: data, headers: res.headers || {} });
      });
    });
    req.on("error", reject);
    req.setTimeout(SHOPIFY_HTTP_TIMEOUT_MS, () => {
      const err = new Error(`Shopify request timed out after ${SHOPIFY_HTTP_TIMEOUT_MS}ms`);
      err.code = "ETIMEDOUT";
      req.destroy(err);
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function getHeader(event, name) {
  const headers = event && event.headers && typeof event.headers === "object"
    ? event.headers
    : {};
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key || "").toLowerCase() === target) {
      return String(value || "").trim();
    }
  }
  return "";
}

function authorizeRequest(event) {
  if (!API_KEY) {
    console.error("Missing API_KEY environment variable");
    return respond(500, { error: "Server auth misconfiguration" });
  }

  const provided = getHeader(event, "x-api-key");
  if (!provided) {
    return respond(401, { error: "Missing API key" });
  }

  const expectedBuf = Buffer.from(API_KEY, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return respond(403, { error: "Invalid API key" });
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headers = {}) {
  const raw = headers["retry-after"] || headers["Retry-After"];
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return asNum * 1000;
  }
  const parsedDate = Date.parse(raw);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }
  return null;
}

function isRetriableHttpStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetriableNetworkError(err) {
  const code = String(err?.code || "").toUpperCase();
  return ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED", "EPIPE"].includes(code);
}

function shouldRetryGraphqlErrors(errors) {
  if (!Array.isArray(errors) || !errors.length) return false;
  const text = JSON.stringify(errors).toLowerCase();
  return text.includes("throttled") || text.includes("timeout") || text.includes("internal") || text.includes("temporar");
}

function computeBackoffMs(attempt, retryAfterMs = null) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(SHOPIFY_GRAPHQL_RETRY_MAX_MS, Math.max(100, retryAfterMs));
  }
  const exp = SHOPIFY_GRAPHQL_RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(50, SHOPIFY_GRAPHQL_RETRY_BASE_MS));
  return Math.min(SHOPIFY_GRAPHQL_RETRY_MAX_MS, exp + jitter);
}

function buildOptionsFromUrl(url, baseOptions) {
  const parsed = new URL(url);
  return {
    ...baseOptions,
    hostname: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
  };
}

async function httpsRequestWithRedirect(options, body, maxRedirects = 1) {
  let current = { ...options };
  let remaining = maxRedirects;
  while (true) {
    const result = await httpsRequest(current, body);
    const isRedirect = result.status >= 300 && result.status < 400;
    const location = result.headers?.location;
    if (isRedirect && location && remaining > 0) {
      remaining -= 1;
      current = buildOptionsFromUrl(location, current);
      continue;
    }
    return result;
  }
}

async function getToken() {
  const now = Date.now();
  if (cachedToken && now - cachedTokenFetchedAt < 5 * 60 * 1000) {
    return cachedToken;
  }
  if (!SECRET_ARN) throw new Error("Missing SHOPIFY_TOKEN_SECRET_ARN");
  const data = await secretsManager.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  const token = data.SecretString || "";
  if (!token) throw new Error("Empty Shopify token secret");
  cachedToken = token.trim();
  cachedTokenFetchedAt = now;
  return cachedToken;
}

function buildQuery(params) {
  const parts = [];
  if (params.firstName) parts.push(`first_name:${params.firstName}`);
  if (params.lastName) parts.push(`last_name:${params.lastName}`);
  if (params.email) parts.push(`email:${params.email}`);
  if (params.phone) parts.push(`phone:${params.phone}`);
  if (params.swansonId) parts.push(`metafield:swanson.id=${params.swansonId}`);
  if (params.query) parts.push(params.query);
  return parts.filter(Boolean).join(" ");
}

function parseLimit(input) {
  const num = Number(input);
  if (!Number.isFinite(num) || num <= 0) return MAX_RESULTS;
  return Math.min(Math.floor(num), MAX_RESULTS);
}

function normalizeSwansonId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  return trimmed;
}

function normalizeMetafieldGid(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (!/^gid:\/\/shopify\/Metafield\/\d+$/.test(trimmed)) return "invalid";
  return trimmed;
}

function normalizeSku(input) {
  return String(input || "").trim().toUpperCase();
}

function toCustomerLegacyId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/gid:\/\/shopify\/Customer\/(\d+)/);
  return match ? match[1] : null;
}

function toVariantGid(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("gid://shopify/ProductVariant/")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/ProductVariant/${trimmed}`;
  return null;
}

function isBogoPricing(pricingValue) {
  if (!pricingValue) return false;
  return /\bbogo\b/i.test(String(pricingValue));
}

function roundUpToEven(quantity) {
  const qty = Number(quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 2;
  return qty % 2 === 0 ? qty : qty + 1;
}

function recommendationRank(value) {
  const rec = String(value || "").trim().toLowerCase();
  if (rec === "cancel") return 3;
  if (rec === "investigate") return 2;
  if (rec === "accept") return 1;
  return 0;
}

function mapRecommendationToLevel(value) {
  const rec = String(value || "").trim().toLowerCase();
  if (rec === "cancel") return "high";
  if (rec === "investigate") return "medium";
  if (rec === "accept") return "low";
  return "unknown";
}

function normalizeRiskSignal(risk) {
  const recommendation = String(risk?.recommendation || "").trim().toUpperCase();
  const message = String(risk?.message || risk?.merchant_message || "").trim();
  const source = String(risk?.source || "").trim();
  const scoreRaw = risk?.score;
  const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
  return {
    source: source || null,
    recommendation: recommendation || null,
    score,
    message: message || null,
    display: risk?.display === true,
    cause_cancel: risk?.cause_cancel === true,
  };
}

function summarizeShopifyOrderRisks(risks) {
  const list = Array.isArray(risks) ? risks : [];
  if (!list.length) {
    return {
      available: true,
      recommendation: null,
      level: "unknown",
      reasons: [],
      signals: [],
    };
  }

  let topRecommendation = "";
  let topRank = -1;
  const reasons = [];
  const signals = list.map((risk) => {
    const signal = normalizeRiskSignal(risk);
    const rank = recommendationRank(signal.recommendation);
    if (rank > topRank) {
      topRank = rank;
      topRecommendation = signal.recommendation || "";
    }
    if (signal.message && !reasons.includes(signal.message)) {
      reasons.push(signal.message);
    }
    return signal;
  });

  return {
    available: true,
    recommendation: topRecommendation || null,
    level: mapRecommendationToLevel(topRecommendation),
    reasons: reasons.slice(0, 10),
    signals,
  };
}

async function fetchOrderFraudAnalysis({ token, orderLegacyId }) {
  if (!orderLegacyId) {
    return {
      fraud_analysis: {
        available: false,
        recommendation: null,
        level: "unknown",
        reasons: [],
        signals: [],
        unavailable_reason: "missing_order_id",
      },
    };
  }

  const graphqlQuery = `
    query OrderRisk($id: ID!) {
      order(id: $id) {
        risk {
          recommendation
          assessments {
            riskLevel
            provider {
              title
            }
            facts {
              description
              sentiment
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { id: `gid://shopify/Order/${orderLegacyId}` },
  });
  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (!error) {
    const risk = data?.data?.order?.risk || null;
    if (!risk) {
      return {
        fraud_analysis: {
          available: true,
          recommendation: null,
          level: "unknown",
          reasons: [],
          signals: [],
        },
      };
    }

    const recommendation = String(risk.recommendation || "").trim().toUpperCase() || null;
    const assessments = Array.isArray(risk.assessments) ? risk.assessments : [];
    const reasons = [];
    const signals = assessments.map((assessment) => {
      const provider = String(assessment?.provider?.title || "").trim();
      const level = String(assessment?.riskLevel || "").trim().toUpperCase();
      const facts = Array.isArray(assessment?.facts) ? assessment.facts : [];
      const message = facts
        .map((fact) => String(fact?.description || "").trim())
        .filter(Boolean)
        .join(" | ");
      if (message && !reasons.includes(message)) {
        reasons.push(message);
      }
      return {
        source: provider || null,
        recommendation: level || null,
        score: null,
        message: message || null,
        display: true,
        cause_cancel: level === "HIGH",
      };
    });

    return {
      fraud_analysis: {
        available: true,
        recommendation,
        level: mapRecommendationToLevel(recommendation),
        reasons: reasons.slice(0, 10),
        signals,
      },
    };
  }

  return {
    fraud_analysis: {
      available: false,
      recommendation: null,
      level: "unknown",
      reasons: [],
      signals: [],
      unavailable_reason: `shopify_risk_status_${error.status || 502}`,
    },
  };
}

async function fetchCustomerProfile({ token, customerId }) {
  const customerGid = toCustomerGid(customerId);
  if (customerGid === "invalid" || !customerGid) {
    return { error: { status: 400, body: "customer_id must be a Shopify customer id or gid" } };
  }

  const query = `
    query CustomerProfile($id: ID!) {
      customer(id: $id) {
        id
        legacyResourceId
        firstName
        lastName
        email
        phone
        defaultEmailAddress {
          marketingState
          marketingOptInLevel
          marketingUpdatedAt
        }
        defaultPhoneNumber {
          marketingState
          marketingOptInLevel
          marketingUpdatedAt
        }
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        lastOrder {
          name
          createdAt
          processedAt
        }
        orders(first: 50, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              name
              createdAt
              processedAt
              lineItems(first: 100) {
                edges {
                  node {
                    title
                    sku
                    quantity
                    sellingPlan {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const payload = JSON.stringify({ query, variables: { id: customerGid } });
  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const customer = data?.data?.customer;
  if (!customer) {
    return { error: { status: 404, body: "Customer not found" } };
  }

  const orders = (customer.orders?.edges || []).map(({ node }) => ({
    name: node?.name || "",
    created_at: node?.createdAt || null,
    processed_at: node?.processedAt || null,
    line_items: (node?.lineItems?.edges || []).map(({ node: line }) => ({
      sku: line?.sku || "",
      title: line?.title || "",
      quantity: Number(line?.quantity || 0),
      selling_plan_name: line?.sellingPlan?.name || "",
    })),
  }));

  const subMap = new Map();
  orders.forEach((order) => {
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    lineItems.forEach((line) => {
      const planName = line?.selling_plan_name || "";
      if (!planName) return;
      const sku = String(line.sku || "").trim();
      const key = `${sku}::${planName}`;
      if (!subMap.has(key)) {
        subMap.set(key, {
          sku,
          title: line.title || "",
          selling_plan: planName,
          quantity: Number(line.quantity || 0),
          last_order_at: order.processed_at || order.created_at || null,
        });
      } else {
        const current = subMap.get(key);
        current.quantity += Number(line.quantity || 0);
        if (!current.last_order_at || (order.processed_at && order.processed_at > current.last_order_at)) {
          current.last_order_at = order.processed_at || order.created_at || current.last_order_at;
        }
      }
    });
  });

  const subscriptions = Array.from(subMap.values())
    .sort((a, b) => String(b.last_order_at || "").localeCompare(String(a.last_order_at || "")))
    .slice(0, 15);

  const recentOrder = orders[0] || null;
  const emailMarketingStateRaw = String(customer.defaultEmailAddress?.marketingState || "").trim();
  const smsMarketingStateRaw = String(customer.defaultPhoneNumber?.marketingState || "").trim();
  const emailMarketingState = emailMarketingStateRaw ? emailMarketingStateRaw.toLowerCase() : "unknown";
  const smsMarketingState = smsMarketingStateRaw ? smsMarketingStateRaw.toLowerCase() : "unknown";
  const emailSubscribedStates = new Set(["SUBSCRIBED", "SUBSCRIBED_EXPLICITLY"]);
  const smsSubscribedStates = new Set(["SUBSCRIBED"]);
  const profile = {
    id: customer.legacyResourceId || customer.id,
    first_name: customer.firstName || "",
    last_name: customer.lastName || "",
    email: customer.email || "",
    phone: customer.phone || "",
    orders_count: Number(customer.numberOfOrders || orders.length || 0),
    lifetime_value: customer.amountSpent?.amount || "0.00",
    currency: customer.amountSpent?.currencyCode || "USD",
    last_order_at: customer.lastOrder?.processedAt || customer.lastOrder?.createdAt || recentOrder?.processed_at || recentOrder?.created_at || null,
    last_order_name: customer.lastOrder?.name || recentOrder?.name || "",
    email_marketing_state: emailMarketingState,
    sms_marketing_state: smsMarketingState,
    accepts_marketing: emailSubscribedStates.has(emailMarketingStateRaw) || smsSubscribedStates.has(smsMarketingStateRaw),
    subscriptions,
  };

  return { profile };
}

async function getAppliedDiscountFromCode({ token, code }) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) {
    return { error: { status: 400, body: "Discount code required" } };
  }

  const query = `
    query DiscountByCode($query: String!) {
      discountNodes(first: 1, query: $query) {
        edges {
          node {
            id
            discount {
              __typename
              ... on DiscountCodeBasic {
                title
                customerGets {
                  value {
                    __typename
                    ... on DiscountPercentage {
                      percentage
                    }
                    ... on MoneyV2 {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const payload = JSON.stringify({
    query,
    variables: { query: `code:${normalizedCode}` },
  });
  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const edge = data?.data?.discountNodes?.edges?.[0];
  const discount = edge?.node?.discount;
  if (!discount || discount.__typename !== "DiscountCodeBasic") {
    return { error: { status: 404, body: "Discount code not found or unsupported" } };
  }

  const valueNode = discount?.customerGets?.value || {};
  let valueType = null;
  let value = null;
  if (valueNode.__typename === "DiscountPercentage") {
    valueType = "PERCENTAGE";
    value = Number(valueNode.percentage || 0);
  } else if (valueNode.__typename === "MoneyV2") {
    valueType = "FIXED_AMOUNT";
    value = Number(valueNode.amount || 0);
  }
  if (!valueType || !Number.isFinite(value) || value <= 0) {
    return { error: { status: 400, body: "Unsupported discount value type" } };
  }
  return {
    applied_discount: {
      title: discount.title || normalizedCode,
      value,
      valueType,
    },
  };
}

async function fetchCustomersGraphql({ token, query, limit }) {
  const graphqlQuery = `
    query Customers($first: Int!, $query: String!) {
      customers(first: $first, query: $query) {
        edges {
          node {
            id
            legacyResourceId
            firstName
            lastName
            email
            phone
            state
            tags
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: {
      first: limit,
      query,
    },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const edges = data?.data?.customers?.edges || [];
  return {
    customers: edges.map(({ node }) => ({
      id: node.legacyResourceId || node.id,
      gid: node.id,
      first_name: node.firstName || "",
      last_name: node.lastName || "",
      email: node.email || "",
      phone: node.phone || "",
      state: node.state || "",
      tags: Array.isArray(node.tags) ? node.tags.join(", ") : (node.tags || ""),
    })),
  };
}

async function fetchCustomerByIdGraphql({ token, customerId }) {
  const graphqlQuery = `
    query($id: ID!) {
      customer(id: $id) {
        id
        legacyResourceId
        firstName
        lastName
        email
        phone
        state
        tags
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { id: customerId },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const customer = data?.data?.customer;
  if (!customer) return { customers: [] };

  return {
    customers: [
      {
        id: customer.legacyResourceId || customer.id,
        gid: customer.id,
        first_name: customer.firstName || "",
        last_name: customer.lastName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        state: customer.state || "",
        tags: Array.isArray(customer.tags) ? customer.tags.join(", ") : (customer.tags || ""),
      },
    ],
  };
}

function toCustomerIdFromSegmentMember(gid) {
  if (!gid) return null;
  return gid.replace("CustomerSegmentMember", "Customer");
}

async function fetchCustomersBySwansonId({ token, swansonId, limit }) {
  const graphqlQuery = `
    query($first: Int!, $query: String!) {
      customerSegmentMembers(first: $first, query: $query) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: {
      first: limit,
      query: `metafields.swanson.id = ${swansonId}`,
    },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const edges = data?.data?.customerSegmentMembers?.edges || [];
  const customers = [];

  for (const edge of edges) {
    const customerId = toCustomerIdFromSegmentMember(edge?.node?.id);
    if (!customerId) continue;
    const result = await fetchCustomerByIdGraphql({ token, customerId });
    if (result.error) return result;
    if (result.customers && result.customers.length) {
      customers.push(...result.customers);
    }
    if (customers.length >= limit) break;
  }

  return { customers };
}

async function fetchCustomerByMetafieldGid({ token, metafieldGid }) {
  const graphqlQuery = `
    query($id: ID!) {
      node(id: $id) {
        __typename
        ... on Metafield {
          id
          value
          owner {
            ... on Customer {
              id
              legacyResourceId
              firstName
              lastName
              email
              phone
              state
              tags
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { id: metafieldGid },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const node = data?.data?.node;
  if (!node || node.__typename !== "Metafield") {
    return { customers: [] };
  }

  const owner = node.owner;
  if (!owner || !owner.id) {
    return { customers: [] };
  }

  return {
    customers: [
      {
        id: owner.legacyResourceId || owner.id,
        gid: owner.id,
        first_name: owner.firstName || "",
        last_name: owner.lastName || "",
        email: owner.email || "",
        phone: owner.phone || "",
        state: owner.state || "",
        tags: Array.isArray(owner.tags) ? owner.tags.join(", ") : (owner.tags || ""),
        metafield_value: node.value || "",
      },
    ],
  };
}

async function fetchCustomerOrders({ token, customerId }) {
  const customerQuery = `
    query($id: ID!) {
      customer(id: $id) {
        id
        legacyResourceId
        orders(first: 10, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              legacyResourceId
              name
              processedAt
              displayFinancialStatus
              displayFulfillmentStatus
              fulfillments(first: 10) {
                id
                status
                trackingInfo {
                  number
                  url
                  company
                }
                fulfillmentLineItems(first: 50) {
                  edges {
                    node {
                      quantity
                      lineItem {
                        id
                        sku
                        title
                      }
                    }
                  }
                }
              }
              totalPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              sku
              quantity
              image {
                url
                altText
              }
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              variant {
                image {
                  url
                  altText
                }
                product {
                  featuredImage {
                    url
                    altText
                  }
                }
              }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const customerPayload = JSON.stringify({
    query: customerQuery,
    variables: { id: customerId },
  });

  const { error: customerError, data: customerData } = await shopifyGraphqlRequest({
    token,
    payload: customerPayload,
  });
  if (customerError) return { error: customerError };

  const customer = customerData?.data?.customer;
  const orderEdges = customer?.orders?.edges || [];
  const orders = orderEdges.map(({ node }) => ({
    ...(function buildOrderShape() {
      const shipments = (node.fulfillments || []).map((f) => ({
        id: f.id || "",
        status: f.status || null,
        tracking: (f.trackingInfo || []).map((t) => ({
          number: t.number || "",
          url: t.url || "",
          company: t.company || "",
        })).filter((t) => t.number || t.url),
        line_items: ((f.fulfillmentLineItems?.edges) || []).map(({ node: li }) => ({
          line_item_id: li?.lineItem?.id || "",
          sku: li?.lineItem?.sku || "",
          title: li?.lineItem?.title || "",
          quantity: Number(li?.quantity || 0),
        })),
      }));

      const fulfilledByLine = {};
      shipments.forEach((shipment) => {
        shipment.line_items.forEach((line) => {
          if (!line.line_item_id) return;
          fulfilledByLine[line.line_item_id] = (fulfilledByLine[line.line_item_id] || 0) + (line.quantity || 0);
        });
      });

      const trackingNumbers = [];
      const trackingUrls = [];
      const trackingCompanies = [];
      shipments.forEach((shipment) => {
        shipment.tracking.forEach((track) => {
          if (track.number) trackingNumbers.push(track.number);
          if (track.url) trackingUrls.push(track.url);
          if (track.company) trackingCompanies.push(track.company);
        });
      });

      return {
        shipments,
        tracking_numbers: trackingNumbers,
        tracking_urls: trackingUrls,
        tracking_companies: trackingCompanies,
        latest_status: shipments[0]?.status || node.displayFulfillmentStatus || null,
        fulfilled_by_line: fulfilledByLine,
      };
    })(),
    id: node.id,
    legacy_id: node.legacyResourceId,
    name: node.name,
    processed_at: node.processedAt,
    financial_status: node.displayFinancialStatus,
    fulfillment_status: node.displayFulfillmentStatus,
    total: node.totalPriceSet?.presentmentMoney?.amount || null,
    currency: node.totalPriceSet?.presentmentMoney?.currencyCode || null,
    line_items: (node.lineItems?.edges || []).map(({ node: line }) => ({
      title: line.title || "",
      sku: line.sku || "",
      quantity: line.quantity || 0,
      line_item_id: line.id || "",
      fulfilled_quantity: Number((function getFulfilledQty() {
        const lineId = line.id || "";
        if (!lineId) return 0;
        return (node.fulfillments || []).reduce((acc, fulfillment) => {
          const edges = fulfillment?.fulfillmentLineItems?.edges || [];
          const add = edges.reduce((sum, { node: fli }) => {
            if ((fli?.lineItem?.id || "") !== lineId) return sum;
            return sum + Number(fli?.quantity || 0);
          }, 0);
          return acc + add;
        }, 0);
      })()),
      total_amount: line.discountedTotalSet?.shopMoney?.amount || null,
      currency: line.discountedTotalSet?.shopMoney?.currencyCode || null,
      image_url: line.image?.url || line.variant?.image?.url || line.variant?.product?.featuredImage?.url || null,
      image_alt: line.image?.altText || line.variant?.image?.altText || line.variant?.product?.featuredImage?.altText || "",
    })),
  }));

  await Promise.all(orders.map(async (order) => {
    const riskResult = await fetchOrderFraudAnalysis({
      token,
      orderLegacyId: order.legacy_id,
    });
    order.fraud_analysis = riskResult.fraud_analysis;
  }));

  const legacyId = customer?.legacyResourceId || toCustomerLegacyId(customerId);
  const draftQuery = `
    query($query: String!) {
      draftOrders(first: 10, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            legacyResourceId
            name
            createdAt
            updatedAt
            status
            invoiceUrl
            totalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  sku
                  quantity
                  variant {
                    image {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const draftPayload = JSON.stringify({
    query: draftQuery,
    variables: { query: legacyId ? `customer_id:${legacyId}` : "" },
  });

  const { error: draftError, data: draftData } = await shopifyGraphqlRequest({
    token,
    payload: draftPayload,
  });
  if (draftError) return { error: draftError };

  const draftEdges = draftData?.data?.draftOrders?.edges || [];
  const draftOrders = draftEdges.map(({ node }) => ({
    id: node.id,
    legacy_id: node.legacyResourceId,
    name: node.name,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    status: node.status,
    invoice_url: node.invoiceUrl || null,
    total: node.totalPriceSet?.presentmentMoney?.amount || null,
    currency: node.totalPriceSet?.presentmentMoney?.currencyCode || null,
    line_items: (node.lineItems?.edges || []).map(({ node: line }) => ({
      title: line.title || "",
      sku: line.sku || "",
      quantity: line.quantity || 0,
      image_url: line.variant?.image?.url || null,
      image_alt: line.variant?.image?.altText || "",
    })),
  }));

  const profileResult = await fetchCustomerProfile({ token, customerId });
  return {
    orders,
    draft_orders: draftOrders,
    profile: profileResult.error ? null : (profileResult.profile || null),
  };
}

async function createCustomerAddress({ token, customerId, address, setDefault }) {
  const customerGid = toCustomerGid(customerId);
  if (customerGid === "invalid" || !customerGid) {
    return { error: { status: 400, body: "customer_id must be a Shopify customer id or gid" } };
  }

  const mutation = `
    mutation CustomerAddressCreate($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
      customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
        customerAddress {
          id
          legacyResourceId
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const payload = JSON.stringify({
    query: mutation,
    variables: {
      customerId: customerGid,
      address,
      setAsDefault: Boolean(setDefault),
    },
  });
  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };
  const result = data?.data?.customerAddressCreate;
  const userErrors = result?.userErrors || [];
  if (userErrors.length) {
    return { error: { status: 400, body: JSON.stringify(userErrors) } };
  }
  const legacyId = result?.customerAddress?.legacyResourceId;
  return { address_id: legacyId || result?.customerAddress?.id || null };
}

function splitCustomerName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

async function createCustomer({ token, name, email, phone }) {
  const { first_name, last_name } = splitCustomerName(name);
  const mutation = `
    mutation CustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          legacyResourceId
          firstName
          lastName
          email
          phone
          state
          tags
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const payload = JSON.stringify({
    query: mutation,
    variables: {
      input: {
        firstName: first_name || undefined,
        lastName: last_name || undefined,
        email,
        phone,
      },
    },
  });
  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const result = data?.data?.customerCreate;
  const userErrors = result?.userErrors || [];
  if (userErrors.length) {
    return { error: { status: 400, body: JSON.stringify(userErrors) } };
  }
  const customer = result?.customer;
  return {
    customer: customer
      ? {
          id: customer.legacyResourceId || customer.id,
          gid: customer.id,
          first_name: customer.firstName || "",
          last_name: customer.lastName || "",
          email: customer.email || "",
          phone: customer.phone || "",
          state: customer.state || "",
          tags: Array.isArray(customer.tags) ? customer.tags.join(", ") : "",
        }
      : null,
  };
}

async function fetchVariantPricing({ token, variantIds }) {
  const ids = Array.from(new Set((variantIds || []).map((id) => toVariantGid(id)).filter(Boolean)));
  if (!ids.length) return { pricing: new Map() };

  const now = Date.now();
  const pricing = new Map();
  const cacheMissIds = [];
  ids.forEach((id) => {
    const cached = variantPricingCache.get(id);
    if (cached && cached.expiresAt > now) {
      pricing.set(id, cached.value);
    } else {
      variantPricingCache.delete(id);
      cacheMissIds.push(id);
    }
  });

  if (!cacheMissIds.length) return { pricing };

  const graphqlQuery = `
    query($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          metafield(namespace: "catalog_pricing", key: "variant_pricing") {
            value
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { ids: cacheMissIds },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const nodes = data?.data?.nodes || [];
  const seen = new Set();
  nodes.forEach((node) => {
    if (!node || !node.id) return;
    const value = node.metafield?.value || "";
    pricing.set(node.id, value);
    variantPricingCache.set(node.id, { value, expiresAt: now + BOGO_VARIANT_PRICING_CACHE_TTL_MS });
    seen.add(node.id);
  });
  cacheMissIds.forEach((id) => {
    if (seen.has(id)) return;
    pricing.set(id, "");
    variantPricingCache.set(id, { value: "", expiresAt: now + BOGO_VARIANT_PRICING_CACHE_TTL_MS });
  });

  return { pricing };
}

async function applyBogoRules({ token, lineItems, discountCodes }) {
  const variantIds = lineItems.map((item) => item.variantId).filter(Boolean);
  if (!variantIds.length) return { lineItems, discountCodes };

  const pricingResult = await fetchVariantPricing({ token, variantIds });
  if (pricingResult.error) return pricingResult;

  const pricingMap = pricingResult.pricing;
  let needsBogo = false;
  const updatedItems = lineItems.map((item) => {
    const pricingValue = pricingMap.get(item.variantId);
    if (isBogoPricing(pricingValue)) {
      needsBogo = true;
      return { ...item, quantity: roundUpToEven(item.quantity) };
    }
    return item;
  });

  const codes = Array.isArray(discountCodes) ? [...discountCodes] : [];
  if (needsBogo && !codes.includes("INT999")) {
    codes.push("INT999");
  }

  return { lineItems: updatedItems, discountCodes: codes };
}

async function cancelOrder({ token, orderId }) {
  const mutation = `
    mutation OrderCancel($orderId: ID!) {
      orderCancel(orderId: $orderId, notifyCustomer: false, restock: true, reason: OTHER) {
        job {
          id
        }
        orderCancelUserErrors {
          field
          message
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: mutation,
    variables: { orderId },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const result = data?.data?.orderCancel;
  const errors = (result?.userErrors || []).concat(result?.orderCancelUserErrors || []);
  if (errors.length) {
    return { error: { status: 400, body: JSON.stringify(errors) } };
  }

  return { job: result?.job || null };
}

async function fetchOrderForRefund({ token, orderId }) {
  const query = `
    query($id: ID!) {
      order(id: $id) {
        id
        name
        lineItems(first: 50) {
          edges {
            node {
              id
              quantity
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        transactions {
          id
          kind
          status
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query,
    variables: { id: orderId },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };
  return { order: data?.data?.order || null };
}

function pickRefundTransaction(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];
  const preferred = list.find((t) => t.status === "SUCCESS" && (t.kind === "SALE" || t.kind === "CAPTURE"));
  return preferred || list.find((t) => t.status === "SUCCESS") || null;
}

function normalizeRefundLineItems(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      line_item_id: String(item.line_item_id || item.lineItemId || "").trim(),
      quantity: Number(item.quantity || 0),
    }))
    .filter((item) => item.line_item_id && Number.isFinite(item.quantity) && item.quantity > 0);
}

async function refundOrder({ token, orderId, lineItemsInput }) {
  const { error, order } = await fetchOrderForRefund({ token, orderId });
  if (error) return { error };
  if (!order) return { error: { status: 404, body: "order not found" } };

  const transaction = pickRefundTransaction(order.transactions || []);
  if (!transaction?.id) {
    return { error: { status: 400, body: "no refundable transactions found" } };
  }

  const orderLineItems = (order.lineItems?.edges || [])
    .map(({ node }) => ({
      id: node.id,
      quantity: node.quantity,
      total_amount: node.discountedTotalSet?.shopMoney?.amount || null,
      currency: node.discountedTotalSet?.shopMoney?.currencyCode || null,
    }));

  const requested = normalizeRefundLineItems(lineItemsInput);
  const lineItems = requested.length
    ? requested.map((item) => {
      const match = orderLineItems.find((li) => li.id === item.line_item_id);
      if (!match) return null;
      const qty = Math.min(item.quantity, match.quantity);
      return { lineItemId: match.id, quantity: qty, total_amount: match.total_amount, currency: match.currency, max_quantity: match.quantity };
    }).filter(Boolean)
    : orderLineItems.map((li) => ({ lineItemId: li.id, quantity: li.quantity, total_amount: li.total_amount, currency: li.currency, max_quantity: li.quantity }))
        .filter((item) => item.lineItemId && item.quantity > 0);

  if (!lineItems.length) {
    return { error: { status: 400, body: "no line items to refund" } };
  }

  let amount = null;
  const currency = lineItems.find((item) => item.currency)?.currency || transaction.amountSet?.shopMoney?.currencyCode || null;
  if (lineItems.every((item) => item.total_amount && item.max_quantity)) {
    const total = lineItems.reduce((sum, item) => {
      const unit = Number(item.total_amount || 0) / Number(item.max_quantity || 1);
      return sum + unit * item.quantity;
    }, 0);
    amount = total > 0 ? total.toFixed(2) : null;
  }

  const refundInput = {
    orderId,
    refundLineItems: lineItems.map((item) => ({ lineItemId: item.lineItemId, quantity: item.quantity })),
    transactions: amount && currency
      ? [{ parentId: transaction.id, amount, kind: "REFUND", currency }]
      : [{ parentId: transaction.id, kind: "REFUND" }],
  };

  const mutation = `
    mutation RefundCreate($input: RefundInput!) {
      refundCreate(input: $input) {
        refund {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: mutation,
    variables: { input: refundInput },
  });

  const { error: refundError, data: refundData } = await shopifyGraphqlRequest({ token, payload });
  if (refundError) return { error: refundError };
  const result = refundData?.data?.refundCreate;
  const errors = result?.userErrors || [];
  if (errors.length) {
    return { error: { status: 400, body: JSON.stringify(errors) } };
  }
  return { refund: result?.refund || null };
}

async function shopifyGraphqlRequest({ token, payload }) {
  let lastError = null;
  const maxAttempts = Math.max(1, SHOPIFY_GRAPHQL_MAX_RETRIES + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { status, body, headers } = await httpsRequest(
        {
          method: "POST",
          hostname: `${STORE}.myshopify.com`,
          path: `/admin/api/${API_VERSION}/graphql.json`,
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        payload
      );

      if (status < 200 || status >= 300) {
        if (attempt < maxAttempts && isRetriableHttpStatus(status)) {
          await sleep(computeBackoffMs(attempt, parseRetryAfterMs(headers)));
          continue;
        }
        return { error: { status, body } };
      }

      let data;
      try {
        data = JSON.parse(body || "{}");
      } catch (err) {
        lastError = { status: 502, body: "Invalid JSON from Shopify GraphQL" };
        if (attempt < maxAttempts) {
          await sleep(computeBackoffMs(attempt));
          continue;
        }
        return { error: lastError };
      }

      if (Array.isArray(data.errors) && data.errors.length) {
        const errorBody = JSON.stringify(data.errors).slice(0, 2000);
        if (attempt < maxAttempts && shouldRetryGraphqlErrors(data.errors)) {
          await sleep(computeBackoffMs(attempt, parseRetryAfterMs(headers)));
          continue;
        }
        return { error: { status: 502, body: errorBody } };
      }

      const cost = data?.extensions?.cost || null;
      if (cost?.throttleStatus) {
        console.log(`[graphql_cost] requested=${cost.requestedQueryCost || 0} actual=${cost.actualQueryCost || 0} available=${cost.throttleStatus.currentlyAvailable || 0}`);
      }
      return { data };
    } catch (err) {
      lastError = {
        status: 502,
        body: String(err?.message || err || "Unknown GraphQL request error").slice(0, 2000),
      };
      if (attempt < maxAttempts && isRetriableNetworkError(err)) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      return { error: lastError };
    }
  }

  return { error: lastError || { status: 502, body: "Unknown GraphQL request failure" } };
}

function toCustomerGid(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("gid://shopify/Customer/")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Customer/${trimmed}`;
  return "invalid";
}

async function fetchCustomerAddresses({ token, customerId }) {
  const graphqlQuery = `
    query($id: ID!) {
      customer(id: $id) {
        id
        legacyResourceId
        email
        defaultAddress {
          id
          address1
          address2
          city
          province
          provinceCode
          zip
          country
          countryCodeV2
          phone
          company
          name
        }
        addresses {
          id
          address1
          address2
          city
          province
          provinceCode
          zip
          country
          countryCodeV2
          phone
          company
          name
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { id: customerId },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const customer = data?.data?.customer;
  if (!customer) return { customer: null, addresses: [] };

  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  return {
    customer: {
      id: customer.legacyResourceId || customer.id,
      gid: customer.id,
      email: customer.email || "",
    },
    defaultAddress: customer.defaultAddress || null,
    addresses,
  };
}

async function createDraftOrder({ token, input }) {
  const graphqlQuery = `
    mutation DraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          legacyResourceId
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { input },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const result = data?.data?.draftOrderCreate;
  const errors = result?.userErrors || [];
  if (errors.length) {
    return { error: { status: 400, body: JSON.stringify(errors).slice(0, 2000) } };
  }

  return { draftOrder: result?.draftOrder || null };
}

async function updateDraftOrder({ token, id, input }) {
  const graphqlQuery = `
    mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
      draftOrderUpdate(id: $id, input: $input) {
        draftOrder {
          id
          legacyResourceId
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: {
      id,
      input,
    },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const result = data?.data?.draftOrderUpdate;
  const errors = result?.userErrors || [];
  if (errors.length) {
    return { error: { status: 400, body: JSON.stringify(errors).slice(0, 2000) } };
  }

  return { draftOrder: result?.draftOrder || null };
}

async function fetchDraftOrder({ token, id }) {
  const graphqlQuery = `
    query($id: ID!) {
      draftOrder(id: $id) {
        id
        legacyResourceId
        name
        status
        invoiceUrl
        subtotalPrice
        totalPrice
        totalTax
        shippingAddress {
          validationResultSummary
        }
        totalDiscountsSet {
          presentmentMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          legacyResourceId
          email
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              quantity
              sku
              variant {
                id
                sku
                title
                product {
                  title
                  featuredImage {
                    url
                    altText
                  }
                }
                image {
                  url
                  altText
                }
              }
              title
              originalUnitPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              totalDiscountSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { id },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  return { draftOrder: data?.data?.draftOrder || null };
}

function normalizeIdempotencyKey(input) {
  const key = String(input || "").trim();
  if (!key) return "";
  return key.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
}

function getDraftCreateIdempotencyKey({ event, body }) {
  const headers = event?.headers || {};
  return normalizeIdempotencyKey(
    body?.idempotency_key
      || body?.idempotencyKey
      || headers["x-idempotency-key"]
      || headers["X-Idempotency-Key"]
      || ""
  );
}

function pruneDraftCreateIdempotencyCache() {
  const now = Date.now();
  for (const [key, value] of draftCreateIdempotencyCache.entries()) {
    if (!value || value.expiresAt <= now) {
      draftCreateIdempotencyCache.delete(key);
    }
  }
}

function getCachedIdempotentDraftGid(cacheKey) {
  if (!cacheKey) return "";
  pruneDraftCreateIdempotencyCache();
  const entry = draftCreateIdempotencyCache.get(cacheKey);
  if (!entry || !entry.draftGid) return "";
  return entry.draftGid;
}

function setCachedIdempotentDraftGid(cacheKey, draftGid) {
  if (!cacheKey || !draftGid) return;
  draftCreateIdempotencyCache.set(cacheKey, {
    draftGid,
    expiresAt: Date.now() + DRAFT_CREATE_IDEMPOTENCY_TTL_MS,
  });
}

function mapVariantNode(node) {
  return {
    id: node.id,
    sku: node.sku || "",
    title: node.title || "",
    price: node.price || "",
    inventory_quantity: node.inventoryQuantity ?? null,
    variant_pricing: node.metafield?.value || "",
    bogo: isBogoPricing(node.metafield?.value),
    restricted_states: node.restrictedStates?.value || node.product?.restrictedStates?.value || "",
    image_url: node.image?.url || node.product?.featuredImage?.url || "",
    image_alt: node.image?.altText || node.product?.featuredImage?.altText || "",
    product: node.product
      ? {
          id: node.product.id,
          title: node.product.title || "",
          handle: node.product.handle || "",
          status: node.product.status || "",
        }
      : null,
  };
}

async function fetchSkusWithQuery({ token, query, limit }) {
  const graphqlQuery = `
    query($first: Int!, $query: String!) {
      productVariants(first: $first, query: $query) {
        edges {
          node {
            id
            sku
            title
            price
            inventoryQuantity
            metafield(namespace: "catalog_pricing", key: "variant_pricing") {
              value
            }
            restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
              value
            }
            image {
              url
              altText
            }
            product {
              id
              title
              handle
              status
              restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
                value
              }
              featuredImage {
                url
                altText
              }
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: {
      first: limit,
      query,
    },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const edges = data?.data?.productVariants?.edges || [];
  return {
    count: edges.length,
    variants: edges.map(({ node }) => mapVariantNode(node)),
  };
}

async function fetchVariantByGid({ token, id }) {
  const graphqlQuery = `
    query($id: ID!) {
      node(id: $id) {
        ... on ProductVariant {
          id
          sku
          title
          price
          inventoryQuantity
          metafield(namespace: "catalog_pricing", key: "variant_pricing") {
            value
          }
          restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
            value
          }
          image {
            url
            altText
          }
          product {
            id
            title
            handle
            status
            restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
              value
            }
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }
  `;
  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: { id },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const node = data?.data?.node || null;
  if (!node) return { variant: null };
  return { variant: mapVariantNode(node) };
}

async function fetchSkuFromProductsSearch({ token, sku, limit }) {
  const graphqlQuery = `
    query($first: Int!, $query: String!) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            status
            restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
              value
            }
            featuredImage {
              url
              altText
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  title
                  price
                  inventoryQuantity
                  metafield(namespace: "catalog_pricing", key: "variant_pricing") {
                    value
                  }
                  restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
                    value
                  }
                  image {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: {
      first: limit,
      query: `sku:${sku}`,
    },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const productEdges = data?.data?.products?.edges || [];
  const normalized = normalizeSku(sku);
  const matches = [];
  productEdges.forEach(({ node }) => {
    const product = node || {};
    const variantEdges = product.variants?.edges || [];
    variantEdges.forEach(({ node: variantNode }) => {
      if (normalizeSku(variantNode?.sku) !== normalized) return;
      const merged = {
        ...variantNode,
        product: {
          id: product.id,
          title: product.title || "",
          handle: product.handle || "",
          status: product.status || "",
          restrictedStates: product.restrictedStates,
          featuredImage: product.featuredImage,
        },
      };
      matches.push(mapVariantNode(merged));
    });
  });

  return { count: matches.length, variants: matches };
}

async function fetchProductsByTitle({ token, query, limit }) {
  const graphqlQuery = `
    query($first: Int!, $query: String!) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            status
            restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
              value
            }
            featuredImage {
              url
              altText
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  title
                  price
                  inventoryQuantity
                  metafield(namespace: "catalog_pricing", key: "variant_pricing") {
                    value
                  }
                  restrictedStates: metafield(namespace: "shipping", key: "restricted_states") {
                    value
                  }
                  image {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query: graphqlQuery,
    variables: {
      first: limit,
      query: `title:*${query}*`,
    },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const productEdges = data?.data?.products?.edges || [];
  const matches = [];
  productEdges.forEach(({ node }) => {
    const product = node || {};
    const variantEdges = product.variants?.edges || [];
    variantEdges.forEach(({ node: variantNode }) => {
      const merged = {
        ...variantNode,
        product: {
          id: product.id,
          title: product.title || "",
          handle: product.handle || "",
          status: product.status || "",
          restrictedStates: product.restrictedStates,
          featuredImage: product.featuredImage,
        },
      };
      matches.push(mapVariantNode(merged));
    });
  });

  return { count: matches.length, variants: matches };
}

async function fetchSkus({ token, sku, limit }) {
  const normalized = normalizeSku(sku);
  const queries = [
    `sku:${sku}`,
    `sku:'${sku}'`,
    `sku:\"${sku}\"`,
  ];
  for (const query of queries) {
    const result = await fetchSkusWithQuery({ token, query, limit });
    if (result.error) return { error: result.error };
    const exact = (result.variants || []).filter((v) => normalizeSku(v.sku) === normalized);
    if (exact.length) {
      return { count: exact.length, variants: exact };
    }
  }
  const productSearch = await fetchSkuFromProductsSearch({ token, sku, limit });
  if (productSearch.error) return { error: productSearch.error };
  if (productSearch.variants?.length) {
    return productSearch;
  }
  return { count: 0, variants: [] };
}

function parseJsonBody(event) {
  const raw = event.body || "";
  if (!raw) return { value: null };
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    return { error: "Invalid JSON body" };
  }
}

function safeString(value, maxLen = 500) {
  const raw = String(value === undefined || value === null ? "" : value).trim();
  if (!raw) return "";
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

function toUnixEpochSeconds(dateLike) {
  const parsed = new Date(dateLike || Date.now());
  if (Number.isNaN(parsed.getTime())) return Math.floor(Date.now() / 1000);
  return Math.floor(parsed.getTime() / 1000);
}

function buildAuditItem({ actor, ticketId, reason, eventType, detail, atIso }) {
  const nowIso = new Date().toISOString();
  const eventIso = safeString(atIso, 80) || nowIso;
  const eventEpoch = toUnixEpochSeconds(eventIso);
  const actorId = safeString(actor?.id, 120);
  const actorName = safeString(actor?.name, 200);
  const actorEmail = safeString(actor?.email, 320);
  const ticket = safeString(ticketId, 120) || "new_unsaved";
  const idSuffix = crypto.randomBytes(6).toString("hex");
  const createdAtEpoch = Math.floor(Date.now() / 1000);
  const ttlDays = Number.isFinite(AUDIT_LOG_TTL_DAYS) && AUDIT_LOG_TTL_DAYS > 0 ? Math.floor(AUDIT_LOG_TTL_DAYS) : 90;

  return {
    pk: `TICKET#${ticket}`,
    sk: `AT#${eventIso}#${idSuffix}`,
    ticket_id: ticket,
    actor_id: actorId || null,
    actor_name: actorName || null,
    actor_email: actorEmail || null,
    reason: safeString(reason, 120) || "auto",
    event_type: safeString(eventType, 120) || "event",
    detail: safeString(detail, 2000) || "",
    event_at_iso: eventIso,
    event_at_epoch: eventEpoch,
    created_at_iso: nowIso,
    expires_at: createdAtEpoch + (ttlDays * 24 * 60 * 60),
  };
}

async function persistAuditEvents({ actor, ticketId, reason, events }) {
  const sourceEvents = Array.isArray(events) ? events : [];
  if (!sourceEvents.length) {
    return { stored: 0, mode: AUDIT_LOG_TABLE ? "dynamodb" : "cloudwatch" };
  }

  const items = sourceEvents.map((event) => buildAuditItem({
    actor,
    ticketId,
    reason,
    eventType: event?.type,
    detail: event?.detail,
    atIso: event?.at,
  }));

  if (!AUDIT_LOG_TABLE) {
    console.log("AUDIT_EVENTS", JSON.stringify({ ticket_id: ticketId || null, reason: reason || "auto", items }));
    return { stored: items.length, mode: "cloudwatch" };
  }

  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    await documentClient.send(new BatchWriteCommand({ RequestItems: { [AUDIT_LOG_TABLE]: batch } }));
  }
  return { stored: items.length, mode: "dynamodb", table: AUDIT_LOG_TABLE };
}

function normalizeAddressInput(input) {
  if (!input || typeof input !== "object") return null;

  const address = {
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    province: input.province,
    provinceCode: input.provinceCode,
    zip: input.zip,
    country: input.country,
    phone: input.phone,
    company: input.company,
  };

  const firstName = input.firstName || input.first_name;
  const lastName = input.lastName || input.last_name;
  if (firstName) address.firstName = firstName;
  if (lastName) address.lastName = lastName;

  if (!firstName && !lastName && input.name) {
    const parts = String(input.name).trim().split(/\s+/);
    if (parts.length) {
      address.firstName = parts.shift();
      if (parts.length) address.lastName = parts.join(" ");
    }
  }

  return Object.fromEntries(Object.entries(address).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function buildDraftAddressUpdateInput(body) {
  const shippingAddress = normalizeAddressInput(body.shipping_address || body.shippingAddress);
  const billingAddress = normalizeAddressInput(body.billing_address || body.billingAddress);
  const billingSame = body.billing_same_as_shipping || body.billingSameAsShipping;

  const input = {};
  if (shippingAddress) input.shippingAddress = shippingAddress;
  if (billingAddress) input.billingAddress = billingAddress;
  if (billingSame && shippingAddress && !billingAddress) {
    input.billingAddress = shippingAddress;
  }

  return Object.keys(input).length ? input : null;
}

function normalizeShippingLineInput(input) {
  if (!input || typeof input !== "object") return null;
  const title = String(input.title || input.speed || "").trim();
  const rawAmount = input.amount ?? input.cost ?? input.price;
  const amountNum = rawAmount === undefined || rawAmount === null || rawAmount === ""
    ? null
    : Number(rawAmount);

  if (!title && amountNum === null) return null;
  if (amountNum !== null && (!Number.isFinite(amountNum) || amountNum < 0)) return null;

  const currency = String(
    input.currency_code || input.currencyCode || input.currency || "USD"
  ).trim().toUpperCase();

  return {
    title: title || "Shipping",
    priceWithCurrency: {
      amount: (amountNum === null ? 0 : amountNum).toFixed(2),
      currencyCode: currency || "USD",
    },
  };
}

function buildDraftCustomAttributes(body) {
  if (!body || typeof body !== "object") return [];
  const attributes = [];
  const pushAttribute = (keyInput, valueInput) => {
    const key = String(keyInput || "").trim();
    const value = valueInput === undefined || valueInput === null ? "" : String(valueInput).trim();
    if (!key || !value) return;
    attributes.push({ key, value });
  };

  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  for (const [key, value] of Object.entries(metadata)) {
    pushAttribute(key, value);
  }

  const agentId =
    body.agent_id
    || body.agentId
    || metadata["agnoStack-metadata.agent_id"]
    || body["agnoStack-metadata.agent_id"]
    || "";
  pushAttribute("agnoStack-metadata.agent_id", agentId);

  const deduped = new Map();
  for (const entry of attributes) {
    deduped.set(entry.key, entry.value);
  }
  return Array.from(deduped.entries()).slice(0, 50).map(([key, value]) => ({ key, value }));
}

exports.handler = async (event) => {
  try {
    if (!STORE) return respond(500, { error: "Missing SHOPIFY_STORE" });

    if (event.httpMethod === "OPTIONS") {
      return respond(200, { ok: true });
    }

    const authResult = authorizeRequest(event);
    if (authResult) return authResult;

    const path = event.path || "";
    if (path.endsWith("/customer_addresses")) {
      if (event.httpMethod !== "GET") {
        return respond(405, { error: "Method not allowed" });
      }
      const params = event.queryStringParameters || {};
      const customerId = toCustomerGid(params.customer_id || params.customerId || "");
      if (customerId === "invalid") {
        return respond(400, { error: "customer_id must be a Shopify customer id or gid" });
      }
      if (!customerId) {
        return respond(400, { error: "customer_id required" });
      }
      const token = await getToken();
      const result = await fetchCustomerAddresses({ token, customerId });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, result);
    }

    if (path.endsWith("/draft_order")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};

      const customerId = toCustomerGid(body.customer_id || body.customerId || "");
      if (customerId === "invalid") {
        return respond(400, { error: "customer_id must be a Shopify customer id or gid" });
      }
      if (!customerId) return respond(400, { error: "customer_id required" });

      const lineItems = Array.isArray(body.line_items || body.lineItems) ? (body.line_items || body.lineItems) : [];
      if (!lineItems.length) {
        return respond(400, { error: "line_items required" });
      }

      let normalizedLineItems = lineItems.map((item) => ({
        variantId: item.variant_id || item.variantId,
        quantity: Number(item.quantity || 1),
        title: item.title,
        originalUnitPrice: item.original_unit_price || item.originalUnitPrice,
      })).filter((item) => item.variantId);

      if (!normalizedLineItems.length) {
        return respond(400, { error: "line_items must include variant_id" });
      }

      const token = await getToken();
      const discountCodes = [];
      if (body.promo_code || body.promoCode) {
        const code = String(body.promo_code || body.promoCode || "").trim();
        if (code) discountCodes.push(code);
      }

      const idempotencyKey = getDraftCreateIdempotencyKey({ event, body });
      const fallbackFingerprint = crypto
        .createHash("sha1")
        .update(JSON.stringify({
          customerId,
          lineItems: normalizedLineItems,
          discountCodes,
          shippingLine: body.shipping_line || body.shippingLine || null,
        }))
        .digest("hex")
        .slice(0, 24);
      const idempotencyCacheKey = `${customerId}|${idempotencyKey || fallbackFingerprint}`;
      const cachedDraftGid = getCachedIdempotentDraftGid(idempotencyCacheKey);
      if (cachedDraftGid) {
        const cachedResult = await fetchDraftOrder({ token, id: cachedDraftGid });
        if (!cachedResult.error && cachedResult.draftOrder) {
          return respond(200, {
            draft_order: cachedResult.draftOrder,
            invoice_url: cachedResult.draftOrder?.invoiceUrl || null,
            idempotent_replay: true,
          });
        }
      }

      const bogoResult = await applyBogoRules({
        token,
        lineItems: normalizedLineItems,
        discountCodes,
      });
      if (bogoResult.error) {
        const status = bogoResult.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(bogoResult.error.body || "").slice(0, 2000),
        });
      }

      normalizedLineItems = bogoResult.lineItems;

      const input = {
        customerId,
        lineItems: normalizedLineItems,
      };
      const customAttributes = buildDraftCustomAttributes(body);
      if (customAttributes.length) input.customAttributes = customAttributes;

      const deferredInput = {};
      if (body.note) deferredInput.note = body.note;
      if (body.email) deferredInput.email = body.email;
      if (body.applied_discount || body.appliedDiscount) {
        input.appliedDiscount = body.applied_discount || body.appliedDiscount;
      } else if (bogoResult.discountCodes?.length) {
        input.discountCodes = bogoResult.discountCodes;
      }

      const addressInput = buildDraftAddressUpdateInput(body);
      const shippingLine = normalizeShippingLineInput(body.shipping_line || body.shippingLine);
      if (shippingLine) input.shippingLine = shippingLine;

      const result = await createDraftOrder({ token, input });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      let draftOrder = result.draftOrder;
      if (addressInput && draftOrder?.id) {
        const addressResult = await updateDraftOrder({
          token,
          id: draftOrder.id,
          input: addressInput,
        });
        if (addressResult.error) {
          const status = addressResult.error.status || 502;
          return respond(status, {
            error: "Draft order created but address update failed",
            status,
            body: String(addressResult.error.body || "").slice(0, 2000),
            draft_order_id: draftOrder?.legacyResourceId || null,
            invoice_url: draftOrder?.invoiceUrl || null,
          });
        }
        draftOrder = addressResult.draftOrder || draftOrder;
      }

      if (draftOrder?.id && Object.keys(deferredInput).length) {
        const deferredResult = await updateDraftOrder({
          token,
          id: draftOrder.id,
          input: deferredInput,
        });
        if (deferredResult.error) {
          const status = deferredResult.error.status || 502;
          return respond(status, {
            error: "Draft order created but deferred metadata update failed",
            status,
            body: String(deferredResult.error.body || "").slice(0, 2000),
            draft_order_id: draftOrder?.legacyResourceId || null,
            invoice_url: draftOrder?.invoiceUrl || null,
          });
        }
        draftOrder = deferredResult.draftOrder || draftOrder;
      }

      let responseDraftOrder = draftOrder;
      if (draftOrder?.id) {
        const fetched = await fetchDraftOrder({ token, id: draftOrder.id });
        if (!fetched.error && fetched.draftOrder) {
          responseDraftOrder = fetched.draftOrder;
        }
      }
      if (draftOrder?.id) {
        setCachedIdempotentDraftGid(idempotencyCacheKey, draftOrder.id);
      }

      return respond(200, {
        draft_order: responseDraftOrder,
        invoice_url: responseDraftOrder?.invoiceUrl || draftOrder?.invoiceUrl || null,
      });
    }

    if (path.endsWith("/draft_order_update")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const tStart = Date.now();
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};

      const draftOrderId = String(body.draft_order_id || body.draftOrderId || "").trim();
      const draftOrderGid = draftOrderId.startsWith("gid://shopify/DraftOrder/")
        ? draftOrderId
        : (/^\d+$/.test(draftOrderId) ? `gid://shopify/DraftOrder/${draftOrderId}` : "");
      if (!draftOrderGid) {
        return respond(400, { error: "draft_order_id required (id or gid)" });
      }

      const lineItems = Array.isArray(body.line_items || body.lineItems) ? (body.line_items || body.lineItems) : [];
      if (!lineItems.length) {
        return respond(400, { error: "line_items required" });
      }
      console.log(`[draft_order_update] items=${lineItems.length}`);

      let normalizedLineItems = lineItems.map((item) => ({
        variantId: item.variant_id || item.variantId,
        quantity: Number(item.quantity || 1),
      })).filter((item) => item.variantId);

      if (!normalizedLineItems.length) {
        return respond(400, { error: "line_items must include variant_id" });
      }

      const discountCodes = [];
      if (body.promo_code || body.promoCode) {
        const code = String(body.promo_code || body.promoCode || "").trim();
        if (code) discountCodes.push(code);
      }

      const tBogoStart = Date.now();
      const bogoResult = await applyBogoRules({
        token: await getToken(),
        lineItems: normalizedLineItems,
        discountCodes,
      });
      console.log(`[draft_order_update] applyBogoRules ms=${Date.now() - tBogoStart}`);
      if (bogoResult.error) {
        const status = bogoResult.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(bogoResult.error.body || "").slice(0, 2000),
        });
      }

      normalizedLineItems = bogoResult.lineItems;

      const input = { lineItems: normalizedLineItems };
      const customAttributes = buildDraftCustomAttributes(body);
      if (customAttributes.length) input.customAttributes = customAttributes;
      if (body.applied_discount || body.appliedDiscount) {
        input.appliedDiscount = body.applied_discount || body.appliedDiscount;
      } else if (bogoResult.discountCodes?.length) {
        input.discountCodes = bogoResult.discountCodes;
      }
      const addressInput = buildDraftAddressUpdateInput(body);
      const shippingLine = normalizeShippingLineInput(body.shipping_line || body.shippingLine);
      if (shippingLine) input.shippingLine = shippingLine;

      const token = await getToken();
      const tUpdateStart = Date.now();
      const result = await updateDraftOrder({ token, id: draftOrderGid, input });
      console.log(`[draft_order_update] updateDraftOrder ms=${Date.now() - tUpdateStart}`);
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      let draftOrder = result.draftOrder;
      if (addressInput) {
        const tAddressStart = Date.now();
        const addressResult = await updateDraftOrder({
          token,
          id: draftOrderGid,
          input: addressInput,
        });
        console.log(`[draft_order_update] addressUpdate ms=${Date.now() - tAddressStart}`);
        if (addressResult.error) {
          const status = addressResult.error.status || 502;
          return respond(status, {
            error: "Draft updated but address update failed",
            status,
            body: String(addressResult.error.body || "").slice(0, 2000),
            draft_order_id: draftOrder?.legacyResourceId || null,
            invoice_url: draftOrder?.invoiceUrl || null,
          });
        }
        draftOrder = addressResult.draftOrder || draftOrder;
      }

      let responseDraftOrder = draftOrder;
      if (draftOrder?.id) {
        const fetched = await fetchDraftOrder({ token, id: draftOrder.id });
        if (!fetched.error && fetched.draftOrder) {
          responseDraftOrder = fetched.draftOrder;
        }
      }

      console.log(`[draft_order_update] total ms=${Date.now() - tStart}`);
      return respond(200, {
        draft_order: responseDraftOrder,
        invoice_url: responseDraftOrder?.invoiceUrl || draftOrder?.invoiceUrl || null,
      });
    }

    if (path.endsWith("/draft_order_get")) {
      if (event.httpMethod !== "GET") {
        return respond(405, { error: "Method not allowed" });
      }
      const params = event.queryStringParameters || {};
      const draftOrderId = String(params.draft_order_id || params.draftOrderId || "").trim();
      const draftOrderGid = draftOrderId.startsWith("gid://shopify/DraftOrder/")
        ? draftOrderId
        : (/^\d+$/.test(draftOrderId) ? `gid://shopify/DraftOrder/${draftOrderId}` : "");
      if (!draftOrderGid) {
        return respond(400, { error: "draft_order_id required (id or gid)" });
      }

      const token = await getToken();
      const result = await fetchDraftOrder({ token, id: draftOrderGid });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      return respond(200, { draft_order: result.draftOrder });
    }

    if (path.endsWith("/customer_orders")) {
      if (event.httpMethod !== "GET") {
        return respond(405, { error: "Method not allowed" });
      }
      const params = event.queryStringParameters || {};
      const customerId = toCustomerGid(params.customer_id || params.customerId || "");
      if (customerId === "invalid") {
        return respond(400, { error: "customer_id must be a Shopify customer id or gid" });
      }
      if (!customerId) {
        return respond(400, { error: "customer_id required" });
      }
      const token = await getToken();
      const result = await fetchCustomerOrders({ token, customerId });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, result);
    }

    if (path.endsWith("/customer_profile")) {
      if (event.httpMethod !== "GET") {
        return respond(405, { error: "Method not allowed" });
      }
      const params = event.queryStringParameters || {};
      const customerId = toCustomerGid(params.customer_id || params.customerId || "");
      if (customerId === "invalid") {
        return respond(400, { error: "customer_id must be a Shopify customer id or gid" });
      }
      if (!customerId) {
        return respond(400, { error: "customer_id required" });
      }
      const token = await getToken();
      const result = await fetchCustomerProfile({ token, customerId });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify profile error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { profile: result.profile || null });
    }

    if (path.endsWith("/customer_address_create")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};

      const customerId = toCustomerGid(body.customer_id || body.customerId || "");
      if (customerId === "invalid") {
        return respond(400, { error: "customer_id must be a Shopify customer id or gid" });
      }
      if (!customerId) {
        return respond(400, { error: "customer_id required" });
      }

      const address = normalizeAddressInput(body.address || {});
      if (!address) {
        return respond(400, { error: "address required" });
      }
      const setDefault = Boolean(body.set_default || body.setDefault);

      const token = await getToken();
      const result = await createCustomerAddress({ token, customerId, address, setDefault });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { address_id: result.address_id || null });
    }

    if (path.endsWith("/customer_create")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name) return respond(400, { error: "name required" });
      if (!email) return respond(400, { error: "email required" });
      if (!phone) return respond(400, { error: "phone required" });

      const token = await getToken();
      const result = await createCustomer({ token, name, email, phone });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { customer: result.customer || null });
    }

    if (path.endsWith("/audit_log")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};
      const actor = body.actor || {};
      const events = Array.isArray(body.events) ? body.events : [];
      if (!events.length) {
        return respond(200, { ok: true, stored: 0, mode: AUDIT_LOG_TABLE ? "dynamodb" : "cloudwatch" });
      }

      const result = await persistAuditEvents({
        actor,
        ticketId: body.ticket_id || body.ticketId || "",
        reason: body.reason || "auto",
        events,
      });
      return respond(200, { ok: true, ...result });
    }

    if (path.endsWith("/order_cancel")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};
      const orderId = String(body.order_id || body.orderId || "").trim();
      const orderGid = orderId.startsWith("gid://shopify/Order/")
        ? orderId
        : (/^\d+$/.test(orderId) ? `gid://shopify/Order/${orderId}` : "");
      if (!orderGid) {
        return respond(400, { error: "order_id required (id or gid)" });
      }
      const token = await getToken();
      const result = await cancelOrder({ token, orderId: orderGid });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { ok: true, job: result.job });
    }

    if (path.endsWith("/order_refund")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};
      const orderId = String(body.order_id || body.orderId || "").trim();
      const orderGid = orderId.startsWith("gid://shopify/Order/")
        ? orderId
        : (/^\d+$/.test(orderId) ? `gid://shopify/Order/${orderId}` : "");
      if (!orderGid) {
        return respond(400, { error: "order_id required (id or gid)" });
      }
      const token = await getToken();
      const lineItemsInput = body.line_items || body.lineItems || [];
      const result = await refundOrder({ token, orderId: orderGid, lineItemsInput });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { ok: true, refund: result.refund });
    }

    if (path.endsWith("/product_search")) {
      if (event.httpMethod !== "GET") {
        return respond(405, { error: "Method not allowed" });
      }
      const params = event.queryStringParameters || {};
      const query = String(params.query || params.title || "").trim();
      if (!query) {
        return respond(400, { error: "query required" });
      }
      const limit = parseLimit(params.limit);
      const token = await getToken();
      const result = await fetchProductsByTitle({ token, query, limit });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { count: result.variants.length, variants: result.variants, query });
    }

    if (path.endsWith("/sku_lookup")) {
      if (event.httpMethod !== "GET") {
        return respond(405, { error: "Method not allowed" });
      }
      const params = event.queryStringParameters || {};
      const variantRaw = params.variant_id || params.variantId || params.variant_gid || params.variantGid || "";
      if (variantRaw) {
        const variantGid = toVariantGid(variantRaw);
        if (!variantGid) return respond(400, { error: "variant_id must be a Shopify variant id or gid" });
        const token = await getToken();
        const result = await fetchVariantByGid({ token, id: variantGid });
        if (result.error) {
          const status = result.error.status || 502;
          return respond(status, {
            error: "Shopify GraphQL error",
            status,
            body: String(result.error.body || "").slice(0, 2000),
          });
        }
        return respond(200, { count: result.variant ? 1 : 0, variants: result.variant ? [result.variant] : [] });
      }

      const sku = String(params.sku || "").trim();
      if (!sku) return respond(400, { error: "sku required" });

      const limit = parseLimit(params.limit);
      const token = await getToken();
      const result = await fetchSkus({ token, sku, limit });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { ...result, requested_sku: sku });
    }

    if (path.endsWith("/variant_lookup")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
      const { value, error } = parseJsonBody(event);
      if (error) return respond(400, { error });
      const body = value || {};
      const variantRaw = body.variant_id || body.variantId || body.variant_gid || body.variantGid || "";
      const variantGid = toVariantGid(variantRaw);
      if (!variantGid) return respond(400, { error: "variant_id required (id or gid)" });
      const token = await getToken();
      const result = await fetchVariantByGid({ token, id: variantGid });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { variant: result.variant || null });
    }

    const params = event.queryStringParameters || {};
    const metafieldGid = normalizeMetafieldGid(params.metafield_gid || params.metafieldGid || "");
    const swansonId = normalizeSwansonId(params.swanson_id || params.swansonId || "");
    if (metafieldGid === "invalid") {
      return respond(400, { error: "metafield_gid must be a Metafield GID" });
    }
    if (swansonId === "invalid") {
      return respond(400, { error: "swanson_id must be an integer" });
    }

    const limit = parseLimit(params.limit);
    const token = await getToken();
    if (metafieldGid) {
      const result = await fetchCustomerByMetafieldGid({ token, metafieldGid });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      return respond(200, {
        count: result.customers.length,
        customers: result.customers,
        query: `metafield_gid:${metafieldGid}`,
      });
    }

    if (swansonId) {
      const result = await fetchCustomersBySwansonId({ token, swansonId, limit });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      return respond(200, {
        count: result.customers.length,
        customers: result.customers,
        query: `metafield:swanson.id=${swansonId}`,
        scan_pages: result.scanPages,
        scan_limited: result.scanLimited,
      });
    }

    const query = buildQuery({
      firstName: params.first_name || params.firstName || "",
      lastName: params.last_name || params.lastName || "",
      email: params.email || "",
      phone: params.phone || "",
      query: params.query || "",
    }).trim();

    if (!query) {
      return respond(400, { error: "Provide first_name, last_name, email, phone, or query" });
    }

    const result = await fetchCustomersGraphql({ token, query, limit });

    if (result.error) {
      const status = result.error.status || 502;
      return respond(status, {
        error: "Shopify GraphQL error",
        status,
        body: String(result.error.body || "").slice(0, 2000),
      });
    }

    return respond(200, { count: result.customers.length, customers: result.customers, query });
  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message || String(err) });
  }
};
