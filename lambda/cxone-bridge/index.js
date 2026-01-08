// Lambda: return current active call ANI for an agent (by username/email).
// Env: NIC_ACCESS_KEY_ID, NIC_ACCESS_KEY_SECRET (required)
//       NIC_REGION (default na1), NIC_API_VER (default v27.0)
// Query: username=<email>
const https = require("https");

const REGION = process.env.NIC_REGION || "na1";
const API_VER = process.env.NIC_API_VER || "v27.0";
const ACCESS_KEY_ID = process.env.NIC_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.NIC_ACCESS_KEY_SECRET;
const API_KEY = process.env.API_KEY || "";
const LOG_REQUESTS = process.env.LOG_REQUESTS === "true";

const baseAuth = `https://api-${REGION}.niceincontact.com/authentication/v1/token/access-key`;
const baseApi = `https://api-${REGION}.niceincontact.com/inContactAPI/services/${API_VER}`;

// In-memory token cache (per warmed Lambda container). Avoids an auth call on every poll.
let cachedToken = null;
let cachedTokenExpMs = 0;

function httpRequest(method, url, options = {}) {
  const { headers = {}, body } = options;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const status = res.statusCode || 500;
        if (status >= 200 && status < 300) {
          try {
            resolve({ status, data: data ? JSON.parse(data) : {} });
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${status}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const now = Date.now();
  // Reuse token if not near expiry (30s safety buffer).
  if (cachedToken && cachedTokenExpMs - 30_000 > now) {
    return cachedToken;
  }
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("Missing NIC_ACCESS_KEY_ID or NIC_ACCESS_KEY_SECRET");
  }
  const { data } = await httpRequest("POST", baseAuth, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKeyId: ACCESS_KEY_ID, accessKeySecret: ACCESS_KEY_SECRET }),
  });
  const ttlSec = Number(data.expires_in || data.expiresIn || 0) || 900;
  cachedToken = data.access_token;
  cachedTokenExpMs = Date.now() + ttlSec * 1000;
  return cachedToken;
}

async function getAgentId(token, username) {
  const url = `${baseApi}/agents?searchString=${encodeURIComponent(username)}`;
  const { data } = await httpRequest("GET", url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const agents = data.agents || [];
  if (!agents.length) throw new Error(`No agent found for ${username}`);
  return agents[0].agentId;
}

function extractPhone(contact) {
  const candidates = [
    contact.ani,
    contact.aniValue,
    contact.contactPoint,
    contact.fromAddress,
    contact.toAddress,
    contact.fromNumber,
    contact.phoneNumber,
    contact.dialedNumber,
  ];
  for (const v of candidates) {
    if (!v) continue;
    const digits = String(v)
      .split("")
      .filter((ch) => ch >= "0" && ch <= "9")
      .join("");
    if (digits.length >= 7) return digits;
  }
  return null;
}

function isAnswered(contact) {
  const stateRaw = (
    contact.contactStateName ||
    contact.stateName ||
    contact.contactState ||
    contact.state ||
    ""
  ).toString().toLowerCase();
  const category = (contact.contactStateCategory || "").toString().toLowerCase();
  const stateId = Number(contact.stateId || contact.contactStateId || 0);

  // Strong positives from the sample: stateName "Active", category "With Agent", stateId 4.
  if (stateRaw.includes("active")) return true;
  if (category.includes("with agent")) return true;
  if (stateId === 4) return true;

  // Additional positives
  const goodWords = ["connect", "talk", "engaged", "inprogress"];
  if (stateRaw && goodWords.some((w) => stateRaw.includes(w))) return true;

  // Pre-answer/ringing excludes.
  const preAnswerWords = ["ring", "offer", "queue", "preview", "pending"];
  if (stateRaw && preAnswerWords.some((w) => stateRaw.includes(w))) return false;

  return false;
}

async function getActiveCall(token, agentId) {
  const url = `${baseApi}/contacts/active?agentId=${encodeURIComponent(agentId)}`;
  const { data } = await httpRequest("GET", url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const active = data.activeContacts || [];
  const calls = active.filter((c) => String(c.mediaTypeName || "").toLowerCase().includes("call"));
  const answered = calls.filter(isAnswered);
  answered.sort(
    (a, b) =>
      (b.lastUpdateTime || b.contactStartDate || "").localeCompare(
        a.lastUpdateTime || a.contactStartDate || ""
      )
  );
  return answered.length ? answered[0] : null;
}

exports.handler = async (event) => {
  try {
    if (API_KEY) {
      const headers = event.headers || {};
      const headerKey =
        headers["x-api-key"] ||
        headers["X-Api-Key"] ||
        headers["X-API-KEY"] ||
        "";
      const qs = event.queryStringParameters || {};
      const queryKey = qs.api_key || qs.apiKey || "";
      if ((!headerKey || headerKey !== API_KEY) && (!queryKey || queryKey !== API_KEY)) {
        return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
      }
    }
    const qs = event.queryStringParameters || {};
    const username = qs.username;
    if (!username) {
      return { statusCode: 400, body: JSON.stringify({ error: "username required" }) };
    }
    if (LOG_REQUESTS) console.log(`Req username=${username}`);
    const token = await getToken();
    const agentId = await getAgentId(token, username);
    const contact = await getActiveCall(token, agentId);
    if (!contact) {
      if (LOG_REQUESTS) console.log("No active call");
      return { statusCode: 204 };
    }
    const phone = extractPhone(contact);
    if (!phone) {
      if (LOG_REQUESTS) console.log("Active call but no phone", contact.contactId);
      return { statusCode: 204 };
    }
    if (LOG_REQUESTS) console.log(`Returning phone ${phone} contactId ${contact.contactId}`);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, contactId: contact.contactId }),
    };
  } catch (err) {
    console.error("Error", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
