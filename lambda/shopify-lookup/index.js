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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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
        resolve({ status: res.statusCode || 0, body: data });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
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

exports.handler = async (event) => {
  try {
    if (!STORE) return respond(500, { error: "Missing SHOPIFY_STORE" });

    if (event.httpMethod === "OPTIONS") {
      return respond(200, { ok: true });
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
