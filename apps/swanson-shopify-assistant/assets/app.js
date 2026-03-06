const els = {
  apiStatus: document.getElementById('apiStatus'),
  firstName: document.getElementById('firstName'),
  lastName: document.getElementById('lastName'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone'),
  tags: document.getElementById('tags'),
  swansonId: document.getElementById('swansonId'),
  customerId: document.getElementById('customerId'),
  btnSearchCustomer: document.getElementById('btnSearchCustomer'),
  btnCustomerNext: document.getElementById('btnCustomerNext'),
  btnNewCustomer: document.getElementById('btnNewCustomer'),
  btnClearCustomer: document.getElementById('btnClearCustomer'),
  newCustomerPanel: document.getElementById('newCustomerPanel'),
  newCustomerName: document.getElementById('newCustomerName'),
  newCustomerPhone: document.getElementById('newCustomerPhone'),
  newCustomerEmail: document.getElementById('newCustomerEmail'),
  btnNoEmail: document.getElementById('btnNoEmail'),
  btnCreateCustomer: document.getElementById('btnCreateCustomer'),
  newCustomerStatus: document.getElementById('newCustomerStatus'),
  customerStatus: document.getElementById('customerStatus'),
  customerResults: document.getElementById('customerResults'),
  customerProfile: document.getElementById('customerProfile'),
  customerProfileGrid: document.getElementById('customerProfileGrid'),
  customerSubscriptions: document.getElementById('customerSubscriptions'),
  macroStatus: document.getElementById('macroStatus'),
  ordersStatus: document.getElementById('ordersStatus'),
  ordersList: document.getElementById('ordersList'),
  btnNewOrder: document.getElementById('btnNewOrder'),
  addressSelect: document.getElementById('addressSelect'),
  shipPreview: document.getElementById('shipPreview'),
  shipWarning: document.getElementById('shipWarning'),
  addressValidation: document.getElementById('addressValidation'),
  addressOverrideWrap: document.getElementById('addressOverrideWrap'),
  addressOverride: document.getElementById('addressOverride'),
  addrName: document.getElementById('addrName'),
  addrPhone: document.getElementById('addrPhone'),
  addr1: document.getElementById('addr1'),
  addr2: document.getElementById('addr2'),
  addrCity: document.getElementById('addrCity'),
  addrProvince: document.getElementById('addrProvince'),
  addrZip: document.getElementById('addrZip'),
  addrCountry: document.getElementById('addrCountry'),
  addrDefault: document.getElementById('addrDefault'),
  btnAddAddress: document.getElementById('btnAddAddress'),
  addrStatus: document.getElementById('addrStatus'),
  sku: document.getElementById('sku'),
  skuQty: document.getElementById('skuQty'),
  variantPrice: document.getElementById('variantPrice'),
  btnLookupSku: document.getElementById('btnLookupSku'),
  btnAddSku: document.getElementById('btnAddSku'),
  skuStatus: document.getElementById('skuStatus'),
  skuCard: document.getElementById('skuCard'),
  productResults: document.getElementById('productResults'),
  btnUpsellToggle: document.getElementById('btnUpsellToggle'),
  upsellToggleText: document.getElementById('upsellToggleText'),
  upsellCaret: document.getElementById('upsellCaret'),
  upsellPanel: document.getElementById('upsellPanel'),
  upsellStatus: document.getElementById('upsellStatus'),
  upsellList: document.getElementById('upsellList'),
  draftOrderId: document.getElementById('draftOrderId'),
  invoiceUrl: document.getElementById('invoiceUrl'),
  invoiceLink: document.getElementById('invoiceLink'),
  btnCopyInvoiceUrl: document.getElementById('btnCopyInvoiceUrl'),
  promoCode: document.getElementById('promoCode'),
  promoStatus: document.getElementById('promoStatus'),
  shippingSpeed: document.getElementById('shippingSpeed'),
  shippingCost: document.getElementById('shippingCost'),
  freeShipping: document.getElementById('freeShipping'),
  subtotal: document.getElementById('subtotal'),
  totalTax: document.getElementById('totalTax'),
  total: document.getElementById('total'),
  btnCreateDraft: document.getElementById('btnCreateDraft'),
  draftStatus: document.getElementById('draftStatus'),
  btnConversionToggle: document.getElementById('btnConversionToggle'),
  conversionPanel: document.getElementById('conversionPanel'),
  conversionStatus: document.getElementById('conversionStatus'),
  btnRefreshOrdersFromConversion: document.getElementById('btnRefreshOrdersFromConversion'),
  btnStopConversionPolling: document.getElementById('btnStopConversionPolling'),
  orderItems: document.getElementById('orderItems'),
  navCustomer: document.getElementById('navCustomer'),
  navOrders: document.getElementById('navOrders'),
  navOrder: document.getElementById('navOrder'),
};

let lastAddresses = [];
let lastVariant = null;
let orderItems = [];
let lastOrders = [];
let lastDraftOrders = [];
let ordersMinimized = false;
let draftOrdersCollapsed = true;
let customerOrdersCollapsed = false;
let selectedShipState = '';
let lastSearchCustomers = [];
let autoSearchDone = false;
let requesterEmail = '';
let userEditedEmail = false;
let prefillActive = true;
let currentAddressValidation = { valid: true, requiresOverride: false, message: '' };
let lastCustomerProfile = null;
let syncingShippingUi = false;
let lastRestrictionConflictState = '';
let upsellExpanded = false;
let upsellSuggestions = [];
let upsellSuggestionVersion = 0;
let draftSubmitInFlight = false;
const productSearchCache = new Map();
const productSearchCacheTtlMs = 2 * 60 * 1000;
const productSearchCacheMaxEntries = 50;
const upsellVariantCache = new Map();
const upsellVariantCacheTtlMs = 5 * 60 * 1000;
const draftMutationKeyTtlMs = 60 * 1000;
let lastDraftMutationKey = { signature: '', key: '', ts: 0 };
const draftConversionPollIntervalMs = 20 * 1000;
const draftConversionPollMaxMs = 10 * 60 * 1000;
let draftConversionPoller = {
  timer: null,
  draftId: '',
  startedAt: 0,
  sourceAction: '',
};
let conversionPanelExpanded = false;

const client = ZAFClient.init();
let settings = {};
let appLocation = '';
const DEFAULT_API_BASE_URL = 'https://rvkg901wy9.execute-api.us-east-1.amazonaws.com/prod';
const CENTRAL_TIME_ZONE = 'America/Chicago';
const SHIPPING_RATE_BY_SPEED = {
  'Standard Shipping': 6.99,
  'Expedited Shipping': 12.99,
  '2-Day Shipping': 19.99,
  'Overnight Shipping': 29.99,
};
const centralDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const centralTzFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_TIME_ZONE,
  timeZoneName: 'short',
});
const auditState = {
  enabled: true,
  actorId: '',
  actorName: '',
  actorEmail: '',
  ticketId: '',
  flushTimer: null,
  flushing: false,
  entries: [],
  lastSignature: '',
  lastSignatureAt: 0,
  maxEntriesPerFlush: 25,
};

const US_STATE_MAP = {
  "ALABAMA": "AL",
  "ALASKA": "AK",
  "ARIZONA": "AZ",
  "ARKANSAS": "AR",
  "CALIFORNIA": "CA",
  "COLORADO": "CO",
  "CONNECTICUT": "CT",
  "DELAWARE": "DE",
  "FLORIDA": "FL",
  "GEORGIA": "GA",
  "HAWAII": "HI",
  "IDAHO": "ID",
  "ILLINOIS": "IL",
  "INDIANA": "IN",
  "IOWA": "IA",
  "KANSAS": "KS",
  "KENTUCKY": "KY",
  "LOUISIANA": "LA",
  "MAINE": "ME",
  "MARYLAND": "MD",
  "MASSACHUSETTS": "MA",
  "MICHIGAN": "MI",
  "MINNESOTA": "MN",
  "MISSISSIPPI": "MS",
  "MISSOURI": "MO",
  "MONTANA": "MT",
  "NEBRASKA": "NE",
  "NEVADA": "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  "OHIO": "OH",
  "OKLAHOMA": "OK",
  "OREGON": "OR",
  "PENNSYLVANIA": "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  "TENNESSEE": "TN",
  "TEXAS": "TX",
  "UTAH": "UT",
  "VERMONT": "VT",
  "VIRGINIA": "VA",
  "WASHINGTON": "WA",
  "WEST VIRGINIA": "WV",
  "WISCONSIN": "WI",
  "WYOMING": "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

function normalizeState(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper.length === 2) return upper;
  return US_STATE_MAP[upper] || upper;
}

function roundUpToEven(quantity) {
  const qty = Number(quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 2;
  return qty % 2 === 0 ? qty : qty + 1;
}

function normalizePhoneToEmail(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `1${digits}@hcbl.com`;
  if (digits.length === 11 && digits.startsWith('1')) return `${digits}@hcbl.com`;
  return `${digits}@hcbl.com`;
}

function isValidEmailAddress(email) {
  const value = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeUsPhoneForCustomer(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

function setStatus(el, message, type) {
  el.textContent = message || '';
  el.className = type ? `status ${type}` : 'status';
}

function formatMarketingState(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'unknown' || raw === 'not_subscribed') return 'Not subscribed';
  if (raw === 'subscribed') return 'Subscribed';
  if (raw === 'pending') return 'Pending confirmation';
  if (raw === 'unsubscribed') return 'Unsubscribed';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInventoryBadge(inventory) {
  if (inventory === null || inventory === undefined || inventory === '') {
    return '<span class="inventory-badge">Unknown</span>';
  }
  const qty = Number(inventory);
  if (!Number.isFinite(qty)) return '<span class="inventory-badge">Unknown</span>';
  if (qty <= 0) return '<span class="inventory-badge out">Out</span>';
  if (qty <= 5) return `<span class="inventory-badge low">Low: ${qty}</span>`;
  return `<span class="inventory-badge">In stock: ${qty}</span>`;
}

function ensureSettings() {
  settings.apiBaseUrl = (settings.apiBaseUrl || DEFAULT_API_BASE_URL || '').trim();
  settings.apiKey = (settings.apiKey || settings.apiKeyPublic || '').trim();
  if (!settings.apiBaseUrl) {
    throw new Error('Missing API settings. Check app configuration.');
  }
  if (!settings.apiKey) {
    throw new Error('Missing API key. Check app configuration.');
  }
}

function parseApiErrorMessage(message) {
  const raw = String(message || '');
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.body) {
      const body = JSON.parse(parsed.body);
      return { raw, body };
    }
    return { raw, body: parsed };
  } catch (err) {
    return { raw, body: null };
  }
}

function formatCentralDateTime(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return '';
  const datePart = centralDateFormatter.format(parsed);
  const tzPart = centralTzFormatter.formatToParts(parsed).find((part) => part.type === 'timeZoneName')?.value || 'CT';
  return `${datePart} ${tzPart}`;
}

function summarizeError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return String(err.message);
  try {
    return JSON.stringify(err);
  } catch (jsonErr) {
    return 'Unknown error';
  }
}

function scheduleAuditFlush(delayMs = 15000) {
  if (!auditState.enabled) return;
  if (auditState.flushTimer) clearTimeout(auditState.flushTimer);
  auditState.flushTimer = setTimeout(() => {
    flushAuditToBackend('auto');
  }, delayMs);
}

async function flushAuditToBackend(reason) {
  if (!auditState.enabled || auditState.flushing || !auditState.entries.length) return;
  const pending = auditState.entries.splice(0, auditState.maxEntriesPerFlush);

  auditState.flushing = true;
  try {
    await apiPost('/audit_log', {
      reason: String(reason || 'auto'),
      ticket_id: auditState.ticketId || null,
      actor: {
        id: auditState.actorId || null,
        name: auditState.actorName || null,
        email: auditState.actorEmail || null,
      },
      events: pending.map((entry) => ({
        at: entry.at instanceof Date ? entry.at.toISOString() : new Date(entry.at).toISOString(),
        at_central: formatCentralDateTime(entry.at),
        type: entry.type,
        detail: entry.detail,
      })),
    });
  } catch (err) {
    // Preserve pending entries if append fails.
    auditState.entries = pending.concat(auditState.entries);
    console.warn('Audit backend flush failed', err);
  } finally {
    auditState.flushing = false;
    if (auditState.entries.length) scheduleAuditFlush(20000);
  }
}

function addAuditEntry(type, detail, options = {}) {
  if (!auditState.enabled) return;
  const cleanType = String(type || 'event').trim();
  const cleanDetail = String(detail || '').replace(/\s+/g, ' ').trim();
  if (!cleanType || !cleanDetail) return;
  const signature = `${cleanType}|${cleanDetail}`;
  const now = Date.now();
  if (!options.allowDuplicate && signature === auditState.lastSignature && now - auditState.lastSignatureAt < 1500) {
    return;
  }
  auditState.lastSignature = signature;
  auditState.lastSignatureAt = now;
  auditState.entries.push({ at: new Date(now), type: cleanType, detail: cleanDetail });
  if (options.flushNow) {
    flushAuditToBackend(options.reason || 'immediate');
    return;
  }
  scheduleAuditFlush(options.delayMs || 15000);
}

async function initAuditContext() {
  try {
    const data = await client.get(['currentUser.id', 'currentUser.name', 'currentUser.email', 'ticket.id']);
    auditState.actorId = String(data?.['currentUser.id'] || '').trim();
    auditState.actorName = String(data?.['currentUser.name'] || '').trim();
    auditState.actorEmail = String(data?.['currentUser.email'] || '').trim();
    auditState.ticketId = String(data?.['ticket.id'] || '').trim();
  } catch (err) {
    console.warn('Unable to initialize audit context', err);
  }
  addAuditEntry(
    'session_start',
    `Session started by ${auditState.actorName || 'Unknown Agent'}${auditState.actorId ? ` (Zendesk ID ${auditState.actorId})` : ''}.`,
    { flushNow: true, reason: 'session-start-backend', allowDuplicate: true }
  );
}

function buildProxyUrl(path) {
  const base = (settings.apiBaseUrl || DEFAULT_API_BASE_URL || '').trim().replace(/\/$/, '');
  const target = `${base}${path}`;
  return `/api/v2/zendesk_apps_proxy/proxy/apps/secure/${encodeURIComponent(target)}`;
}

async function apiGet(path) {
  ensureSettings();
  const url = buildProxyUrl(path);
  const shouldAuditFailure = !String(path || '').startsWith('/audit_log');
  try {
    return await client.request({
      url,
      type: 'GET',
      dataType: 'json',
      cache: false,
      headers: {
        'X-Api-Key': settings.apiKey || '',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    if (shouldAuditFailure) {
      addAuditEntry('api_error', `GET ${path} failed: ${summarizeError(err)}`, { flushNow: true, reason: 'api-error' });
    }
    throw err;
  }
}

async function apiPost(path, body, extraHeaders = {}) {
  ensureSettings();
  const url = buildProxyUrl(path);
  const shouldAuditFailure = !String(path || '').startsWith('/audit_log');
  try {
    return await client.request({
      url,
      type: 'POST',
      dataType: 'json',
      contentType: 'application/json',
      cache: false,
      headers: {
        'X-Api-Key': settings.apiKey || '',
        'Accept': 'application/json',
        ...extraHeaders,
      },
      data: JSON.stringify(body),
    });
  } catch (err) {
    if (shouldAuditFailure) {
      addAuditEntry('api_error', `POST ${path} failed: ${summarizeError(err)}`, { flushNow: true, reason: 'api-error' });
    }
    throw err;
  }
}

function renderCustomers(customers, selectedId) {
  els.customerResults.innerHTML = '';
  const list = selectedId ? customers.filter((c) => String(c.id) === String(selectedId)) : customers;
  list.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'customer-result';
    if (selectedId && String(c.id) === String(selectedId)) {
      li.classList.add('is-selected');
    }
    li.innerHTML = `
      <strong>${c.first_name} ${c.last_name}</strong>
      <span class="pill">ID ${c.id}</span>
      <div>${c.email || ''}</div>
    `;
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => handleCustomerSelect(c, customers));
    els.customerResults.appendChild(li);
  });
  syncCustomerSelectionUi(selectedId);
}

function syncCustomerSelectionUi(selectedId) {
  const hasSelection = Boolean(String(selectedId || els.customerId?.value || '').trim());
  if (els.btnClearCustomer) {
    els.btnClearCustomer.classList.toggle('visible', hasSelection);
    els.btnClearCustomer.disabled = !hasSelection;
  }
  if (els.btnCustomerNext) {
    els.btnCustomerNext.disabled = !hasSelection;
  }
}

function renderCustomerProfile(profile) {
  lastCustomerProfile = profile || null;
  if (!els.customerProfile || !els.customerProfileGrid || !els.customerSubscriptions) return;
  if (!profile) {
    els.customerProfile.style.display = 'none';
    els.customerProfileGrid.innerHTML = '';
    els.customerSubscriptions.innerHTML = '';
    return;
  }
  els.customerProfile.style.display = 'block';
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  els.customerProfileGrid.innerHTML = `
    <div class="profile-item"><strong>${fullName || 'Unknown'}</strong>Name</div>
    <div class="profile-item"><strong>${profile.email || '-'}</strong>Email</div>
    <div class="profile-item"><strong>${profile.phone || '-'}</strong>Phone</div>
    <div class="profile-item"><strong>${formatMoney(profile.lifetime_value, profile.currency)}</strong>Lifetime Value</div>
    <div class="profile-item"><strong>${profile.orders_count || 0}</strong>Total Orders</div>
    <div class="profile-item"><strong>${profile.last_order_name || '-'}</strong>Last Order</div>
    <div class="profile-item"><strong>${formatMarketingState(profile.email_marketing_state)} to email</strong>Email subscription status</div>
    <div class="profile-item"><strong>${formatMarketingState(profile.sms_marketing_state)} to SMS</strong>SMS subscription status</div>
  `;

  const subscriptions = Array.isArray(profile.subscriptions) ? profile.subscriptions : [];
  if (!subscriptions.length) {
    els.customerSubscriptions.innerHTML = '<li>No subscription activity found in recent orders.</li>';
    return;
  }
  els.customerSubscriptions.innerHTML = '';
  subscriptions.slice(0, 8).forEach((sub) => {
    const li = document.createElement('li');
    li.textContent = `${sub.sku || ''} ${sub.title || ''} - ${sub.selling_plan || 'Plan'} - Qty ${sub.quantity || 0}`;
    els.customerSubscriptions.appendChild(li);
  });
}

async function applyAgentMacro(text) {
  const message = String(text || '').trim();
  if (!message) return;
  try {
    await client.invoke('ticket.comment.appendText', `${message}\n`);
    setStatus(els.macroStatus, 'Macro inserted into internal note.', 'good');
    addAuditEntry('macro', `Applied macro text (${Math.min(message.length, 120)} chars).`);
  } catch (err) {
    try {
      await navigator.clipboard.writeText(message);
      setStatus(els.macroStatus, 'Could not insert directly. Macro copied to clipboard.', 'bad');
      addAuditEntry('macro', `Macro fallback to clipboard due to append failure: ${summarizeError(err)}.`);
    } catch (clipErr) {
      setStatus(els.macroStatus, 'Unable to insert macro automatically.', 'bad');
      addAuditEntry('macro_error', `Macro apply failed: ${summarizeError(clipErr)}`, { flushNow: true, reason: 'macro-error' });
    }
  }
}

function setActiveModule(step) {
  document.querySelectorAll('.module').forEach((section) => {
    section.classList.toggle('active', section.dataset.step === step);
  });
  const navMap = {
    customer: els.navCustomer,
    orders: els.navOrders,
    order: els.navOrder,
  };
  Object.entries(navMap).forEach(([key, btn]) => {
    if (!btn) return;
    btn.classList.toggle('active', key === step);
  });
}

function renderAddresses(addresses) {
  els.addressSelect.innerHTML = '';
  addresses.forEach((addr, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${addr.address1 || ''}, ${addr.city || ''} ${addr.zip || ''}`.trim();
    els.addressSelect.appendChild(opt);
  });
  updateAddressPreview();
}

function autoSizeShipPreview() {
  if (!els.shipPreview) return;
  const minHeight = 84;
  const maxHeight = 180;
  els.shipPreview.style.height = 'auto';
  const targetHeight = Math.min(maxHeight, Math.max(minHeight, els.shipPreview.scrollHeight));
  els.shipPreview.style.height = `${targetHeight}px`;
  els.shipPreview.style.overflowY = els.shipPreview.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function updateAddressPreview() {
  const idx = Number(els.addressSelect.value || 0);
  const addr = lastAddresses[idx];
  if (!addr) {
    els.shipPreview.value = '';
    autoSizeShipPreview();
    selectedShipState = '';
    updateShippingRestrictionWarning();
    return;
  }
  selectedShipState = normalizeState(addr.provinceCode || addr.province || '');
  els.shipPreview.value = [
    addr.name || '',
    addr.address1 || '',
    addr.address2 || '',
    `${addr.city || ''}, ${addr.province || ''} ${addr.zip || ''}`.trim(),
    addr.country || '',
    addr.phone || '',
  ].filter(Boolean).join('\n');
  autoSizeShipPreview();
  updateShippingRestrictionWarning();
}

function parseRestrictedStates(value) {
  if (!value) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
      }
    } catch (err) {
      // fall through to split parsing
    }
  }
  return raw
    .replace(/[\[\]\"]/g, '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

function generateRequestKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getDraftMutationKey(operation, payload) {
  const signature = JSON.stringify({ operation, payload });
  const now = Date.now();
  if (
    lastDraftMutationKey.signature === signature &&
    (now - lastDraftMutationKey.ts) <= draftMutationKeyTtlMs
  ) {
    return lastDraftMutationKey.key;
  }
  const key = generateRequestKey();
  lastDraftMutationKey = { signature, key, ts: now };
  return key;
}

function cacheGet(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(cache, key, value, maxEntries = productSearchCacheMaxEntries) {
  cache.set(key, { value, ts: Date.now() });
  if (cache.size <= maxEntries) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) cache.delete(oldestKey);
}

function pickVariantBySku(variants, sku) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const target = normalizeSku(sku);
  if (!target) return variants[0] || null;
  return variants.find((variant) => normalizeSku(variant?.sku) === target) || variants[0] || null;
}

function hasRestrictedState(restricted, state) {
  if (!state) return false;
  return restricted.includes(state.toUpperCase());
}

function getCurrentShippingState() {
  const idx = Number(els.addressSelect.value || 0);
  const addr = lastAddresses[idx];
  let currentState = normalizeState(addr?.provinceCode || addr?.province || '');
  if (!currentState) {
    const preview = String(els.shipPreview.value || '');
    const line = preview.split('\n').find((l) => l.includes(',')) || '';
    const parts = line.split(',');
    if (parts.length >= 2) {
      const statePart = parts[1].trim().split(/\s+/)[0];
      currentState = normalizeState(statePart);
    }
  }
  return currentState;
}

function getRestrictedStatesInCart() {
  const restrictedStates = new Set();
  const rows = Array.from(document.querySelectorAll('#orderItems tr[data-restricted]'));
  rows.forEach((row) => {
    const raw = row.getAttribute('data-restricted') || '';
    parseRestrictedStates(raw).forEach((state) => restrictedStates.add(state));
  });
  if (!restrictedStates.size) {
    orderItems.forEach((item) => {
      if (Array.isArray(item.restricted_states)) {
        item.restricted_states.forEach((state) => restrictedStates.add(state));
      }
    });
  }
  return Array.from(restrictedStates.values());
}

function getRestrictedShippingConflictState() {
  const currentState = getCurrentShippingState();
  const restrictedStates = getRestrictedStatesInCart();
  if (!currentState || !restrictedStates.length) return '';
  return hasRestrictedState(restrictedStates, currentState) ? currentState : '';
}

function updateShippingRestrictionWarning() {
  const conflictState = getRestrictedShippingConflictState();
  if (!conflictState) {
    els.shipWarning.style.display = 'none';
    els.shipWarning.textContent = '';
    lastRestrictionConflictState = '';
    return;
  }
  els.shipWarning.style.display = 'block';
  els.shipWarning.textContent = `Caution: One or more items cannot ship to ${conflictState}.`;
  if (lastRestrictionConflictState !== conflictState) {
    addAuditEntry('shipping_restriction_warning', `Cart contains item(s) restricted for state ${conflictState}.`);
    lastRestrictionConflictState = conflictState;
  }
}

function extractAddressValidationSummary(draftOrder) {
  return String(draftOrder?.shippingAddress?.validationResultSummary || '').trim();
}

function classifyAddressValidation(summary) {
  const raw = String(summary || '').trim().toUpperCase();
  if (!raw) return { valid: true, requiresOverride: false, message: '' };
  if (raw.includes('VALID')) {
    return { valid: true, requiresOverride: false, message: 'Address validated by Shopify.' };
  }
  return {
    valid: false,
    requiresOverride: true,
    message: `Address validation warning: ${formatStatusLabel(raw)}`,
  };
}

function refreshUpdateButtonState() {
  if (!els.btnCreateDraft) return;
  const blocked = currentAddressValidation.requiresOverride && !els.addressOverride?.checked;
  els.btnCreateDraft.disabled = Boolean(blocked);
}

function applyAddressValidationState(draftOrder) {
  const summary = extractAddressValidationSummary(draftOrder);
  currentAddressValidation = classifyAddressValidation(summary);
  if (!els.addressValidation || !els.addressOverrideWrap) return;

  if (!currentAddressValidation.message) {
    els.addressValidation.style.display = 'none';
    els.addressValidation.textContent = '';
    els.addressOverrideWrap.style.display = 'none';
    if (els.addressOverride) els.addressOverride.checked = false;
    refreshUpdateButtonState();
    return;
  }

  els.addressValidation.style.display = 'block';
  els.addressValidation.textContent = currentAddressValidation.message;
  if (currentAddressValidation.valid) {
    els.addressValidation.style.background = '#eaf8f0';
    els.addressValidation.style.borderColor = '#9fd8b6';
    els.addressValidation.style.color = '#135d38';
    els.addressOverrideWrap.style.display = 'none';
    if (els.addressOverride) els.addressOverride.checked = false;
  } else {
    els.addressValidation.style.background = '#fff4e5';
    els.addressValidation.style.borderColor = '#f5c26b';
    els.addressValidation.style.color = '#7a4b00';
    els.addressOverrideWrap.style.display = 'block';
  }
  refreshUpdateButtonState();
}

function renderSkuCard(variant) {
  if (!els.skuCard) return;
  if (!variant) {
    els.skuCard.innerHTML = '';
    els.skuCard.style.display = 'none';
    return;
  }
  const img = variant.image_url ? `<img src="${variant.image_url}" alt="${variant.image_alt || ''}">` : '<div class="pill">No image</div>';
  const bogo = variant.bogo ? '<span class="pill">BOGO</span>' : '';
  const inventoryBadge = getInventoryBadge(variant.inventory_quantity);
  const restricted = parseRestrictedStates(variant.restricted_states || '');
  const restrictedLabel = restricted.length ? `<span class="pill">Restricted: ${restricted.join(', ')}</span>` : '';
  els.skuCard.style.display = '';
  els.skuCard.innerHTML = `
    <div class="sku-card">
      ${img}
      <div>
        <div><strong>${variant.product?.title || variant.title}</strong></div>
        <div class="status">SKU ${variant.sku} - $${variant.price} ${bogo} ${restrictedLabel} ${inventoryBadge}</div>
        <div class="row" style="margin-top:8px;">
          <button type="button" class="btn-compact secondary" data-role="add-variant-card">Add To Order</button>
        </div>
      </div>
    </div>
  `;
  const addBtn = els.skuCard.querySelector('[data-role="add-variant-card"]');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const qty = Math.max(1, Number(els.skuQty?.value || 1));
      if (addVariantToCart(variant, qty, 'sku-card')) {
        clearSkuLookupUi();
        setStatus(els.skuStatus, 'Added to order.', 'good');
      }
    });
  }
}

function renderProductResults(variants) {
  if (!els.productResults) return;
  if (!variants || !variants.length) {
    els.productResults.innerHTML = '';
    return;
  }
  const items = variants.slice(0, 10).map((variant, index) => {
    const img = variant.image_url || variant.product?.featuredImage?.url || '';
    const title = variant.product?.title || variant.title || '';
    const sku = variant.sku || '';
    const price = variant.price ? `$${variant.price}` : '';
    const inventory = getInventoryBadge(variant.inventory_quantity);
    return `
      <li>
        <div style="display:flex; gap:10px; align-items:center;">
          ${img ? `<img src="${img}" alt="${variant.image_alt || ''}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">` : ''}
          <div style="flex:1;">
            <div style="font-weight:600;">${title}</div>
            <div style="font-size:12px; color:#556;">${sku} ${price} ${inventory}</div>
          </div>
          <button class="btn-compact secondary" data-index="${index}">Add To Order</button>
        </div>
      </li>
    `;
  }).join('');
  els.productResults.innerHTML = `<ul class="list">${items}</ul>`;
  Array.from(els.productResults.querySelectorAll('button[data-index]')).forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.getAttribute('data-index'));
      const variant = variants[index];
      if (!variant) return;
      const qty = Math.max(1, Number(els.skuQty?.value || 1));
      if (addVariantToCart(variant, qty, 'product-search')) {
        els.sku.value = variant.sku || '';
        clearSkuLookupUi();
        setStatus(els.skuStatus, 'Added to order.', 'good');
      }
    });
  });
}

async function lookupSkuAndRender(sku, options = {}) {
  const { throwOnMissing = true } = options;
  setStatus(els.skuStatus, 'Looking up SKU...', '');
  const data = await apiGet(`/sku_lookup?sku=${encodeURIComponent(sku)}&limit=5&cb=${Date.now()}`);
  const variant = data.variant || pickVariantBySku(data.variants || [], sku);
  if (!variant) {
    addAuditEntry('sku_lookup_miss', `No variant found for SKU/query "${sku}".`);
    if (throwOnMissing) throw new Error('No variant found');
    return null;
  }
  lastVariant = variant;
  els.variantPrice.value = variant.price || '';
  renderSkuCard(variant);
  if (variant.bogo) {
    setAutoBogoPromoCode();
  }
  addAuditEntry('sku_lookup_hit', `Matched SKU ${variant.sku || sku}${variant.bogo ? ' (BOGO)' : ''}.`);
  setStatus(els.skuStatus, `Found ${data.count} variant(s).`, 'good');
  return variant;
}

function addVariantToCart(variant, qty = 1, source = 'manual') {
  if (!variant) return false;
  let safeQty = Math.max(1, Number(qty || 1));
  if (variant.bogo) {
    safeQty = roundUpToEven(safeQty);
    setAutoBogoPromoCode();
  }
  const existing = orderItems.find((item) => item.variantId === variant.id);
  if (existing) {
    existing.quantity = variant.bogo ? roundUpToEven(existing.quantity + safeQty) : existing.quantity + safeQty;
  } else {
    orderItems.push({
      variantId: variant.id,
      sku: variant.sku,
      title: variant.product?.title || variant.title,
      price: variant.price,
      quantity: safeQty,
      bogo: Boolean(variant.bogo),
      inventory_quantity: variant.inventory_quantity ?? null,
      image_url: variant.image_url || '',
      image_alt: variant.image_alt || '',
      restricted_states: parseRestrictedStates(variant.restricted_states || ''),
    });
  }
  renderOrderItems();
  updateShippingRestrictionWarning();
  addAuditEntry('line_item_add', `Added SKU ${variant.sku || ''} qty ${safeQty}${variant.bogo ? ' (BOGO)' : ''} via ${source}.`);
  return true;
}

function clearSkuLookupUi() {
  lastVariant = null;
  renderSkuCard(null);
  if (els.productResults) els.productResults.innerHTML = '';
  if (els.variantPrice) els.variantPrice.value = '';
}

function renderOrderItems() {
  els.orderItems.innerHTML = '';
  orderItems.forEach((item, idx) => {
    const tr = document.createElement('tr');
    const restrictedRaw = Array.isArray(item.restricted_states) ? item.restricted_states.join(',') : '';
    tr.setAttribute('data-restricted', restrictedRaw);
    const imgCell = item.image_url ? `<img src="${item.image_url}" alt="${item.image_alt || ''}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #d8e0ea;">` : '';
    tr.innerHTML = `
      <td>${imgCell}</td>
      <td>${item.sku}</td>
      <td>${item.title}${item.bogo ? ' (BOGO)' : ''}</td>
      <td>$${item.price || ''}</td>
      <td>${getInventoryBadge(item.inventory_quantity)}</td>
      <td><input class="qty-input" type="number" min="1" value="${item.quantity}"></td>
      <td><button class="secondary">Remove</button></td>
    `;
    const qtyInput = tr.querySelector('input');
    qtyInput.addEventListener('change', () => {
      const val = Math.max(1, Number(qtyInput.value || 1));
      item.quantity = val;
      updateShippingCostDisplay();
      addAuditEntry('line_item_qty', `Updated qty for ${item.sku || item.variantId || 'item'} to ${val}.`);
    });
    const removeBtn = tr.querySelector('button');
    removeBtn.addEventListener('click', () => {
      addAuditEntry('line_item_remove', `Removed ${item.sku || item.variantId || 'item'} from cart.`);
      orderItems.splice(idx, 1);
      renderOrderItems();
    });
    const priceCell = tr.querySelector('td:nth-child(4)');
    if (Number(item.discount_total || 0) > 0 && item.original_price && item.quantity) {
      const unitDiscount = Number(item.discount_total) / Number(item.quantity || 1);
      const discounted = Math.max(0, Number(item.original_price) - unitDiscount);
      priceCell.innerHTML = `
        <span class="price-strike">$${Number(item.original_price).toFixed(2)}</span>
        <span class="price-new">$${discounted.toFixed(2)}</span>
        <span class="price-savings">Savings: $${Number(unitDiscount).toFixed(2)} each</span>
      `;
    }
    els.orderItems.appendChild(tr);
  });
  updateShippingCostDisplay();
  renderUpsellSuggestions();
}

function getCartSkuSet() {
  const skus = new Set();
  orderItems.forEach((item) => {
    const sku = normalizeSku(item.sku);
    if (sku) skus.add(sku);
  });
  return skus;
}

function estimateServingsPerContainer(...parts) {
  const source = parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' | ');
  if (!source) return 0;

  const matchers = [
    /(\d{1,4})\s*(?:servings?|serves?)\b/i,
    /(\d{1,4})\s*(?:capsules?|caps?|caplets?|softgels?|tablets?|tabs?|gummies?|chewables?|packets?|sachets?|count|ct)\b/i,
    /\b(?:count|ct)\s*(\d{1,4})\b/i,
  ];

  for (const pattern of matchers) {
    const match = source.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0 && value <= 2000) return value;
  }
  return 0;
}

function getLowSupplyInsight(candidate) {
  const lastPurchasedTs = Number(candidate?.lastPurchasedTs || 0);
  if (!Number.isFinite(lastPurchasedTs) || lastPurchasedTs <= 0) return null;

  const lastQuantity = Math.max(1, Number(candidate?.lastQuantity || 1));
  const servingsPerContainer = estimateServingsPerContainer(
    candidate?.title,
    candidate?.variant?.title,
    candidate?.variant?.product?.title,
    candidate?.variant?.image_alt,
    candidate?.image_alt
  );
  if (!servingsPerContainer) return null;

  const daysSincePurchase = Math.floor((Date.now() - lastPurchasedTs) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(daysSincePurchase) || daysSincePurchase < 0) return null;

  const estimatedSupplyDays = servingsPerContainer * lastQuantity;
  if (!Number.isFinite(estimatedSupplyDays) || estimatedSupplyDays <= 0) return null;

  const startWindow = Math.max(0, estimatedSupplyDays - 7);
  const endWindow = estimatedSupplyDays + 30;
  if (daysSincePurchase < startWindow || daysSincePurchase > endWindow) return null;

  const daysDelta = daysSincePurchase - estimatedSupplyDays;
  const timingText = daysDelta >= 0
    ? `${daysDelta} day${daysDelta === 1 ? '' : 's'} past estimate`
    : `${Math.abs(daysDelta)} day${Math.abs(daysDelta) === 1 ? '' : 's'} before estimate`;

  return {
    text: `Likely getting low: est. ${estimatedSupplyDays}-day supply (${servingsPerContainer}/container x qty ${lastQuantity}), last bought ${daysSincePurchase} day${daysSincePurchase === 1 ? '' : 's'} ago (${timingText}).`,
    urgent: daysDelta >= 14,
  };
}

function getUpsellCandidatesFromOrders(limit = 24) {
  const bySku = new Map();
  lastOrders.forEach((order) => {
    const orderTs = Date.parse(order.processed_at || order.updated_at || order.created_at || '') || 0;
    const lines = Array.isArray(order.line_items) ? order.line_items : [];
    lines.forEach((line) => {
      const sku = normalizeSku(line.sku);
      if (!sku) return;
      const existing = bySku.get(sku) || {
        sku,
        title: line.title || '',
        image_url: line.image_url || '',
        image_alt: line.image_alt || '',
        timesPurchased: 0,
        lastPurchasedTs: 0,
        lastQuantity: 1,
      };
      existing.timesPurchased += Number(line.quantity || 1) > 0 ? 1 : 0;
      if (orderTs >= existing.lastPurchasedTs) {
        existing.lastPurchasedTs = orderTs;
        const qty = Number(line.quantity || 1);
        existing.lastQuantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
      }
      if (!existing.title && line.title) existing.title = line.title;
      if (!existing.image_url && line.image_url) existing.image_url = line.image_url;
      bySku.set(sku, existing);
    });
  });
  return Array.from(bySku.values())
    .sort((a, b) => (b.lastPurchasedTs - a.lastPurchasedTs) || (b.timesPurchased - a.timesPurchased))
    .slice(0, limit);
}

async function getVariantForUpsellCandidate(candidate) {
  const cacheKey = normalizeSku(candidate?.sku);
  if (!cacheKey) return null;
  const cached = cacheGet(upsellVariantCache, cacheKey, upsellVariantCacheTtlMs);
  if (cached !== null) return cached;
  try {
    const data = await apiGet(`/sku_lookup?sku=${encodeURIComponent(cacheKey)}&limit=5&cb=${Date.now()}`);
    const variant = data.variant || pickVariantBySku(data.variants || [], cacheKey);
    cacheSet(upsellVariantCache, cacheKey, variant || null, 200);
    return variant || null;
  } catch (err) {
    cacheSet(upsellVariantCache, cacheKey, null, 200);
    return null;
  }
}

function setUpsellExpanded(expanded) {
  upsellExpanded = Boolean(expanded);
  if (!els.upsellPanel || !els.btnUpsellToggle) return;
  els.upsellPanel.style.display = upsellExpanded ? 'block' : 'none';
  els.btnUpsellToggle.setAttribute('aria-expanded', String(upsellExpanded));
  if (els.upsellCaret) els.upsellCaret.textContent = upsellExpanded ? '▾' : '▸';
}

function renderUpsellSuggestions() {
  if (!els.upsellList || !els.upsellToggleText || !els.upsellStatus) return;
  const cartSkus = getCartSkuSet();
  const visible = upsellSuggestions.filter((item) => !cartSkus.has(normalizeSku(item.sku)));
  els.upsellToggleText.textContent = `Upsell ideas (${visible.length})`;
  if (!visible.length) {
    els.upsellList.innerHTML = '<div class="upsell-empty">No in-stock prior purchases available outside the cart.</div>';
    return;
  }
  const rows = visible.map((item) => {
    const thumb = item.image_url ? `<img src="${item.image_url}" alt="${item.image_alt || ''}" />` : '<div class="pill">No image</div>';
    const bogo = item.variant?.bogo ? '<span class="pill">BOGO</span>' : '';
    const inventory = getInventoryBadge(item.variant?.inventory_quantity);
    const lowSupply = getLowSupplyInsight(item);
    return `
      <div class="upsell-row">
        ${thumb}
        <div>
          <div class="upsell-title">${item.title || item.variant?.product?.title || item.sku}</div>
          <div class="upsell-meta">
            <span>${item.sku}</span>
            <span>$${item.variant?.price || ''}</span>
            <span>Bought before: ${item.timesPurchased || 1}x</span>
            ${bogo}
            ${inventory}
          </div>
          ${lowSupply ? `<div class="upsell-callout${lowSupply.urgent ? ' urgent' : ''}">${lowSupply.text}</div>` : ''}
        </div>
        <button class="secondary btn-compact" data-upsell-sku="${item.sku}" type="button">Add</button>
      </div>
    `;
  }).join('');
  els.upsellList.innerHTML = rows;
  Array.from(els.upsellList.querySelectorAll('button[data-upsell-sku]')).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sku = normalizeSku(btn.getAttribute('data-upsell-sku'));
      if (!sku) return;
      const suggestion = upsellSuggestions.find((item) => normalizeSku(item.sku) === sku);
      if (!suggestion?.variant) return;
      addVariantToCart(suggestion.variant, 1, 'upsell');
      setStatus(els.skuStatus, `Added upsell SKU ${sku}.`, 'good');
      renderUpsellSuggestions();
    });
  });
}

async function refreshUpsellSuggestions() {
  if (!els.upsellStatus) return;
  const version = ++upsellSuggestionVersion;
  if (!lastOrders.length) {
    upsellSuggestions = [];
    setStatus(els.upsellStatus, 'Select a customer to load upsell ideas from prior orders.', '');
    renderUpsellSuggestions();
    return;
  }
  const candidates = getUpsellCandidatesFromOrders(24);
  if (!candidates.length) {
    upsellSuggestions = [];
    setStatus(els.upsellStatus, 'No prior purchase history found for upsell.', '');
    renderUpsellSuggestions();
    return;
  }

  setStatus(els.upsellStatus, 'Building upsell ideas from prior purchases...', '');
  const cartSkus = getCartSkuSet();
  const suggestions = [];
  for (const candidate of candidates) {
    if (suggestions.length >= 10) break;
    if (version !== upsellSuggestionVersion) return;
    if (cartSkus.has(normalizeSku(candidate.sku))) continue;
    const variant = await getVariantForUpsellCandidate(candidate);
    if (!variant?.id) continue;
    const inventory = Number(variant.inventory_quantity);
    if (Number.isFinite(inventory) && inventory <= 0) continue;
    suggestions.push({
      ...candidate,
      title: candidate.title || variant.product?.title || variant.title || candidate.sku,
      image_url: candidate.image_url || variant.image_url || '',
      image_alt: candidate.image_alt || variant.image_alt || '',
      variant,
    });
  }
  if (version !== upsellSuggestionVersion) return;
  upsellSuggestions = suggestions;
  setStatus(els.upsellStatus, suggestions.length ? `Found ${suggestions.length} upsell item(s).` : 'No in-stock upsell items found.', suggestions.length ? 'good' : '');
  renderUpsellSuggestions();
}

function applyDraftDiscountsToCurrentItems(draftOrder) {
  if (!draftOrder || !orderItems.length) return;

  const draftLineItems = draftOrder.lineItems?.edges || [];
  const draftByVariantId = new Map();
  draftLineItems.forEach(({ node }) => {
    const variantId = node?.variant?.id || '';
    if (!variantId) return;
    draftByVariantId.set(variantId, node);
  });

  orderItems = orderItems.map((item) => {
    const draftNode = draftByVariantId.get(item.variantId);
    const draftQty = Number(draftNode?.quantity || item.quantity || 1);
    const lineDiscount = parseMoneyAmount(draftNode?.totalDiscountSet?.presentmentMoney?.amount);
    const basePrice = parseMoneyAmount(item.original_price || item.price);
    return {
      ...item,
      quantity: Number.isFinite(draftQty) && draftQty > 0 ? draftQty : item.quantity,
      original_price: basePrice > 0 ? basePrice.toFixed(2) : item.original_price || item.price || '',
      discount_total: lineDiscount > 0 ? lineDiscount.toFixed(2) : '',
    };
  });

  const orderLevelDiscount = getDraftDiscountAmount(draftOrder);
  const hasLineDiscounts = orderItems.some((item) => parseMoneyAmount(item.discount_total) > 0);
  if (orderLevelDiscount > 0 && !hasLineDiscounts) {
    const totalBase = orderItems.reduce((sum, item) => {
      const unit = parseMoneyAmount(item.original_price || item.price);
      const qty = Number(item.quantity || 1);
      return sum + (Number.isFinite(qty) && qty > 0 ? unit * qty : 0);
    }, 0);
    if (totalBase > 0) {
      orderItems = orderItems.map((item) => {
        const unit = parseMoneyAmount(item.original_price || item.price);
        const qty = Number(item.quantity || 1);
        const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
        const allocated = orderLevelDiscount * ((unit * safeQty) / totalBase);
        return {
          ...item,
          discount_total: allocated > 0 ? allocated.toFixed(2) : item.discount_total,
        };
      });
    }
  }
}

async function enrichOrderItemsFromSkus(items) {
  const updated = [];
  let anyBogo = false;
  for (const item of items) {
    if (!item.sku) {
      updated.push(item);
      continue;
    }
    try {
      const data = await apiGet(`/sku_lookup?sku=${encodeURIComponent(item.sku)}&limit=5&cb=${Date.now()}`);
      const variant = data.variant || pickVariantBySku(data.variants || [], item.sku);
      if (variant) {
        const bogo = Boolean(variant.bogo);
        const qty = bogo ? roundUpToEven(item.quantity) : item.quantity;
        if (bogo) anyBogo = true;
        updated.push({
          ...item,
          variantId: variant.id || item.variantId || '',
          title: item.fromDraft && item.title ? item.title : (variant.product?.title || variant.title || item.title),
          price: item.fromDraft && item.price ? item.price : (variant.price || item.price),
          bogo,
          quantity: qty,
          inventory_quantity: variant.inventory_quantity ?? item.inventory_quantity ?? null,
          image_url: variant.image_url || item.image_url || '',
          image_alt: variant.image_alt || item.image_alt || '',
          restricted_states: parseRestrictedStates(variant.restricted_states || ''),
        });
        continue;
      }
    } catch (err) {
      // keep existing item data if lookup fails
    }
    updated.push(item);
  }
  return { items: updated, anyBogo };
}

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '';
  return `${currency || ''} ${amount}`.trim();
}

function formatStatusLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown';
  const normalized = raw.replace(/_/g, ' ').toLowerCase();
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFulfillmentLabel(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'Unknown';
  if (raw === 'FULFILLED') return 'Shipped';
  if (raw === 'PARTIALLY_FULFILLED') return 'Partially Shipped';
  if (raw === 'UNFULFILLED') return 'Not Shipped';
  if (raw === 'ON_HOLD') return 'On Hold';
  return formatStatusLabel(raw);
}

function formatShipmentState(value, fallbackFulfillment) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'SUCCESS') return 'Shipped';
  if (raw === 'OPEN') return 'In Progress';
  if (raw === 'CANCELLED') return 'Canceled';
  if (raw === 'ERROR' || raw === 'FAILURE') return 'Issue';
  return formatFulfillmentLabel(fallbackFulfillment);
}

function formatFulfillmentEventLabel(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'Update';
  if (raw === 'LABEL_PRINTED' || raw === 'LABEL_PURCHASED') return 'Label Created';
  if (raw === 'CONFIRMED') return 'Confirmed';
  if (raw === 'IN_TRANSIT') return 'In Transit';
  if (raw === 'OUT_FOR_DELIVERY') return 'Out for Delivery';
  if (raw === 'DELIVERED') return 'Delivered';
  if (raw === 'FAILURE' || raw === 'ATTEMPTED_DELIVERY') return 'Delivery Issue';
  if (raw === 'READY_FOR_PICKUP') return 'Ready for Pickup';
  return formatStatusLabel(raw);
}

function summarizeShipmentUpdate(shipment) {
  if (!shipment || typeof shipment !== 'object') return '';
  const events = Array.isArray(shipment.events) ? shipment.events : [];
  const latest = events.find((event) => event && (event.status || event.message || event.happened_at));
  if (latest) {
    const label = formatFulfillmentEventLabel(latest.status);
    const at = formatOrderDateTime(latest.happened_at);
    return at ? `${label} • ${at}` : label;
  }
  if (shipment.delivered_at) {
    const at = formatOrderDateTime(shipment.delivered_at);
    return at ? `Delivered • ${at}` : 'Delivered';
  }
  if (shipment.in_transit_at) {
    const at = formatOrderDateTime(shipment.in_transit_at);
    return at ? `In Transit • ${at}` : 'In Transit';
  }
  if (shipment.estimated_delivery_at) {
    const at = formatOrderDateTime(shipment.estimated_delivery_at);
    return at ? `Estimated Delivery • ${at}` : 'Estimated Delivery';
  }
  return '';
}

function getShipmentExpectedDelivery(shipment) {
  if (!shipment || typeof shipment !== 'object') return '';
  const events = Array.isArray(shipment.events) ? shipment.events : [];
  const eventEta = events.find((event) => event && event.estimated_delivery_at)?.estimated_delivery_at;
  return formatOrderDateTime(eventEta || shipment.estimated_delivery_at);
}

function formatFraudLevel(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw || raw === 'UNKNOWN') return 'Not Available';
  if (raw === 'LOW') return 'Low';
  if (raw === 'MEDIUM') return 'Medium';
  if (raw === 'HIGH') return 'High';
  return formatStatusLabel(raw);
}

function formatFraudRecommendation(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'No recommendation';
  if (raw === 'ACCEPT') return 'Accept';
  if (raw === 'INVESTIGATE') return 'Investigate';
  if (raw === 'CANCEL') return 'Cancel';
  return formatStatusLabel(raw);
}

function formatOrderDateTime(...values) {
  const raw = values.find((value) => String(value || '').trim());
  if (!raw) return '';
  return formatCentralDateTime(raw);
}

function renderOrders(orders, draftOrders) {
  els.ordersList.innerHTML = '';
  const hasOrders = orders.length || draftOrders.length;
  if (!hasOrders) {
    els.ordersList.innerHTML = '<div class="status">No recent orders found.</div>';
    return;
  }

  const createSection = ({ title, count, collapsed, onToggle }) => {
    const wrap = document.createElement('div');
    wrap.className = 'orders-section';
    const header = document.createElement('div');
    header.className = 'orders-section-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.margin = '6px 0';
    header.innerHTML = `<strong>${title} (${count})</strong>`;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'secondary btn-compact';
    toggleBtn.textContent = collapsed ? 'Show' : 'Hide';
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.addEventListener('click', () => {
      onToggle(!collapsed);
    });
    header.appendChild(toggleBtn);
    wrap.appendChild(header);
    const body = document.createElement('div');
    body.style.display = collapsed ? 'none' : 'block';
    wrap.appendChild(body);
    els.ordersList.appendChild(wrap);
    return body;
  };

  let draftBody = null;
  if (draftOrders.length) {
    draftBody = createSection({
      title: 'Draft Orders',
      count: draftOrders.length,
      collapsed: draftOrdersCollapsed,
      onToggle: (next) => {
        draftOrdersCollapsed = next;
        renderOrders(lastOrders, lastDraftOrders);
      },
    });
  }

  draftOrders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-card';
    const items = order.line_items || [];
    const draftCreated = formatOrderDateTime(order.created_at, order.createdAt);
    const draftUpdated = formatOrderDateTime(order.updated_at, order.updatedAt);
    card.innerHTML = `
      <div class="order-header">
        <div>
          <strong>${order.name || 'Draft Order'}</strong>
          <div class="order-meta">
            <span class="pill">${order.status || 'OPEN'}</span>
            <span class="pill">${formatMoney(order.total, order.currency)}</span>
            ${draftCreated ? `<span class="pill">Created: ${draftCreated}</span>` : ''}
            ${draftUpdated ? `<span class="pill">Updated: ${draftUpdated}</span>` : ''}
          </div>
        </div>
        <div class="pill">Draft</div>
      </div>
      <ul class="order-items" style="display:none;"></ul>
      <div class="order-actions">
        <button class="secondary">Open Draft</button>
        ${order.invoice_url ? '<a class="invoice-link" target="_blank" rel="noopener">Invoice</a>' : ''}
      </div>
    `;

    const list = card.querySelector('.order-items');
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.sku || ''} - ${item.title || ''} - Qty ${item.quantity || 0}`;
      list.appendChild(li);
    });

    const header = card.querySelector('.order-header');
    header.addEventListener('click', () => {
      list.style.display = list.style.display === 'none' ? 'block' : 'none';
    });

    const openBtn = card.querySelector('button');
    const actionButtons = card.querySelectorAll('.order-actions button');
    actionButtons.forEach((btn) => {
      btn.addEventListener('mouseenter', () => card.classList.add('is-hover'));
      btn.addEventListener('mouseleave', () => card.classList.remove('is-hover'));
      btn.addEventListener('click', () => {
        btn.classList.add('clicked');
        setTimeout(() => btn.classList.remove('clicked'), 200);
      });
    });
    openBtn.addEventListener('click', async () => {
      if (openBtn.classList.contains('is-working')) {
        setStatus(els.draftStatus, 'Draft open already in progress...', 'progress');
        return;
      }
      const originalOpenLabel = openBtn.textContent || 'Open Draft';
      try {
        const draftId = order.legacy_id || '';
        stopDraftConversionPolling('draft_open_switch');
        showConversionPanel(false);
        addAuditEntry('draft_open', `Opening draft ${order.name || draftId || 'unknown'}.`);
        openBtn.disabled = true;
        openBtn.classList.add('is-working');
        openBtn.setAttribute('aria-busy', 'true');
        openBtn.textContent = 'Opening...';
        els.draftOrderId.value = draftId;
        setStatus(els.draftStatus, `Loading ${order.name || 'draft order'}...`, 'progress');
        const data = await apiGet(`/draft_order_get?draft_order_id=${encodeURIComponent(draftId)}`);
        const draft = data.draft_order || {};
        setInvoiceUrl(draft.invoiceUrl || order.invoice_url || '');
        setTotals(draft);
        const loadedDiscount = getDraftDiscountAmount(draft);
        if (loadedDiscount > 0) {
          setStatus(els.promoStatus, `Loaded draft includes -$${loadedDiscount.toFixed(2)} in discounts.`, 'good');
        } else {
          clearPromoStatus();
        }
        setShippingLineFromDraft(draft);
        setDraftButtonState(true);
        applyAddressValidationState(draft);
        const lineEdges = draft.lineItems?.edges || [];
        orderItems = lineEdges.map(({ node }) => ({
          variantId: node.variant?.id || '',
          sku: node.sku || node.variant?.sku || '',
          title: node.variant?.product?.title || node.title || node.name || node.variant?.title || '',
          price: node.originalUnitPriceSet?.presentmentMoney?.amount || '',
          original_price: node.originalUnitPriceSet?.presentmentMoney?.amount || '',
          discount_total: node.totalDiscountSet?.presentmentMoney?.amount || '',
          currency: node.originalUnitPriceSet?.presentmentMoney?.currencyCode || '',
          quantity: node.quantity || 1,
          inventory_quantity: null,
          restricted_states: [],
          image_url: node.variant?.image?.url || node.variant?.product?.featuredImage?.url || '',
          image_alt: node.variant?.image?.altText || node.variant?.product?.featuredImage?.altText || '',
          fromDraft: true,
        })).filter((item) => item.variantId);
        const orderLevelDiscount = Number(draft.totalDiscountsSet?.presentmentMoney?.amount || 0);
        const hasLineDiscounts = orderItems.some((item) => Number(item.discount_total || 0) > 0);
        if (orderLevelDiscount > 0 && !hasLineDiscounts) {
          const totalBase = orderItems.reduce((sum, item) => {
            const unit = Number(item.original_price || item.price || 0);
            const qty = Number(item.quantity || 1);
            return sum + unit * qty;
          }, 0);
          if (totalBase > 0) {
            orderItems = orderItems.map((item) => {
              const unit = Number(item.original_price || item.price || 0);
              const qty = Number(item.quantity || 1);
              const base = unit * qty;
              const allocated = (orderLevelDiscount * (base / totalBase));
              return {
                ...item,
                discount_total: allocated > 0 ? allocated.toFixed(2) : item.discount_total,
              };
            });
          }
        }
        const enriched = await enrichOrderItemsFromSkus(orderItems);
        orderItems = enriched.items;
        if (enriched.anyBogo) {
          setAutoBogoPromoCode();
        }
        renderOrderItems();
        updateShippingRestrictionWarning();
        setStatus(els.draftStatus, `Loaded ${order.name || 'draft order'} for editing.`, 'good');
        addAuditEntry('draft_open_success', `Loaded draft ${order.name || draftId || 'unknown'} into cart.`);
        setActiveModule('order');
      } catch (err) {
        setStatus(els.draftStatus, err.message, 'bad');
        addAuditEntry('draft_open_error', `Failed opening draft ${order.name || order.legacy_id || 'unknown'}: ${summarizeError(err)}`, { flushNow: true, reason: 'draft-open-error' });
      } finally {
        openBtn.disabled = false;
        openBtn.classList.remove('is-working');
        openBtn.removeAttribute('aria-busy');
        openBtn.textContent = originalOpenLabel;
      }
    });

    const link = card.querySelector('a');
    if (link && order.invoice_url) {
      link.href = order.invoice_url;
    }

    if (draftBody) draftBody.appendChild(card);
  });

  let ordersBody = null;
  if (orders.length) {
    ordersBody = createSection({
      title: 'Orders',
      count: orders.length,
      collapsed: customerOrdersCollapsed,
      onToggle: (next) => {
        customerOrdersCollapsed = next;
        renderOrders(lastOrders, lastDraftOrders);
      },
    });
  }

  orders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-card order-item-card';
    const items = order.line_items || [];
    const shipmentStatus = formatFulfillmentLabel(order.fulfillment_status || '');
    const paymentStatus = formatStatusLabel(order.financial_status || '');
    const fraud = order.fraud_analysis || {};
    const fraudLevel = formatFraudLevel(fraud.level || '');
    const processed = formatOrderDateTime(order.processed_at, order.processedAt);
    const orderUpdated = formatOrderDateTime(order.updated_at, order.updatedAt);
    card.innerHTML = `
      <div class="order-header">
        <div>
          <strong>${order.name || 'Order'}</strong>
          <div class="order-meta">
            <span class="pill">Shipping: ${shipmentStatus}</span>
            <span class="pill">Payment: ${paymentStatus}</span>
            <span class="pill">Fraud: ${fraudLevel}</span>
            <span class="pill">${formatMoney(order.total, order.currency)}</span>
            ${processed ? `<span class="pill">Placed: ${processed}</span>` : ''}
            ${orderUpdated ? `<span class="pill">Updated: ${orderUpdated}</span>` : ''}
            ${order.legacy_id ? `<span class="pill">Order #: ${order.legacy_id}</span>` : ''}
          </div>
        </div>
        <button class="secondary order-expand-toggle" type="button" aria-label="Expand order details" aria-expanded="false" title="Expand order details">▸</button>
      </div>
      <div class="order-items" style="display:none;"></div>
      <div class="order-actions">
        <button class="secondary btn-reorder">Reorder Items</button>
        <button class="secondary btn-hold">Put On Hold</button>
        <button class="secondary btn-cancel">Cancel Order</button>
        <button class="secondary btn-refund">Refund</button>
      </div>
    `;

    const details = card.querySelector('.order-items');
    const itemsSection = document.createElement('div');
    itemsSection.className = 'order-detail-section';
    const itemsTitle = document.createElement('div');
    itemsTitle.className = 'order-detail-title';
    itemsTitle.textContent = 'Line Items';
    const itemsList = document.createElement('div');
    itemsList.className = 'order-detail-list';
    itemsSection.appendChild(itemsTitle);
    itemsSection.appendChild(itemsList);
    details.appendChild(itemsSection);

    items.forEach((item) => {
      const li = document.createElement('div');
      li.className = 'order-detail-row';
      const fulfilledQty = Number(item.fulfilled_quantity || 0);
      const totalQty = Number(item.quantity || 0);
      const paidTotal = item.total_amount ? formatMoney(item.total_amount, item.currency || order.currency) : '';
      const thumb = item.image_url || '';
      const safeTitle = item.title || '';
      const safeSku = item.sku || '';
      const fulfillmentText = totalQty > 0
        ? `Fulfilled ${Math.min(fulfilledQty, totalQty)}/${totalQty}`
        : 'Fulfillment unknown';
      li.innerHTML = `
        <div class="detail-left">
          ${thumb ? `<img class="detail-thumb" src="${thumb}" alt="${safeTitle || safeSku}" loading="lazy" />` : '<div class="detail-thumb detail-thumb-empty">No image</div>'}
          <div class="detail-text">
            <span class="detail-main">${safeSku} - ${safeTitle}</span>
            <span class="detail-meta">Qty ${totalQty} - ${fulfillmentText}</span>
          </div>
        </div>
        <div class="detail-right">
          <span class="detail-paid-label">Paid</span>
          <span class="detail-paid-value">${paidTotal || '-'}</span>
        </div>
      `;
      itemsList.appendChild(li);
    });

    const shipSection = document.createElement('div');
    shipSection.className = 'order-detail-section';
    const shipTitle = document.createElement('div');
    shipTitle.className = 'order-detail-title';
    shipTitle.textContent = 'Shipments';
    const shipList = document.createElement('div');
    shipList.className = 'order-detail-list';
    shipSection.appendChild(shipTitle);
    shipSection.appendChild(shipList);
    details.appendChild(shipSection);

    if (Array.isArray(order.shipments) && order.shipments.length) {
      order.shipments.forEach((shipment, shipmentIdx) => {
        const shipmentCard = document.createElement('div');
        shipmentCard.className = 'shipment-card';
        const shipmentLabel = document.createElement('div');
        shipmentLabel.className = 'shipment-title';
        shipmentLabel.textContent = `Shipment ${shipmentIdx + 1}: ${formatShipmentState(shipment.status, order.fulfillment_status)}`;
        shipmentCard.appendChild(shipmentLabel);

        const tracking = Array.isArray(shipment.tracking) ? shipment.tracking : [];
        if (tracking.length) {
          tracking.forEach((track) => {
            const company = track.company || 'Carrier';
            const number = track.number || '';
            const url = track.url || '';
            const row = document.createElement('div');
            row.className = 'shipment-track';
            const label = document.createElement('span');
            label.textContent = `Tracking: ${company} ${number}`.trim();
            row.appendChild(label);
            if (url) {
              const link = document.createElement('a');
              link.href = url;
              link.target = '_blank';
              link.rel = 'noopener';
              link.className = 'tracking-btn';
              link.textContent = 'Tracking';
              row.appendChild(link);
            }
            shipmentCard.appendChild(row);
          });
          const latestUpdate = summarizeShipmentUpdate(shipment);
          if (latestUpdate) {
            const update = document.createElement('div');
            update.className = 'shipment-update';
            update.textContent = `Latest update: ${latestUpdate}`;
            shipmentCard.appendChild(update);
          }
          const expectedDelivery = getShipmentExpectedDelivery(shipment);
          if (expectedDelivery) {
            const eta = document.createElement('div');
            eta.className = 'shipment-eta';
            eta.textContent = `Expected delivery: ${expectedDelivery}`;
            shipmentCard.appendChild(eta);
          }
          const shipmentEvents = Array.isArray(shipment.events) ? shipment.events : [];
          if (shipmentEvents.length) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'secondary shipment-history-toggle';
            toggle.textContent = 'Show tracking history';
            toggle.setAttribute('aria-expanded', 'false');
            const eventWrap = document.createElement('div');
            eventWrap.className = 'shipment-event-list';
            eventWrap.style.display = 'none';
            shipmentEvents.slice(0, 4).forEach((event) => {
              const label = formatFulfillmentEventLabel(event.status);
              const message = String(event.message || '').trim();
              const happened = formatOrderDateTime(event.happened_at);
              const eta = formatOrderDateTime(event.estimated_delivery_at);
              const parts = [label];
              if (happened) parts.push(happened);
              if (message) parts.push(message);
              if (eta) parts.push(`ETA ${eta}`);
              const line = document.createElement('div');
              line.className = 'shipment-event';
              line.textContent = parts.join(' • ');
              eventWrap.appendChild(line);
            });
            toggle.addEventListener('click', () => {
              const expanded = eventWrap.style.display !== 'none';
              eventWrap.style.display = expanded ? 'none' : 'grid';
              toggle.textContent = expanded ? 'Show tracking history' : 'Hide tracking history';
              toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            });
            shipmentCard.appendChild(toggle);
            shipmentCard.appendChild(eventWrap);
          }
        } else {
          const noTrack = document.createElement('div');
          noTrack.className = 'shipment-note';
          noTrack.textContent = 'No tracking details posted.';
          shipmentCard.appendChild(noTrack);
        }

        const shipmentItems = Array.isArray(shipment.line_items) ? shipment.line_items : [];
        if (shipmentItems.length) {
          shipmentItems.forEach((line) => {
            const li = document.createElement('div');
            li.className = 'shipment-item';
            li.textContent = `Fulfilled: ${line.sku || ''} - ${line.title || ''} - Qty ${line.quantity || 0}`;
            shipmentCard.appendChild(li);
          });
        }
        shipList.appendChild(shipmentCard);
      });
    } else if (order.tracking_numbers && order.tracking_numbers.length) {
      order.tracking_numbers.forEach((number, idx) => {
        const company = (order.tracking_companies || [])[idx] || 'Carrier';
        const url = (order.tracking_urls || [])[idx] || '';
        const row = document.createElement('div');
        row.className = 'shipment-track';
        const label = document.createElement('span');
        label.textContent = `Tracking: ${company} ${number}`;
        row.appendChild(label);
        if (url) {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'tracking-btn';
          link.textContent = 'Tracking';
          row.appendChild(link);
        }
        shipList.appendChild(row);
      });
    } else if (String(order.fulfillment_status || '').toUpperCase() === 'FULFILLED') {
      const note = document.createElement('div');
      note.className = 'shipment-note';
      note.textContent = 'Shipped (no tracking details posted).';
      shipList.appendChild(note);
    } else {
      const note = document.createElement('div');
      note.className = 'shipment-note';
      note.textContent = 'No shipments yet.';
      shipList.appendChild(note);
    }

    const fraudSection = document.createElement('div');
    fraudSection.className = 'order-detail-section';
    const fraudTitle = document.createElement('div');
    fraudTitle.className = 'order-detail-title';
    fraudTitle.textContent = 'Shopify Fraud Analysis';
    const fraudList = document.createElement('div');
    fraudList.className = 'order-detail-list';
    fraudSection.appendChild(fraudTitle);
    fraudSection.appendChild(fraudList);
    details.appendChild(fraudSection);

    const fraudRecommendation = formatFraudRecommendation(fraud.recommendation || '');
    const fraudReasonList = Array.isArray(fraud.reasons) ? fraud.reasons : [];
    const fraudSignals = Array.isArray(fraud.signals) ? fraud.signals : [];

    const summaryRow = document.createElement('div');
    summaryRow.className = 'order-detail-row';
    summaryRow.innerHTML = `
      <div class="detail-left">
        <div class="detail-text">
          <span class="detail-main-wrap">Recommendation: ${fraudRecommendation}</span>
          <span class="detail-meta-wrap">Risk level: ${fraudLevel}</span>
        </div>
      </div>
    `;
    fraudList.appendChild(summaryRow);

    if (!fraud.available) {
      const unavailableRow = document.createElement('div');
      unavailableRow.className = 'order-detail-row';
      unavailableRow.innerHTML = `
        <div class="detail-left">
          <div class="detail-text">
            <span class="detail-main-wrap">Fraud analysis not available from Shopify for this order.</span>
            <span class="detail-meta-wrap">${fraud.unavailable_reason ? `Reason: ${fraud.unavailable_reason}` : ''}</span>
          </div>
        </div>
      `;
      fraudList.appendChild(unavailableRow);
    } else if (fraudReasonList.length) {
      fraudReasonList.forEach((reason) => {
        const reasonRow = document.createElement('div');
        reasonRow.className = 'order-detail-row';
        reasonRow.innerHTML = `
          <div class="detail-left">
            <div class="detail-text">
              <span class="detail-main-wrap">${reason}</span>
            </div>
          </div>
        `;
        fraudList.appendChild(reasonRow);
      });
    } else if (!fraudSignals.length) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'order-detail-row';
      emptyRow.innerHTML = `
        <div class="detail-left">
          <div class="detail-text">
            <span class="detail-main-wrap">No fraud signals returned by Shopify.</span>
          </div>
        </div>
      `;
      fraudList.appendChild(emptyRow);
    }

    if (fraudSignals.length) {
      fraudSignals.slice(0, 5).forEach((signal) => {
        const signalRow = document.createElement('div');
        signalRow.className = 'order-detail-row';
        const signalRecommendation = formatFraudRecommendation(signal.recommendation || '');
        const signalScore = Number.isFinite(Number(signal.score)) ? `Score ${Number(signal.score).toFixed(2)}` : 'Score n/a';
        const source = signal.source || 'Shopify';
        signalRow.innerHTML = `
          <div class="detail-left">
            <div class="detail-text">
              <span class="detail-main-wrap">${source}: ${signalRecommendation}</span>
              <span class="detail-meta-wrap">${signalScore}${signal.message ? ` - ${signal.message}` : ''}</span>
            </div>
          </div>
        `;
        fraudList.appendChild(signalRow);
      });
    }

    const header = card.querySelector('.order-header');
    const expandToggle = card.querySelector('.order-expand-toggle');
    const setExpanded = (expanded) => {
      details.style.display = expanded ? 'block' : 'none';
      if (expandToggle) {
        expandToggle.textContent = expanded ? '▾' : '▸';
        expandToggle.setAttribute('aria-expanded', String(expanded));
        expandToggle.setAttribute('aria-label', expanded ? 'Collapse order details' : 'Expand order details');
        expandToggle.title = expanded ? 'Collapse order details' : 'Expand order details';
      }
    };
    header.addEventListener('click', () => {
      const isOpening = details.style.display === 'none';
      if (isOpening) {
        document.querySelectorAll('.order-item-card').forEach((otherCard) => {
          if (otherCard === card) return;
          const otherDetails = otherCard.querySelector('.order-items');
          const otherToggle = otherCard.querySelector('.order-expand-toggle');
          if (otherDetails) {
            otherDetails.style.display = 'none';
          }
          if (otherToggle) {
            otherToggle.textContent = '▸';
            otherToggle.setAttribute('aria-expanded', 'false');
            otherToggle.setAttribute('aria-label', 'Expand order details');
            otherToggle.title = 'Expand order details';
          }
        });
      }
      setExpanded(isOpening);
    });

    const refundPanel = document.createElement('div');
    refundPanel.className = 'refund-panel';
    refundPanel.style.display = 'none';
    refundPanel.innerHTML = `
      <div class="status">Select items to refund.</div>
      <div class="refund-items"></div>
      <div class="refund-actions">
        <button class="secondary btn-refund-submit">Submit Refund</button>
        <button class="secondary btn-refund-cancel">Cancel</button>
      </div>
    `;
    card.appendChild(refundPanel);

    const refundItemsEl = refundPanel.querySelector('.refund-items');
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'refund-item';
      row.innerHTML = `
        <input type="checkbox" />
        <span>${item.sku || ''} - ${item.title || ''}</span>
        <input type="number" min="1" value="${item.quantity || 1}" />
      `;
      row.dataset.lineItemId = item.line_item_id || '';
      row.dataset.maxQty = String(item.quantity || 1);
      const qtyInput = row.querySelector('input[type="number"]');
      qtyInput.max = String(item.quantity || 1);
      refundItemsEl.appendChild(row);
    });

    const reorderBtn = card.querySelector('.btn-reorder');
    const holdBtn = card.querySelector('.btn-hold');
    const cancelBtn = card.querySelector('.btn-cancel');
    const refundBtn = card.querySelector('.btn-refund');
    const actionButtons = card.querySelectorAll('.order-actions button');
    actionButtons.forEach((btn) => {
      btn.addEventListener('mouseenter', () => card.classList.add('is-hover'));
      btn.addEventListener('mouseleave', () => card.classList.remove('is-hover'));
      btn.addEventListener('click', () => {
        btn.classList.add('clicked');
        setTimeout(() => btn.classList.remove('clicked'), 200);
      });
    });

    const fulfillment = String(order.fulfillment_status || '').toUpperCase();
    reorderBtn.disabled = !items.length;
    holdBtn.disabled = fulfillment !== 'UNFULFILLED';
    cancelBtn.disabled = fulfillment !== 'UNFULFILLED';
    refundBtn.disabled = fulfillment !== 'FULFILLED' && fulfillment !== 'PARTIALLY_FULFILLED';

    reorderBtn.addEventListener('click', async () => {
      try {
        addAuditEntry('reorder_start', `Reorder initiated from ${order.name || order.legacy_id || 'order'}.`);
        setStatus(els.ordersStatus, `Loading line items from ${order.name || 'order'}...`, '');
        els.draftOrderId.value = '';
        setInvoiceUrl('');
        setTotals(null);
        applyAddressValidationState(null);
        const baseItems = items.map((line) => ({
          variantId: '',
          sku: line.sku || '',
          title: line.title || '',
          price: '',
          quantity: Math.max(1, Number(line.quantity || 1)),
          bogo: false,
          inventory_quantity: null,
          image_url: line.image_url || '',
          image_alt: line.image_alt || '',
          restricted_states: [],
          fromDraft: false,
        }));
        const enriched = await enrichOrderItemsFromSkus(baseItems);
        orderItems = enriched.items.filter((item) => item.variantId);
        if (!orderItems.length) {
          throw new Error('No reorderable items found for this order.');
        }
        if (enriched.anyBogo) {
          setAutoBogoPromoCode();
        }
        renderOrderItems();
        updateShippingRestrictionWarning();
        setDraftButtonState(false);
        setActiveModule('order');
        setStatus(els.ordersStatus, `Loaded ${orderItems.length} item(s) into cart from ${order.name || 'order'}.`, 'good');
        addAuditEntry('reorder_success', `Loaded ${orderItems.length} item(s) from ${order.name || order.legacy_id || 'order'} into cart.`);
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
        addAuditEntry('reorder_error', `Reorder failed for ${order.name || order.legacy_id || 'order'}: ${summarizeError(err)}`, { flushNow: true, reason: 'reorder-error' });
      }
    });

    holdBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm(`Put ${order.name || 'this order'} on hold?`);
        if (!confirmed) return;
        addAuditEntry('order_hold', `Hold requested for ${order.name || order.legacy_id || 'order'}.`);
        setStatus(els.ordersStatus, `Putting ${order.name || 'order'} on hold...`, '');
        setStatus(els.ordersStatus, `Hold requested for ${order.name || 'order'}.`, 'good');
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
        addAuditEntry('order_hold_error', `Hold failed for ${order.name || order.legacy_id || 'order'}: ${summarizeError(err)}`, { flushNow: true, reason: 'order-hold-error' });
      }
    });

    cancelBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm(`Cancel ${order.name || 'this order'}? This cannot be undone.`);
        if (!confirmed) return;
        addAuditEntry('order_cancel', `Cancel requested for ${order.name || order.legacy_id || 'order'}.`);
        setStatus(els.ordersStatus, `Canceling ${order.name || 'order'}...`, '');
        await apiPost('/order_cancel', { order_id: order.legacy_id || order.id });
        setStatus(els.ordersStatus, `Cancel requested for ${order.name || 'order'}.`, 'good');
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
        addAuditEntry('order_cancel_error', `Cancel failed for ${order.name || order.legacy_id || 'order'}: ${summarizeError(err)}`, { flushNow: true, reason: 'order-cancel-error' });
      }
    });

    refundBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(`Refund ${order.name || 'this order'}? You will need to select line items and amounts.`);
      if (!confirmed) return;
      refundPanel.style.display = refundPanel.style.display === 'none' ? 'block' : 'none';
    });

    const refundSubmit = refundPanel.querySelector('.btn-refund-submit');
    const refundCancel = refundPanel.querySelector('.btn-refund-cancel');
    refundCancel.addEventListener('click', () => {
      refundPanel.style.display = 'none';
    });
    refundSubmit.addEventListener('click', async () => {
      try {
        const selected = Array.from(refundItemsEl.querySelectorAll('.refund-item'))
          .map((row) => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            const qtyInput = row.querySelector('input[type="number"]');
            if (!checkbox.checked) return null;
            const maxQty = Number(row.dataset.maxQty || 1);
            const qty = Math.max(1, Math.min(Number(qtyInput.value || 1), maxQty));
            return {
              line_item_id: row.dataset.lineItemId,
              quantity: qty,
            };
          })
          .filter((item) => item && item.line_item_id);

        if (!selected.length) {
          setStatus(els.ordersStatus, 'Select at least one item to refund.', 'bad');
          return;
        }

        setStatus(els.ordersStatus, `Refunding ${order.name || 'order'}...`, '');
        await apiPost('/order_refund', { order_id: order.legacy_id || order.id, line_items: selected });
        setStatus(els.ordersStatus, `Refund requested for ${order.name || 'order'}.`, 'good');
        addAuditEntry('order_refund', `Refund requested for ${order.name || order.legacy_id || 'order'} with ${selected.length} line item(s).`, { flushNow: true, reason: 'refund' });
        refundPanel.style.display = 'none';
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
        addAuditEntry('order_refund_error', `Refund failed for ${order.name || order.legacy_id || 'order'}: ${summarizeError(err)}`, { flushNow: true, reason: 'refund-error' });
      }
    });

    if (ordersBody) ordersBody.appendChild(card);
  });
}

function minimizeOrdersSection() {
  if (ordersMinimized) return;
  ordersMinimized = true;
  els.ordersList.style.display = 'none';
  els.ordersStatus.innerHTML = 'Orders minimized. <a href="#" id="showOrdersLink">Show orders</a>';
  const link = document.getElementById('showOrdersLink');
  if (link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      ordersMinimized = false;
      els.ordersList.style.display = 'block';
      renderOrders(lastOrders, lastDraftOrders);
      setStatus(els.ordersStatus, `Loaded ${lastOrders.length} order(s), ${lastDraftOrders.length} draft order(s).`, 'good');
    });
  }
}

function restoreOrdersSection() {
  ordersMinimized = false;
  if (els.ordersList) {
    els.ordersList.style.display = 'block';
  }
}

function resetSelectedCustomerContext(options = {}) {
  const {
    keepSearchResults = true,
    clearSearchInputs = false,
    clearStatus = false,
    customerMessage = 'Customer selection cleared. Search again or pick another customer.',
    draftMessage = 'Select a customer to start or resume a draft.',
  } = options;

  stopDraftConversionPolling('customer_clear');
  showConversionPanel(false);
  els.customerId.value = '';
  lastCustomerProfile = null;
  lastOrders = [];
  lastDraftOrders = [];
  lastAddresses = [];
  orderItems = [];
  lastVariant = null;
  upsellSuggestions = [];
  selectedShipState = '';
  currentAddressValidation = { valid: true, requiresOverride: false, message: '' };
  draftSubmitInFlight = false;

  if (clearSearchInputs) {
    [els.firstName, els.lastName, els.email, els.phone, els.tags, els.swansonId].forEach((input) => {
      if (input) input.value = '';
    });
  }

  if (!keepSearchResults) {
    lastSearchCustomers = [];
  }

  renderCustomers(lastSearchCustomers, '');
  renderCustomerProfile(null);
  renderAddresses(lastAddresses);
  renderOrders(lastOrders, lastDraftOrders);
  renderUpsellSuggestions();
  restoreOrdersSection();
  setUpsellExpanded(false);
  setInvoiceUrl('');
  setTotals(null);
  clearPromoStatus();
  setShippingLineFromDraft(null);
  applyAddressValidationState(null);
  if (els.addressOverride) els.addressOverride.checked = false;
  if (els.shippingSpeed) els.shippingSpeed.value = '';
  if (els.shippingCost) els.shippingCost.value = '';
  if (els.freeShipping) els.freeShipping.checked = false;
  if (els.promoCode) els.promoCode.value = '';
  if (els.draftOrderId) els.draftOrderId.value = '';
  if (els.sku) els.sku.value = '';
  if (els.variantPrice) els.variantPrice.value = '';
  if (els.productResults) els.productResults.innerHTML = '';
  if (els.skuCard) els.skuCard.style.display = 'none';
  if (els.ordersList) els.ordersList.innerHTML = '';
  if (els.shipPreview) {
    els.shipPreview.value = '';
    autoSizeShipPreview();
  }
  if (els.addressSelect) els.addressSelect.innerHTML = '';
  if (els.orderItems) els.orderItems.innerHTML = '';
  setDraftButtonState(false);
  updateShippingRestrictionWarning();

  if (clearStatus) {
    setStatus(els.customerStatus, '', '');
  } else {
    setStatus(els.customerStatus, customerMessage, 'good');
  }
  setStatus(els.ordersStatus, '', '');
  setStatus(els.addrStatus, '', '');
  setStatus(els.skuStatus, '', '');
  setStatus(els.draftStatus, draftMessage, '');
  setStatus(els.upsellStatus, 'Select a customer to load upsell ideas from prior orders.', '');
  syncCustomerSelectionUi('');
}

async function handleCustomerSelect(customer, allCustomers) {
  stopDraftConversionPolling('customer_switch');
  showConversionPanel(false);
  els.customerId.value = customer.id;
  renderCustomers(allCustomers, customer.id);
  setStatus(els.customerStatus, `Selected customer ${customer.id}. Fetching addresses and orders...`, '');
  addAuditEntry('customer_select', `Selected customer ${customer.id} (${customer.email || 'no-email'}).`);
  try {
    const addressesData = await apiGet(`/customer_addresses?customer_id=${encodeURIComponent(customer.id)}`);
    lastAddresses = addressesData.addresses || [];
    renderAddresses(lastAddresses);
    setStatus(els.customerStatus, `Selected customer ${customer.id}. Loaded ${lastAddresses.length} address(es).`, 'good');
    addAuditEntry('address_load', `Loaded ${lastAddresses.length} address(es) for customer ${customer.id}.`);
    await fetchOrdersForCustomer(customer.id);
  } catch (err) {
    setStatus(els.customerStatus, err.message, 'bad');
    addAuditEntry('customer_select_error', `Customer ${customer.id} selection failed: ${summarizeError(err)}`, { flushNow: true, reason: 'customer-select-error' });
  }
}

function setInvoiceUrl(url) {
  els.invoiceUrl.value = url || '';
  if (url) {
    if (els.invoiceLink) {
      els.invoiceLink.href = url;
      els.invoiceLink.style.display = 'inline-flex';
    }
    if (els.btnCopyInvoiceUrl) {
      els.btnCopyInvoiceUrl.style.display = 'inline-block';
      els.btnCopyInvoiceUrl.disabled = false;
    }
    return;
  }
  if (els.invoiceLink) {
    els.invoiceLink.href = '#';
    els.invoiceLink.style.display = 'none';
  }
  if (els.btnCopyInvoiceUrl) {
    els.btnCopyInvoiceUrl.style.display = 'none';
    els.btnCopyInvoiceUrl.disabled = true;
  }
}

function normalizeDraftOrderId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return raw;
  const gidMatch = raw.match(/DraftOrder\/(\d+)/i);
  return gidMatch ? gidMatch[1] : '';
}

function setConversionToggleState({ visible = false, label = 'Draft conversion check', working = false } = {}) {
  if (!els.btnConversionToggle) return;
  els.btnConversionToggle.textContent = label;
  els.btnConversionToggle.classList.toggle('active', Boolean(visible));
  els.btnConversionToggle.classList.toggle('is-working', Boolean(working));
  els.btnConversionToggle.setAttribute('aria-expanded', conversionPanelExpanded ? 'true' : 'false');
}

function setConversionPanelStatus(message, tone = '') {
  if (!els.conversionStatus) return;
  setStatus(els.conversionStatus, message, tone);
}

function showConversionPanel(show, options = {}) {
  if (!els.conversionPanel) return;
  conversionPanelExpanded = Boolean(show);
  els.conversionPanel.classList.toggle('active', conversionPanelExpanded);
  if (els.btnConversionToggle) {
    els.btnConversionToggle.setAttribute('aria-expanded', conversionPanelExpanded ? 'true' : 'false');
  }
  if (!conversionPanelExpanded) return;
  const showRefresh = options.showRefresh !== false;
  const showStop = options.showStop !== false;
  if (els.btnRefreshOrdersFromConversion) {
    els.btnRefreshOrdersFromConversion.style.display = showRefresh ? 'inline-block' : 'none';
  }
  if (els.btnStopConversionPolling) {
    els.btnStopConversionPolling.style.display = showStop ? 'inline-block' : 'none';
  }
}

function stopDraftConversionPolling(reason = 'manual_stop') {
  if (draftConversionPoller.timer) {
    clearInterval(draftConversionPoller.timer);
  }
  const hadTimer = Boolean(draftConversionPoller.timer);
  draftConversionPoller = {
    timer: null,
    draftId: '',
    startedAt: 0,
    sourceAction: '',
  };
  if (hadTimer) {
    addAuditEntry('draft_conversion_poll_stop', `Stopped conversion polling (${reason}).`);
  }
  setConversionToggleState({ visible: false, label: 'Draft conversion check', working: false });
  showConversionPanel(false);
}

async function refreshOrdersFromConversion() {
  const customerId = String(els.customerId?.value || '').trim();
  if (!customerId) {
    setConversionPanelStatus('No customer selected to refresh orders.', 'bad');
    setConversionToggleState({ visible: true, label: 'Conversion check unavailable', working: false });
    return;
  }
  try {
    setConversionPanelStatus('Refreshing customer orders...', 'progress');
    setConversionToggleState({ visible: true, label: 'Refreshing orders...', working: true });
    await fetchOrdersForCustomer(customerId);
    setConversionPanelStatus('Orders refreshed. Converted order should appear in Orders.', 'good');
    setConversionToggleState({ visible: true, label: 'Orders refreshed', working: false });
  } catch (err) {
    setConversionPanelStatus(`Order refresh failed: ${summarizeError(err)}`, 'bad');
    setConversionToggleState({ visible: true, label: 'Refresh failed', working: false });
  }
}

async function checkDraftConversionStatus() {
  const currentDraftId = draftConversionPoller.draftId;
  if (!currentDraftId) return;
  const elapsedMs = Date.now() - draftConversionPoller.startedAt;
  if (elapsedMs >= draftConversionPollMaxMs) {
    stopDraftConversionPolling('timeout');
    setConversionToggleState({ visible: true, label: 'Conversion check timed out', working: false });
    setConversionPanelStatus(`Still waiting after ${Math.ceil(draftConversionPollMaxMs / 60000)} minutes. Use Refresh Orders to check if conversion completed.`, 'bad');
    addAuditEntry('draft_conversion_poll_timeout', `Conversion polling timed out for draft ${currentDraftId}.`, { flushNow: true, reason: 'draft-conversion-timeout' });
    return;
  }
  try {
    const data = await apiGet(`/draft_order_get?draft_order_id=${encodeURIComponent(currentDraftId)}`);
    const draft = data?.draft_order || null;
    const status = String(draft?.status || '').toUpperCase();
    if (draft?.invoiceUrl) {
      setInvoiceUrl(draft.invoiceUrl);
    }
    if (status === 'COMPLETED') {
      stopDraftConversionPolling('completed');
      setConversionToggleState({ visible: true, label: `${draft?.name || `#${currentDraftId}`} converted`, working: false });
      setConversionPanelStatus(`Confirmed: Draft ${draft?.name || `#${currentDraftId}`} converted to an order.`, 'good');
      setStatus(els.draftStatus, `Draft ${draft?.name || `#${currentDraftId}`} is now completed.`, 'good');
      addAuditEntry('draft_conversion_detected', `Draft ${draft?.name || currentDraftId} status is COMPLETED.`, { flushNow: true, reason: 'draft-conversion-complete' });
      return;
    }
    const elapsedSec = Math.floor(elapsedMs / 1000);
    setConversionToggleState({ visible: true, label: `Checking draft #${currentDraftId}...`, working: true });
    setConversionPanelStatus(`Still processing draft ${draft?.name || `#${currentDraftId}`}. Last status: ${status || 'OPEN'}. Checking again in 20s (${elapsedSec}s elapsed).`, 'progress');
  } catch (err) {
    const errText = summarizeError(err);
    if (/404|not found/i.test(errText)) {
      stopDraftConversionPolling('not_found');
      setConversionToggleState({ visible: true, label: 'Draft no longer found', working: false });
      setConversionPanelStatus(`Draft #${currentDraftId} is no longer available. It may have converted already; refresh Orders to confirm.`, 'good');
      addAuditEntry('draft_conversion_possible', `Draft ${currentDraftId} no longer found during polling.`, { flushNow: true, reason: 'draft-conversion-not-found' });
      return;
    }
    setConversionToggleState({ visible: true, label: 'Checking draft status...', working: true });
    setConversionPanelStatus(`Polling error: ${errText}. Will retry in 20s.`, 'bad');
  }
}

function startDraftConversionPolling(sourceAction) {
  const draftId = normalizeDraftOrderId(els.draftOrderId?.value);
  if (!draftId) {
    setConversionToggleState({ visible: false, label: 'Draft conversion check', working: false });
    showConversionPanel(false);
    setStatus(els.draftStatus, 'Open a draft before starting conversion checks.', 'bad');
    return;
  }
  const sameDraftRunning = draftConversionPoller.timer && draftConversionPoller.draftId === draftId;
  if (sameDraftRunning) {
    setConversionToggleState({ visible: true, label: `Checking draft #${draftId}...`, working: true });
    return;
  }
  stopDraftConversionPolling('restart');
  draftConversionPoller = {
    timer: null,
    draftId,
    startedAt: Date.now(),
    sourceAction: sourceAction || 'unknown',
  };
  setConversionToggleState({ visible: true, label: `Checking draft #${draftId}...`, working: true });
  showConversionPanel(false);
  setConversionPanelStatus(`Checking draft #${draftId} conversion every 20 seconds...`, 'progress');
  addAuditEntry('draft_conversion_poll_start', `Started conversion polling for draft ${draftId} from ${draftConversionPoller.sourceAction}.`);
  void checkDraftConversionStatus();
  draftConversionPoller.timer = setInterval(() => {
    void checkDraftConversionStatus();
  }, draftConversionPollIntervalMs);
}

async function copyInvoiceUrlToClipboard() {
  const url = String(els.invoiceUrl?.value || '').trim();
  if (!url) {
    setStatus(els.draftStatus, 'No invoice URL available yet.', 'bad');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus(els.draftStatus, 'Invoice URL copied to clipboard.', 'good');
    addAuditEntry('invoice_copy', 'Copied invoice URL to clipboard.');
  } catch (err) {
    setStatus(els.draftStatus, 'Could not copy invoice URL automatically.', 'bad');
    addAuditEntry('invoice_copy_error', `Invoice URL copy failed: ${summarizeError(err)}`, { flushNow: true, reason: 'invoice-copy-error' });
  }
}

function setTotals(draftOrder) {
  els.subtotal.value = draftOrder?.subtotalPrice || '';
  els.totalTax.value = draftOrder?.totalTax || '';
  els.total.value = draftOrder?.totalPrice || '';
}

function parseMoneyAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getDraftDiscountAmount(draftOrder) {
  const nested = draftOrder?.totalDiscountsSet?.presentmentMoney?.amount;
  if (nested !== undefined && nested !== null && nested !== '') {
    return parseMoneyAmount(nested);
  }
  return parseMoneyAmount(draftOrder?.totalDiscounts);
}

function clearPromoStatus() {
  if (!els.promoStatus) return;
  setStatus(els.promoStatus, '', '');
}

function setPromoResultStatus(promoCode, draftOrder, bogoOverride, resolution = {}) {
  if (!els.promoStatus) return;
  const normalized = String(promoCode || '').trim().toUpperCase();
  const entered = String(resolution.enteredCode || '').trim().toUpperCase();
  const sourceCode = String(resolution.sourceCode || '').trim().toUpperCase();
  const mode = String(resolution.mode || '').trim().toLowerCase();
  const resolvedCode = String(resolution.resolvedCode || normalized || '').trim().toUpperCase();
  const conversionSource = sourceCode || entered;
  const convertedFromSource = mode === 'source_map' && conversionSource && resolvedCode;
  if (!normalized) {
    if (bogoOverride) {
      const discountAmount = getDraftDiscountAmount(draftOrder);
      if (discountAmount > 0) {
        setStatus(els.promoStatus, `BOGO promo INT999 applied: -$${discountAmount.toFixed(2)}.`, 'good');
        addAuditEntry('promo_applied', `BOGO promo INT999 applied with discount $${discountAmount.toFixed(2)}.`);
      } else {
        setStatus(els.promoStatus, 'BOGO promo INT999 was sent, but no discount was returned.', 'bad');
        addAuditEntry('promo_missing', 'BOGO promo INT999 sent but no discount returned.');
      }
      return;
    }
    setStatus(els.promoStatus, 'No promo code applied.', '');
    addAuditEntry('promo', 'No promo code applied on draft operation.');
    return;
  }
  const discountAmount = getDraftDiscountAmount(draftOrder);
  if (discountAmount > 0) {
    if (convertedFromSource) {
      setStatus(els.promoStatus, `Source ${conversionSource} converted to promo ${resolvedCode} and applied: -$${discountAmount.toFixed(2)}.`, 'good');
      addAuditEntry('promo_applied', `Source ${conversionSource} converted to promo ${resolvedCode}, discount $${discountAmount.toFixed(2)}.`);
      return;
    }
    if (bogoOverride && normalized !== 'INT999') {
      setStatus(els.promoStatus, `Promo ${normalized} applied with BOGO handling: -$${discountAmount.toFixed(2)}.`, 'good');
      addAuditEntry('promo_applied', `Promo ${normalized} applied with BOGO handling, discount $${discountAmount.toFixed(2)}.`);
      return;
    }
    if (bogoOverride && normalized === 'INT999') {
      setStatus(els.promoStatus, `BOGO promo ${normalized} applied: -$${discountAmount.toFixed(2)}.`, 'good');
      addAuditEntry('promo_applied', `BOGO promo ${normalized} applied with discount $${discountAmount.toFixed(2)}.`);
      return;
    }
    setStatus(els.promoStatus, `Promo ${normalized} applied: -$${discountAmount.toFixed(2)}.`, 'good');
    addAuditEntry('promo_applied', `Promo ${normalized} applied with discount $${discountAmount.toFixed(2)}.`);
    return;
  }
  if (bogoOverride) {
    if (convertedFromSource) {
      setStatus(els.promoStatus, `Source ${conversionSource} converted to promo ${resolvedCode}, but no discount was returned for current items.`, 'bad');
      addAuditEntry('promo_missing', `Source ${conversionSource} converted to promo ${resolvedCode} but no discount returned.`);
      return;
    }
    setStatus(els.promoStatus, `Promo ${normalized} and BOGO handling were sent, but no discount was returned for current items.`, 'bad');
    addAuditEntry('promo_missing', `Promo ${normalized} with BOGO handling sent but no discount returned.`);
    return;
  }
  if (convertedFromSource) {
    setStatus(els.promoStatus, `Source ${conversionSource} converted to promo ${resolvedCode}, but no discount was returned for current items.`, 'bad');
    addAuditEntry('promo_missing', `Source ${conversionSource} converted to promo ${resolvedCode} but no discount returned.`);
    return;
  }
  setStatus(els.promoStatus, `Promo ${normalized} was sent, but no discount was returned for current items.`, 'bad');
  addAuditEntry('promo_missing', `Promo ${normalized} sent but no discount returned.`);
}

function setShippingLineFromDraft(draftOrder) {
  if (!els.shippingSpeed || !els.shippingCost || !els.freeShipping) return;
  syncingShippingUi = true;
  const shippingLine = draftOrder?.shippingLine || null;
  if (!draftOrder) {
    els.shippingSpeed.value = '';
    els.shippingCost.value = '';
    els.freeShipping.checked = false;
    syncingShippingUi = false;
    return;
  }
  if (!shippingLine) {
    els.freeShipping.checked = false;
    syncingShippingUi = false;
    updateShippingCostDisplay();
    return;
  }
  els.shippingSpeed.value = shippingLine.title || '';
  const amount = shippingLine.originalPriceSet?.presentmentMoney?.amount
    || shippingLine.discountedPriceSet?.presentmentMoney?.amount
    || '';
  els.shippingCost.value = amount || '';
  const numeric = Number(amount || 0);
  els.freeShipping.checked = Number.isFinite(numeric) && numeric === 0;
  syncingShippingUi = false;
}

function calculateShippingAmount() {
  if (els.freeShipping?.checked) return 0;
  const speed = String(els.shippingSpeed?.value || '').trim();
  if (!speed) return null;
  const rate = SHIPPING_RATE_BY_SPEED[speed];
  if (!Number.isFinite(rate)) return null;
  return rate;
}

function updateShippingCostDisplay() {
  if (!els.shippingCost) return;
  const amount = calculateShippingAmount();
  if (amount === null) {
    els.shippingCost.value = '';
    return;
  }
  els.shippingCost.value = Number(amount).toFixed(2);
}

function setDraftButtonState(isUpdate) {
  if (!els.btnCreateDraft) return;
  els.btnCreateDraft.textContent = isUpdate ? 'Update Draft Order' : 'Create Draft Order';
  els.btnCreateDraft.classList.remove('is-working');
  els.btnCreateDraft.removeAttribute('aria-busy');
  if (!isUpdate && els.addressOverride) {
    els.addressOverride.checked = false;
  }
  refreshUpdateButtonState();
}

function setDraftWorkingState(isWorking, isUpdate) {
  if (!els.btnCreateDraft) return;
  if (isWorking) {
    draftSubmitInFlight = true;
    els.btnCreateDraft.disabled = true;
    els.btnCreateDraft.classList.add('is-working');
    els.btnCreateDraft.setAttribute('aria-busy', 'true');
    els.btnCreateDraft.textContent = isUpdate ? 'Updating Draft...' : 'Creating Draft...';
    return;
  }
  draftSubmitInFlight = false;
  setDraftButtonState(Boolean(els.draftOrderId?.value?.trim()));
}

function getPromoCode() {
  const code = els.promoCode.value.trim();
  return code || '';
}

function setAutoBogoPromoCode() {
  if (!els.promoCode) return;
  if (getPromoCode()) return;
  els.promoCode.value = 'INT999';
}

function getShippingLineInput() {
  updateShippingCostDisplay();
  const speed = String(els.shippingSpeed?.value || '').trim();
  const amount = calculateShippingAmount();
  if (amount === null) return null;
  if (!speed && !els.freeShipping?.checked) return null;

  return {
    title: speed || 'Free Shipping',
    amount: amount.toFixed(2),
    currency_code: 'USD',
  };
}

function attachButtonEffects(buttons) {
  buttons.forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('mouseenter', () => btn.classList.add('clicked-hover'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('clicked-hover'));
    btn.addEventListener('click', () => {
      btn.classList.add('clicked');
      setTimeout(() => btn.classList.remove('clicked'), 200);
    });
  });
}

els.addressSelect.addEventListener('change', () => {
  updateAddressPreview();
  const idx = Number(els.addressSelect.value || 0);
  const addr = lastAddresses[idx];
  if (addr) {
    const state = normalizeState(addr.provinceCode || addr.province || '');
    addAuditEntry('address_select', `Selected shipping address index ${idx}${state ? ` (${state})` : ''}.`);
  }
});
if (els.addressOverride) {
  els.addressOverride.addEventListener('change', () => {
    refreshUpdateButtonState();
    addAuditEntry('address_validation_override', `Address override ${els.addressOverride.checked ? 'enabled' : 'disabled'}.`);
  });
}
if (els.email) {
  els.email.addEventListener('input', () => {
    userEditedEmail = true;
  });
}
if (els.promoCode) {
  els.promoCode.addEventListener('change', () => {
    const code = String(els.promoCode.value || '').trim().toUpperCase();
    addAuditEntry('promo_code_input', code ? `Promo code set to ${code}.` : 'Promo code cleared.');
  });
}
if (els.shippingSpeed) {
  els.shippingSpeed.addEventListener('change', () => {
    if (!syncingShippingUi && String(els.shippingSpeed.value || '').trim() && els.freeShipping?.checked) {
      els.freeShipping.checked = false;
    }
    updateShippingCostDisplay();
    addAuditEntry('shipping_speed', `Shipping speed set to ${els.shippingSpeed.value || 'none'}.`);
  });
}
if (els.freeShipping) {
  els.freeShipping.addEventListener('change', () => {
    updateShippingCostDisplay();
    addAuditEntry('shipping_free_toggle', `Free shipping ${els.freeShipping.checked ? 'enabled' : 'disabled'}.`);
  });
}

attachButtonEffects([
  els.btnSearchCustomer,
  els.btnCustomerNext,
  els.btnNewOrder,
  els.btnCreateDraft,
  els.btnNewCustomer,
  els.btnNoEmail,
  els.btnCreateCustomer,
  els.navCustomer,
  els.navOrders,
  els.navOrder,
]);

if (els.navCustomer) els.navCustomer.addEventListener('click', () => {
  setActiveModule('customer');
  addAuditEntry('module_nav', 'Switched to Customer module.');
});
if (els.navOrders) els.navOrders.addEventListener('click', () => {
  setActiveModule('orders');
  addAuditEntry('module_nav', 'Switched to Orders module.');
});
if (els.navOrder) els.navOrder.addEventListener('click', () => {
  setActiveModule('order');
  addAuditEntry('module_nav', 'Switched to Cart module.');
});

if (els.btnCustomerNext) {
  els.btnCustomerNext.addEventListener('click', () => {
    setActiveModule('orders');
    addAuditEntry('module_nav', 'Advanced from Customer to Orders.');
  });
}
if (els.btnClearCustomer) {
  els.btnClearCustomer.addEventListener('click', () => {
    const clearedId = els.customerId.value.trim();
    resetSelectedCustomerContext({
      keepSearchResults: true,
      customerMessage: 'Customer cleared. Select another result or run a new search.',
      draftMessage: 'Customer cleared. Select another customer to continue.',
    });
    setActiveModule('customer');
    addAuditEntry('customer_clear', clearedId ? `Cleared selected customer ${clearedId}.` : 'Cleared customer selection.');
  });
}


els.btnNewCustomer.addEventListener('click', () => {
  if (els.newCustomerPanel) {
    els.newCustomerPanel.open = true;
    els.newCustomerName.focus();
  }
});

els.btnNoEmail.addEventListener('click', () => {
  const email = normalizePhoneToEmail(els.newCustomerPhone.value);
  if (email) {
    els.newCustomerEmail.value = email;
    addAuditEntry('customer_email_autofill', 'Generated email from phone for new customer.');
  }
});

els.btnCreateCustomer.addEventListener('click', async () => {
  try {
    const name = els.newCustomerName.value.trim();
    const rawPhone = els.newCustomerPhone.value.trim();
    const rawEmail = els.newCustomerEmail.value.trim();
    const phone = normalizeUsPhoneForCustomer(rawPhone);
    const email = rawEmail.toLowerCase();
    if (!name) throw new Error('Customer name required');
    if (!rawPhone) throw new Error('Phone required');
    if (!phone) throw new Error('Phone must be a valid US 10-digit number (or 11 digits starting with 1).');
    if (!rawEmail) throw new Error('Email required');
    if (!isValidEmailAddress(email)) throw new Error('Email must be a valid format (example@domain.com).');
    setStatus(els.newCustomerStatus, 'Creating customer...', '');
    const payload = { name, phone, email };
    const data = await apiPost('/customer_create', payload);
    const customer = data.customer;
    if (!customer?.id) throw new Error('Customer create failed');
    setStatus(els.newCustomerStatus, `Created customer ${customer.id}.`, 'good');
    addAuditEntry('customer_create', `Created customer ${customer.id} (${customer.email || rawEmail || 'no-email'}).`, { flushNow: true, reason: 'customer-create' });
    els.customerId.value = customer.id;
    handleCustomerSelect(customer, [customer]);
  } catch (err) {
    const parsed = parseApiErrorMessage(err.message);
    const bodyErrors = parsed.body?.errors || {};
    const phoneErrors = bodyErrors.phone || [];
    const emailErrors = bodyErrors.email || [];
    if (phoneErrors.some((e) => String(e).includes('has already been taken'))) {
      try {
        setStatus(els.newCustomerStatus, 'Phone already exists. Searching existing customer...', 'bad');
        const dedupePhone = normalizeUsPhoneForCustomer(els.newCustomerPhone.value.trim()) || els.newCustomerPhone.value.trim();
        const params = new URLSearchParams({ phone: dedupePhone, limit: '5' });
        const data = await apiGet(`/search?${params.toString()}`);
        renderCustomers(data.customers || []);
        setStatus(els.newCustomerStatus, 'Found existing customer with this phone. Click to select.', 'good');
        addAuditEntry('customer_create_dedupe', `Phone already existed; rendered ${data.customers?.length || 0} matching customer(s).`);
        return;
      } catch (searchErr) {
        setStatus(els.newCustomerStatus, searchErr.message, 'bad');
        return;
      }
    }
    if (emailErrors.some((e) => String(e).includes('has already been taken'))) {
      try {
        setStatus(els.newCustomerStatus, 'Email already exists. Searching existing customer...', 'bad');
        const params = new URLSearchParams({ email: els.newCustomerEmail.value.trim(), limit: '5' });
        const data = await apiGet(`/search?${params.toString()}`);
        renderCustomers(data.customers || []);
        setStatus(els.newCustomerStatus, 'Found existing customer with this email. Click to select.', 'good');
        addAuditEntry('customer_create_dedupe', `Email already existed; rendered ${data.customers?.length || 0} matching customer(s).`);
        return;
      } catch (searchErr) {
        setStatus(els.newCustomerStatus, searchErr.message, 'bad');
        return;
      }
    }
    setStatus(els.newCustomerStatus, err.message, 'bad');
    addAuditEntry('customer_create_error', `Customer create failed: ${summarizeError(err)}`, { flushNow: true, reason: 'customer-create-error' });
  }
});

async function runCustomerSearch() {
  try {
    setStatus(els.customerStatus, 'Searching...', '');
    const params = new URLSearchParams({
      limit: '5',
    });
    const firstName = els.firstName.value.trim();
    const lastName = els.lastName.value.trim();
    const email = els.email.value.trim();
    const phone = els.phone.value.trim();
    const tags = els.tags.value.trim();
    const swansonId = els.swansonId.value.trim();
    if (firstName) params.set('first_name', firstName);
    if (lastName) params.set('last_name', lastName);
    if (email) params.set('email', email);
    if (phone) params.set('phone', phone);
    if (tags) params.set('tags', tags);
    if (swansonId) params.set('swanson_id', swansonId);
    addAuditEntry(
      'customer_search',
      `Search initiated with fields: ${[
        firstName && 'first_name',
        lastName && 'last_name',
        email && 'email',
        phone && 'phone',
        tags && 'tags',
        swansonId && 'swanson_id',
      ].filter(Boolean).join(', ') || 'none'}`
    );
    const data = await apiGet(`/search?${params.toString()}`);
    lastSearchCustomers = data.customers || [];
    renderCustomers(lastSearchCustomers);
    resetSelectedCustomerContext({
      keepSearchResults: true,
      clearStatus: true,
      draftMessage: 'Select a customer to build a cart.',
    });

    const currentId = els.customerId.value.trim();
    const exactMatch = currentId
      ? lastSearchCustomers.find((c) => String(c.id) === String(currentId))
      : null;
    if (exactMatch) {
      await handleCustomerSelect(exactMatch, lastSearchCustomers);
    } else if (lastSearchCustomers.length === 1) {
      await handleCustomerSelect(lastSearchCustomers[0], lastSearchCustomers);
    }
    addAuditEntry('customer_search_result', `Search returned ${data.count || 0} customer(s).`);
    setStatus(els.customerStatus, `Found ${data.count || 0} customer(s). Click a result to select.`, 'good');
  } catch (err) {
    setStatus(els.customerStatus, err.message, 'bad');
    addAuditEntry('customer_search_error', `Search failed: ${summarizeError(err)}`, { flushNow: true, reason: 'customer-search-error' });
  }
}

els.btnSearchCustomer.addEventListener('click', runCustomerSearch);

if (els.btnUpsellToggle) {
  els.btnUpsellToggle.addEventListener('click', () => {
    setUpsellExpanded(!upsellExpanded);
  });
}
if (els.btnConversionToggle) {
  els.btnConversionToggle.addEventListener('click', () => {
    showConversionPanel(!conversionPanelExpanded, {
      showRefresh: true,
      showStop: Boolean(draftConversionPoller.timer),
    });
  });
}
if (els.btnCopyInvoiceUrl) {
  els.btnCopyInvoiceUrl.addEventListener('click', async () => {
    await copyInvoiceUrlToClipboard();
    startDraftConversionPolling('copy_invoice_url');
  });
}
if (els.invoiceLink) {
  els.invoiceLink.addEventListener('click', () => {
    startDraftConversionPolling('open_invoice');
  });
}
if (els.btnRefreshOrdersFromConversion) {
  els.btnRefreshOrdersFromConversion.addEventListener('click', async () => {
    await refreshOrdersFromConversion();
  });
}
if (els.btnStopConversionPolling) {
  els.btnStopConversionPolling.addEventListener('click', () => {
    stopDraftConversionPolling('agent_stop');
    setConversionToggleState({ visible: true, label: 'Conversion check paused', working: false });
    setConversionPanelStatus('Stopped conversion checks. Use Open Invoice or Copy URL to start again.', '');
    showConversionPanel(true, { showRefresh: true, showStop: false });
  });
}

document.querySelectorAll('.macro-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyAgentMacro(btn.getAttribute('data-macro') || '');
  });
});

els.btnNewOrder.addEventListener('click', () => {
  stopDraftConversionPolling('new_order');
  showConversionPanel(false);
  minimizeOrdersSection();
  els.draftOrderId.value = '';
  setInvoiceUrl('');
  setTotals(null);
  clearPromoStatus();
  setShippingLineFromDraft(null);
  applyAddressValidationState(null);
  orderItems = [];
  renderOrderItems();
  setDraftButtonState(false);
  setActiveModule('order');
  setStatus(els.draftStatus, 'Starting a new order. Add SKUs below.', 'good');
  addAuditEntry('draft_reset', 'Started a new order draft session.');
});

els.btnAddAddress.addEventListener('click', async () => {
  try {
    const customerId = els.customerId.value.trim();
    if (!customerId) throw new Error('Customer ID required');
    const address = {
      name: els.addrName.value.trim(),
      phone: els.addrPhone.value.trim(),
      address1: els.addr1.value.trim(),
      address2: els.addr2.value.trim(),
      city: els.addrCity.value.trim(),
      province: els.addrProvince.value.trim(),
      zip: els.addrZip.value.trim(),
      country: els.addrCountry.value.trim(),
    };
    if (!address.address1 || !address.city || !address.zip || !address.country) {
      throw new Error('Address1, City, Postal Code, and Country are required');
    }

    setStatus(els.addrStatus, 'Adding address...', '');
    await apiPost('/customer_address_create', {
      customer_id: customerId,
      address,
      set_default: Boolean(els.addrDefault.checked),
    });
    setStatus(els.addrStatus, 'Address added. Refreshing addresses...', 'good');
    const data = await apiGet(`/customer_addresses?customer_id=${encodeURIComponent(customerId)}`);
    lastAddresses = data.addresses || [];
    renderAddresses(lastAddresses);
    setStatus(els.addrStatus, 'Address list updated.', 'good');
    addAuditEntry('address_create', `Added address for customer ${customerId}.`);
  } catch (err) {
    setStatus(els.addrStatus, err.message, 'bad');
    addAuditEntry('address_create_error', `Address create failed: ${summarizeError(err)}`, { flushNow: true, reason: 'address-create-error' });
  }
});

// Addresses are fetched automatically when selecting a customer.

async function fetchOrdersForCustomer(customerId) {
  try {
    // Unhide orders when loading a customer, even if "New Order" minimized the list earlier.
    restoreOrdersSection();
    setStatus(els.ordersStatus, 'Loading recent orders...', '');
    const data = await apiGet(`/customer_orders?customer_id=${encodeURIComponent(customerId)}`);
    lastOrders = data.orders || [];
    lastDraftOrders = data.draft_orders || [];
    renderCustomerProfile(data.profile || null);
    renderOrders(lastOrders, lastDraftOrders);
    refreshUpsellSuggestions();
    addAuditEntry('orders_load', `Loaded ${lastOrders.length} order(s) and ${lastDraftOrders.length} draft(s) for customer ${customerId}.`);
    setStatus(els.ordersStatus, `Loaded ${lastOrders.length} order(s), ${lastDraftOrders.length} draft order(s).`, 'good');
  } catch (err) {
    setStatus(els.ordersStatus, err.message, 'bad');
    upsellSuggestions = [];
    renderUpsellSuggestions();
    setStatus(els.upsellStatus, 'Could not load upsell ideas.', 'bad');
    addAuditEntry('orders_load_error', `Failed loading orders for customer ${customerId}: ${summarizeError(err)}`, { flushNow: true, reason: 'orders-load-error' });
  }
}

els.btnLookupSku.addEventListener('click', async () => {
  try {
    const query = els.sku.value.trim();
    if (!query) throw new Error('Search value required');
    addAuditEntry('sku_search', `Lookup requested for query "${query}".`);
    const variant = await lookupSkuAndRender(query, { throwOnMissing: false });
    if (variant) {
      if (els.productResults) els.productResults.innerHTML = '';
      return;
    }

    setStatus(els.skuStatus, 'No SKU match. Searching by product name...', '');
    const cacheKey = query.toLowerCase();
    const cached = cacheGet(productSearchCache, cacheKey, productSearchCacheTtlMs);
    if (cached) {
      renderProductResults(cached);
      setStatus(els.skuStatus, `Loaded ${cached.length} cached result(s).`, 'good');
      return;
    }
    const data = await apiGet(`/product_search?query=${encodeURIComponent(query)}&limit=5&cb=${Date.now()}`);
    const variants = data.variants || [];
    cacheSet(productSearchCache, cacheKey, variants);
    renderProductResults(variants);
    addAuditEntry('product_search_result', `Product search "${query}" returned ${variants.length} variant(s).`);
    setStatus(els.skuStatus, `Found ${variants.length} variant(s).`, variants.length ? 'good' : '');
  } catch (err) {
    setStatus(els.skuStatus, err.message, 'bad');
    addAuditEntry('sku_search_error', `Lookup failed for "${els.sku.value.trim()}": ${summarizeError(err)}`, { flushNow: true, reason: 'sku-search-error' });
  }
});

// product search now falls back automatically when SKU search misses

els.btnAddSku.addEventListener('click', () => {
  if (!lastVariant) {
    setStatus(els.skuStatus, 'Lookup a SKU first', 'bad');
    return;
  }
  const qty = Math.max(1, Number(els.skuQty.value || 1));
  if (addVariantToCart(lastVariant, qty, 'manual')) {
    clearSkuLookupUi();
    setStatus(els.skuStatus, 'Added to order.', 'good');
  }
});

els.btnCreateDraft.addEventListener('click', async () => {
  let submitStarted = false;
  try {
    if (draftSubmitInFlight) {
      setStatus(els.draftStatus, 'Draft request already in progress...', 'progress');
      return;
    }
    const customerId = els.customerId.value.trim();
    if (!customerId) throw new Error('Customer ID required');
    if (!orderItems.length) throw new Error('Add at least one SKU');

    const addrIdx = Number(els.addressSelect.value || 0);
    const addr = lastAddresses[addrIdx];
    const conflictState = getRestrictedShippingConflictState();
    if (conflictState) {
      addAuditEntry('shipping_restriction_block', `Draft submit blocked due to restricted shipping state ${conflictState}.`, { flushNow: true, reason: 'shipping-restriction' });
      throw new Error(`One or more items cannot ship to ${conflictState}. Remove restricted items or choose a different address.`);
    }

    const isUpdate = Boolean(els.draftOrderId.value.trim());
    if (isUpdate && currentAddressValidation.requiresOverride && !els.addressOverride?.checked) {
      throw new Error('Address validation requires override to update this draft order.');
    }
    stopDraftConversionPolling('draft_submit');
    showConversionPanel(false);
    setDraftWorkingState(true, isUpdate);
    submitStarted = true;
    setStatus(els.draftStatus, isUpdate ? 'Updating draft order...' : 'Creating draft order...', 'progress');

    const hasBogoItems = orderItems.some((item) => item.bogo);
    const promoCode = getPromoCode();
    const shippingLine = getShippingLineInput();
    addAuditEntry(
      isUpdate ? 'draft_update_start' : 'draft_create_start',
      `${isUpdate ? 'Updating' : 'Creating'} draft with ${orderItems.length} line item(s)${promoCode ? `, promo ${promoCode}` : ''}.`
    );

    if (isUpdate) {
      const payload = {
        draft_order_id: els.draftOrderId.value.trim(),
        line_items: orderItems.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
      };
      if (auditState.actorId) {
        payload.metadata = { 'agnoStack-metadata.agent_id': String(auditState.actorId).trim() };
      }
      if (promoCode) payload.promo_code = promoCode;
      if (shippingLine) payload.shipping_line = shippingLine;
      if (addr) {
        payload.shipping_address = addr;
        payload.billing_same_as_shipping = true;
      }
      const idempotencyKey = getDraftMutationKey('draft_order_update', payload);
      payload.idempotency_key = idempotencyKey;
      const data = await apiPost('/draft_order_update', payload, {
        'Idempotency-Key': idempotencyKey,
        'X-Idempotency-Key': idempotencyKey,
      });
      const draft = data?.draft_order || null;
      const resolvedPromoCode = String(data?.resolved_promo_code || '').trim();
      const resolvedSourceCode = String(data?.resolved_source_code || '').trim();
      const promoResolutionMode = String(data?.promo_resolution_mode || '').trim();
      setInvoiceUrl(data?.invoice_url || draft?.invoiceUrl || draft?.invoice_url || '');
      setTotals(draft);
      setPromoResultStatus(resolvedPromoCode || promoCode, draft, hasBogoItems, {
        enteredCode: promoCode,
        resolvedCode: resolvedPromoCode,
        sourceCode: resolvedSourceCode,
        mode: promoResolutionMode,
      });
      applyDraftDiscountsToCurrentItems(draft);
      renderOrderItems();
      updateShippingRestrictionWarning();
      setShippingLineFromDraft(draft);
      applyAddressValidationState(draft);
      els.draftOrderId.value = draft?.legacyResourceId || draft?.id || els.draftOrderId.value;
      setStatus(els.draftStatus, `Draft order ${draft?.name || ''} updated.`, 'good');
      addAuditEntry('draft_update_success', `Updated draft ${draft?.name || draft?.legacyResourceId || draft?.id || 'unknown'}.`, { flushNow: true, reason: 'draft-update' });
      return;
    }

    const payload = {
      customer_id: customerId,
      line_items: orderItems.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
      note: 'Swanson Shopify Assistant',
    };
    if (auditState.actorId) {
      payload.metadata = { 'agnoStack-metadata.agent_id': String(auditState.actorId).trim() };
    }
    if (promoCode) payload.promo_code = promoCode;
    if (shippingLine) payload.shipping_line = shippingLine;
    if (addr) {
      payload.shipping_address = addr;
      payload.billing_same_as_shipping = true;
    }
    const idempotencyKey = getDraftMutationKey('draft_order_create', payload);
    payload.idempotency_key = idempotencyKey;
    const data = await apiPost('/draft_order', payload, {
      'Idempotency-Key': idempotencyKey,
      'X-Idempotency-Key': idempotencyKey,
    });
    const draft = data?.draft_order || null;
    const resolvedPromoCode = String(data?.resolved_promo_code || '').trim();
    const resolvedSourceCode = String(data?.resolved_source_code || '').trim();
    const promoResolutionMode = String(data?.promo_resolution_mode || '').trim();
    els.draftOrderId.value = draft?.legacyResourceId || draft?.id || '';
    setInvoiceUrl(data?.invoice_url || draft?.invoiceUrl || draft?.invoice_url || '');
    setTotals(draft);
    setPromoResultStatus(resolvedPromoCode || promoCode, draft, hasBogoItems, {
      enteredCode: promoCode,
      resolvedCode: resolvedPromoCode,
      sourceCode: resolvedSourceCode,
      mode: promoResolutionMode,
    });
    applyDraftDiscountsToCurrentItems(draft);
    renderOrderItems();
    updateShippingRestrictionWarning();
    setShippingLineFromDraft(draft);
    applyAddressValidationState(draft);
    setDraftButtonState(true);
    setStatus(els.draftStatus, `Draft order ${draft?.name || ''} created.`, 'good');
    addAuditEntry('draft_create_success', `Created draft ${draft?.name || draft?.legacyResourceId || draft?.id || 'unknown'}.`, { flushNow: true, reason: 'draft-create' });
  } catch (err) {
    setStatus(els.draftStatus, err.message, 'bad');
    addAuditEntry('draft_create_update_error', `Draft submit failed: ${summarizeError(err)}`, { flushNow: true, reason: 'draft-error' });
  } finally {
    if (submitStarted) {
      setDraftWorkingState(false, false);
    }
  }
});

async function loadSettings() {
  try {
    try {
      const context = await client.context();
      appLocation = String(context?.location || '');
    } catch (err) {
      appLocation = '';
    }
    const meta = await client.metadata();
    settings = meta && meta.settings ? meta.settings : {};
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

async function pullRequesterEmail() {
  if (appLocation === 'new_ticket_sidebar') {
    try {
      const current = await client.get('currentUser.email');
      return String(current?.['currentUser.email'] || '').trim();
    } catch (err) {
      return '';
    }
  }
  try {
    const data = await client.get(['ticket.requester.email', 'ticket.requester']);
    const email = (data && data['ticket.requester.email'])
      ? String(data['ticket.requester.email'])
      : String(data?.['ticket.requester']?.email || '');
    return email || '';
  } catch (err) {
    return '';
  }
}

async function prefillRequesterAndSearch() {
  try {
    if (els.firstName) els.firstName.value = '';
    if (els.lastName) els.lastName.value = '';
    if (els.phone) els.phone.value = '';
    if (els.tags) els.tags.value = '';
    if (els.swansonId) els.swansonId.value = '';
    if (els.customerId) els.customerId.value = '';
    requesterEmail = await pullRequesterEmail();
    if (els.email && prefillActive && !userEditedEmail) {
      els.email.value = requesterEmail;
    }
    if (requesterEmail && !autoSearchDone) {
      autoSearchDone = true;
      await runCustomerSearch();
    }

    let attempts = 0;
    const retry = async () => {
      if (!prefillActive || userEditedEmail) return;
      attempts += 1;
      const latest = await pullRequesterEmail();
      if (latest) requesterEmail = latest;
      if (els.email && prefillActive && !userEditedEmail) {
        els.email.value = requesterEmail;
      }
      if (requesterEmail && !autoSearchDone) {
        autoSearchDone = true;
        await runCustomerSearch();
      }
      if (attempts < 3) {
        setTimeout(retry, 1000);
      }
    };
    setTimeout(retry, 1000);
  } catch (err) {
    console.error('Failed to prefill requester', err);
  }
}

loadSettings()
  .then(async () => {
    await initAuditContext();
    await prefillRequesterAndSearch();
  });
setTimeout(() => { prefillActive = false; }, 3000);

try {
  client.on('ticket.save', () => {
    flushAuditToBackend('ticket-save');
    return true;
  });
} catch (err) {
  console.warn('Unable to attach ticket.save audit hook', err);
}

window.addEventListener('beforeunload', () => {
  flushAuditToBackend('page-unload');
});

function resizeToContent() {
  const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  client.invoke('resize', { width: '100%', height: `${height}px` });
}

resizeToContent();
window.addEventListener('resize', resizeToContent);
const resizeObserver = new MutationObserver(resizeToContent);
resizeObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

setStatus(els.apiStatus, 'Ready.', '');
setInvoiceUrl('');
setTotals(null);
setShippingLineFromDraft(null);
if (els.freeShipping) els.freeShipping.checked = false;
updateShippingCostDisplay();
renderCustomerProfile(null);
applyAddressValidationState(null);
setDraftButtonState(false);
setUpsellExpanded(false);
setStatus(els.upsellStatus, 'Select a customer to load upsell ideas from prior orders.', '');
renderUpsellSuggestions();
setActiveModule('customer');
syncCustomerSelectionUi('');
