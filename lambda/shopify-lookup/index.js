const https = require("https");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const STORE = process.env.SHOPIFY_STORE;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const SECRET_ARN = process.env.SHOPIFY_TOKEN_SECRET_ARN;
const MAX_RESULTS = Number(process.env.MAX_RESULTS || 10);
const SWANSON_SCAN_PAGE_SIZE = Number(process.env.SWANSON_SCAN_PAGE_SIZE || 50);
const SWANSON_SCAN_MAX_PAGES = Number(process.env.SWANSON_SCAN_MAX_PAGES || 20);

const secretsManager = new SecretsManagerClient({});

let cachedToken = null;
let cachedTokenFetchedAt = 0;

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    if (body) {
      req.write(body);
    }
    req.end();
  });
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
  return String(pricingValue).includes("N9J=bogo:10.59");
}

function roundUpToEven(quantity) {
  const qty = Number(quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 2;
  return qty % 2 === 0 ? qty : qty + 1;
}

async function fetchCustomersRest({ token, query, limit }) {
  const path = `/admin/api/${API_VERSION}/customers/search.json?query=${encodeURIComponent(query)}&limit=${limit}`;
  const { status, body } = await httpsRequest({
    method: "GET",
    hostname: `${STORE}.myshopify.com`,
    path,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
    },
  });

  if (status < 200 || status >= 300) {
    return { error: { status, body } };
  }

  const payload = JSON.parse(body || "{}");
  const customers = Array.isArray(payload.customers) ? payload.customers : [];
  return {
    customers: customers.map((c) => ({
      id: c.id,
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      email: c.email || "",
      phone: c.phone || "",
      state: c.state || "",
      tags: c.tags || "",
    })),
  };
}

async function fetchDiscountByCode({ token, code }) {
  const path = `/admin/api/${API_VERSION}/discount_codes/lookup.json?code=${encodeURIComponent(code)}`;
  const { status, body } = await httpsRequestWithRedirect({
    method: "GET",
    hostname: `${STORE}.myshopify.com`,
    path,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
    },
  });

  if (status < 200 || status >= 300) {
    return { error: { status, body } };
  }

  const payload = JSON.parse(body || "{}");
  return { discount_code: payload.discount_code || null };
}

async function fetchPriceRule({ token, priceRuleId }) {
  const path = `/admin/api/${API_VERSION}/price_rules/${priceRuleId}.json`;
  const { status, body } = await httpsRequestWithRedirect({
    method: "GET",
    hostname: `${STORE}.myshopify.com`,
    path,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
    },
  });

  if (status < 200 || status >= 300) {
    return { error: { status, body } };
  }

  const payload = JSON.parse(body || "{}");
  return { price_rule: payload.price_rule || null };
}

async function getAppliedDiscountFromCode({ token, code }) {
  const lookup = await fetchDiscountByCode({ token, code });
  if (lookup.error) return lookup;
  const discount = lookup.discount_code;
  if (!discount || !discount.price_rule_id) {
    return { error: { status: 404, body: "Discount code not found" } };
  }

  const priceRuleResult = await fetchPriceRule({ token, priceRuleId: discount.price_rule_id });
  if (priceRuleResult.error) return priceRuleResult;
  const priceRule = priceRuleResult.price_rule;
  if (!priceRule) return { error: { status: 404, body: "Price rule not found" } };

  const valueTypeRaw = String(priceRule.value_type || "").toLowerCase();
  if (valueTypeRaw !== "percentage" && valueTypeRaw !== "fixed_amount") {
    return { error: { status: 400, body: `Unsupported price_rule value_type: ${priceRule.value_type || "unknown"}` } };
  }
  const valueType = valueTypeRaw === "percentage" ? "PERCENTAGE" : "FIXED_AMOUNT";
  const rawValue = Number(priceRule.value || 0);
  const value = Math.abs(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: { status: 400, body: "Invalid price rule value" } };
  }

  return {
    applied_discount: {
      title: priceRule.title || code,
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
              fulfillments(first: 1) {
                status
                trackingInfo {
                  number
                  url
                  company
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
    id: node.id,
    legacy_id: node.legacyResourceId,
    name: node.name,
    processed_at: node.processedAt,
    financial_status: node.displayFinancialStatus,
    fulfillment_status: node.displayFulfillmentStatus,
    delivery_status: node.fulfillments?.[0]?.status || null,
    tracking_numbers: (node.fulfillments?.[0]?.trackingInfo || []).map((t) => t.number).filter(Boolean),
    tracking_urls: (node.fulfillments?.[0]?.trackingInfo || []).map((t) => t.url).filter(Boolean),
    tracking_companies: (node.fulfillments?.[0]?.trackingInfo || []).map((t) => t.company).filter(Boolean),
    latest_status: node.fulfillments?.[0]?.status || node.displayFulfillmentStatus || null,
    total: node.totalPriceSet?.presentmentMoney?.amount || null,
    currency: node.totalPriceSet?.presentmentMoney?.currencyCode || null,
    line_items: (node.lineItems?.edges || []).map(({ node: line }) => ({
      title: line.title || "",
      sku: line.sku || "",
      quantity: line.quantity || 0,
      line_item_id: line.id || "",
      total_amount: line.discountedTotalSet?.shopMoney?.amount || null,
      currency: line.discountedTotalSet?.shopMoney?.currencyCode || null,
      image_url: line.variant?.image?.url || null,
      image_alt: line.variant?.image?.altText || "",
    })),
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

  return { orders, draft_orders: draftOrders };
}

async function createCustomerAddress({ token, customerId, address, setDefault }) {
  const legacyId = toCustomerLegacyId(customerId);
  if (!legacyId) {
    return { error: { status: 400, body: "customer_id must be a Shopify customer id or gid" } };
  }

  const path = `/admin/api/${API_VERSION}/customers/${legacyId}/addresses.json`;
  const { status, body } = await httpsRequestWithRedirect({
    method: "POST",
    hostname: `${STORE}.myshopify.com`,
    path,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
  }, JSON.stringify({ address }));

  if (status < 200 || status >= 300) {
    return { error: { status, body } };
  }

  const payload = JSON.parse(body || "{}");
  const addressId = payload?.customer_address?.id || null;
  if (!addressId || !setDefault) {
    return { address_id: addressId };
  }

  const defaultPath = `/admin/api/${API_VERSION}/customers/${legacyId}/addresses/${addressId}/default.json`;
  const defaultResult = await httpsRequestWithRedirect({
    method: "PUT",
    hostname: `${STORE}.myshopify.com`,
    path: defaultPath,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
    },
  });

  if (defaultResult.status < 200 || defaultResult.status >= 300) {
    return { error: { status: defaultResult.status, body: defaultResult.body } };
  }

  return { address_id: addressId };
}

function splitCustomerName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

async function createCustomer({ token, name, email, phone }) {
  const { first_name, last_name } = splitCustomerName(name);
  const path = `/admin/api/${API_VERSION}/customers.json`;
  const payload = JSON.stringify({
    customer: {
      first_name,
      last_name,
      email,
      phone,
    },
  });
  const { status, body } = await httpsRequestWithRedirect({
    method: "POST",
    hostname: `${STORE}.myshopify.com`,
    path,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
  }, payload);

  if (status < 200 || status >= 300) {
    return { error: { status, body } };
  }

  const data = JSON.parse(body || "{}");
  return { customer: data?.customer || null };
}

async function fetchVariantPricing({ token, variantIds }) {
  const ids = (variantIds || []).filter(Boolean);
  if (!ids.length) return { pricing: new Map() };

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
    variables: { ids },
  });

  const { error, data } = await shopifyGraphqlRequest({ token, payload });
  if (error) return { error };

  const pricing = new Map();
  const nodes = data?.data?.nodes || [];
  nodes.forEach((node) => {
    if (!node || !node.id) return;
    pricing.set(node.id, node.metafield?.value || "");
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
  const { status, body } = await httpsRequest(
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
    return { error: { status, body } };
  }

  let data;
  try {
    data = JSON.parse(body || "{}");
  } catch (err) {
    return { error: { status: 502, body: "Invalid JSON from Shopify GraphQL" } };
  }

  if (Array.isArray(data.errors) && data.errors.length) {
    return { error: { status: 502, body: JSON.stringify(data.errors).slice(0, 2000) } };
  }

  return { data };
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
          name
          status
          invoiceUrl
          subtotalPrice
          totalPrice
          totalTax
          lineItems(first: 50) {
            edges {
              node {
                id
                quantity
                variant {
                  id
                  sku
                }
                title
              }
            }
          }
          customer {
            id
            legacyResourceId
            email
          }
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
          name
          status
          invoiceUrl
          subtotalPrice
          totalPrice
          totalTax
          lineItems(first: 50) {
            edges {
              node {
                id
                quantity
                variant {
                  id
                  sku
                }
                title
              }
            }
          }
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
        totalDiscountsSet {
          presentmentMoney {
            amount
            currencyCode
          }
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

async function fetchVariantBySkuRest({ token, sku, limit }) {
  const path = `/admin/api/${API_VERSION}/variants.json?sku=${encodeURIComponent(sku)}&limit=${limit}`;
  const { status, body } = await httpsRequestWithRedirect({
    method: "GET",
    hostname: `${STORE}.myshopify.com`,
    path,
    headers: {
      "X-Shopify-Access-Token": token,
      "Accept": "application/json",
    },
  });
  if (status < 200 || status >= 300) {
    return { error: { status, body } };
  }
  const payload = JSON.parse(body || "{}");
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  return { variants };
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

exports.handler = async (event) => {
  try {
    if (!STORE) return respond(500, { error: "Missing SHOPIFY_STORE" });

    if (event.httpMethod === "OPTIONS") {
      return respond(200, { ok: true });
    }

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

      const discountCodes = [];
      if (body.promo_code || body.promoCode) {
        const code = String(body.promo_code || body.promoCode || "").trim();
        if (code) discountCodes.push(code);
      }

      const bogoResult = await applyBogoRules({
        token: await getToken(),
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

      if (body.note) input.note = body.note;
      if (Array.isArray(body.tags) && body.tags.length) input.tags = body.tags;
      if (body.email) input.email = body.email;
      if (body.applied_discount || body.appliedDiscount) {
        input.appliedDiscount = body.applied_discount || body.appliedDiscount;
      } else if (bogoResult.discountCodes?.length) {
        input.discountCodes = bogoResult.discountCodes;
      }

      const shippingAddress = normalizeAddressInput(body.shipping_address || body.shippingAddress);
      const billingAddress = normalizeAddressInput(body.billing_address || body.billingAddress);
      const billingSame = body.billing_same_as_shipping || body.billingSameAsShipping;
      if (shippingAddress) input.shippingAddress = shippingAddress;
      if (billingAddress) input.billingAddress = billingAddress;
      if (billingSame && shippingAddress && !billingAddress) {
        input.billingAddress = shippingAddress;
      }

      const token = await getToken();
      const result = await createDraftOrder({ token, input });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      const draftOrder = result.draftOrder;
      return respond(200, {
        draft_order: draftOrder,
        invoice_url: draftOrder?.invoiceUrl || null,
      });
    }

    if (path.endsWith("/draft_order_update")) {
      if (event.httpMethod !== "POST") {
        return respond(405, { error: "Method not allowed" });
      }
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

      const bogoResult = await applyBogoRules({
        token: await getToken(),
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

      const input = { lineItems: normalizedLineItems };
      if (body.applied_discount || body.appliedDiscount) {
        input.appliedDiscount = body.applied_discount || body.appliedDiscount;
      } else if (bogoResult.discountCodes?.length) {
        input.discountCodes = bogoResult.discountCodes;
      }

      const token = await getToken();
      const result = await updateDraftOrder({ token, id: draftOrderGid, input });
      if (result.error) {
        const status = result.error.status || 502;
        return respond(status, {
          error: "Shopify GraphQL error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }

      const draftOrder = result.draftOrder;
      return respond(200, {
        draft_order: draftOrder,
        invoice_url: draftOrder?.invoiceUrl || null,
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
          error: "Shopify REST error",
          status,
          body: String(result.error.body || "").slice(0, 2000),
        });
      }
      return respond(200, { customer: result.customer || null });
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
      return respond(200, result);
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

    const result = await fetchCustomersRest({ token, query, limit });

    if (result.error) {
      const status = result.error.status || 502;
      return respond(status, {
        error: "Shopify REST error",
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
