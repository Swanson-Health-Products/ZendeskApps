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
  btnSelectFirstCustomer: document.getElementById('btnSelectFirstCustomer'),
  btnNewCustomer: document.getElementById('btnNewCustomer'),
  newCustomerPanel: document.getElementById('newCustomerPanel'),
  newCustomerName: document.getElementById('newCustomerName'),
  newCustomerPhone: document.getElementById('newCustomerPhone'),
  newCustomerEmail: document.getElementById('newCustomerEmail'),
  btnNoEmail: document.getElementById('btnNoEmail'),
  btnCreateCustomer: document.getElementById('btnCreateCustomer'),
  newCustomerStatus: document.getElementById('newCustomerStatus'),
  customerStatus: document.getElementById('customerStatus'),
  customerResults: document.getElementById('customerResults'),
  ordersStatus: document.getElementById('ordersStatus'),
  ordersList: document.getElementById('ordersList'),
  btnNewOrder: document.getElementById('btnNewOrder'),
  addressSelect: document.getElementById('addressSelect'),
  shipPreview: document.getElementById('shipPreview'),
  shipWarning: document.getElementById('shipWarning'),
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
  draftOrderId: document.getElementById('draftOrderId'),
  invoiceUrl: document.getElementById('invoiceUrl'),
  invoiceLink: document.getElementById('invoiceLink'),
  promoCode: document.getElementById('promoCode'),
  subtotal: document.getElementById('subtotal'),
  totalTax: document.getElementById('totalTax'),
  total: document.getElementById('total'),
  btnCreateDraft: document.getElementById('btnCreateDraft'),
  draftStatus: document.getElementById('draftStatus'),
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
let selectedShipState = '';
let lastSearchCustomers = [];
let autoSearchDone = false;
let requesterEmail = '';
let userEditedEmail = false;
let prefillActive = true;

const client = ZAFClient.init();
let settings = {};
const DEFAULT_API_BASE_URL = 'https://rvkg901wy9.execute-api.us-east-1.amazonaws.com/prod';

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

function setStatus(el, message, type) {
  el.textContent = message || '';
  el.className = type ? `status ${type}` : 'status';
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

function buildProxyUrl(path) {
  const base = (settings.apiBaseUrl || DEFAULT_API_BASE_URL || '').trim().replace(/\/$/, '');
  const target = `${base}${path}`;
  return `/api/v2/zendesk_apps_proxy/proxy/apps/secure/${encodeURIComponent(target)}`;
}

async function apiGet(path) {
  ensureSettings();
  const url = buildProxyUrl(path);
  return client.request({
    url,
    type: 'GET',
    dataType: 'json',
    cache: false,
    headers: {
      'X-Api-Key': settings.apiKey || '',
      'Accept': 'application/json',
    },
  });
}

async function apiPost(path, body) {
  ensureSettings();
  const url = buildProxyUrl(path);
  return client.request({
    url,
    type: 'POST',
    dataType: 'json',
    contentType: 'application/json',
    cache: false,
    headers: {
      'X-Api-Key': settings.apiKey || '',
      'Accept': 'application/json',
    },
    data: JSON.stringify(body),
  });
}

function renderCustomers(customers, selectedId) {
  els.customerResults.innerHTML = '';
  const list = selectedId ? customers.filter((c) => String(c.id) === String(selectedId)) : customers;
  list.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${c.first_name} ${c.last_name}</strong>
      <span class="pill">ID ${c.id}</span>
      <div>${c.email || ''}</div>
    `;
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => handleCustomerSelect(c, customers));
    els.customerResults.appendChild(li);
  });
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

function updateAddressPreview() {
  const idx = Number(els.addressSelect.value || 0);
  const addr = lastAddresses[idx];
  if (!addr) {
    els.shipPreview.value = '';
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

function updateShippingRestrictionWarning() {
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
  if (!currentState || !restrictedStates.size) {
    els.shipWarning.style.display = 'none';
    els.shipWarning.textContent = '';
    return;
  }
  const restrictedList = Array.from(restrictedStates.values());
  if (hasRestrictedState(restrictedList, currentState)) {
    els.shipWarning.style.display = 'block';
    els.shipWarning.textContent = `Caution: One or more items cannot ship to ${currentState}.`;
  } else {
    els.shipWarning.style.display = 'none';
    els.shipWarning.textContent = '';
  }
}

function renderSkuCard(variant) {
  if (!variant) {
    els.skuCard.innerHTML = '';
    return;
  }
  const img = variant.image_url ? `<img src="${variant.image_url}" alt="${variant.image_alt || ''}">` : '<div class="pill">No image</div>';
  const bogo = variant.bogo ? '<span class="pill">BOGO</span>' : '';
  const restricted = parseRestrictedStates(variant.restricted_states || '');
  const restrictedLabel = restricted.length ? `<span class="pill">Restricted: ${restricted.join(', ')}</span>` : '';
  els.skuCard.innerHTML = `
    <div class="sku-card">
      ${img}
      <div>
        <div><strong>${variant.product?.title || variant.title}</strong></div>
        <div class="status">SKU ${variant.sku} - $${variant.price} ${bogo} ${restrictedLabel}</div>
      </div>
    </div>
  `;
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
      <td><input class="qty-input" type="number" min="1" value="${item.quantity}"></td>
      <td><button class="secondary">Remove</button></td>
    `;
    const qtyInput = tr.querySelector('input');
    qtyInput.addEventListener('change', () => {
      const val = Math.max(1, Number(qtyInput.value || 1));
      item.quantity = val;
    });
    const removeBtn = tr.querySelector('button');
    removeBtn.addEventListener('click', () => {
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
          title: item.fromDraft && item.title ? item.title : (variant.product?.title || variant.title || item.title),
          price: item.fromDraft && item.price ? item.price : (variant.price || item.price),
          bogo,
          quantity: qty,
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

function renderOrders(orders, draftOrders) {
  els.ordersList.innerHTML = '';
  const hasOrders = orders.length || draftOrders.length;
  if (!hasOrders) {
    els.ordersList.innerHTML = '<div class="status">No recent orders found.</div>';
    return;
  }

  if (draftOrders.length) {
    const header = document.createElement('div');
    header.innerHTML = '<strong>Draft Orders</strong>';
    els.ordersList.appendChild(header);
  }

  draftOrders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-card';
    const items = order.line_items || [];
    card.innerHTML = `
      <div class="order-header">
        <div>
          <strong>${order.name || 'Draft Order'}</strong>
          <div class="order-meta">
            <span class="pill">${order.status || 'OPEN'}</span>
            <span class="pill">${formatMoney(order.total, order.currency)}</span>
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
      try {
        const draftId = order.legacy_id || '';
        els.draftOrderId.value = draftId;
        setStatus(els.draftStatus, `Loading ${order.name || 'draft order'}...`, '');
        const data = await apiGet(`/draft_order_get?draft_order_id=${encodeURIComponent(draftId)}`);
        const draft = data.draft_order || {};
        setInvoiceUrl(draft.invoiceUrl || order.invoice_url || '');
        setTotals(draft);
        setDraftButtonState(true);
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
          els.promoCode.value = 'INT999';
        }
        renderOrderItems();
        updateShippingRestrictionWarning();
        setStatus(els.draftStatus, `Loaded ${order.name || 'draft order'} for editing.`, 'good');
        minimizeOrdersSection();
        setActiveModule('order');
      } catch (err) {
        setStatus(els.draftStatus, err.message, 'bad');
      }
    });

    const link = card.querySelector('a');
    if (link && order.invoice_url) {
      link.href = order.invoice_url;
    }

    els.ordersList.appendChild(card);
  });

  if (orders.length) {
    const header = document.createElement('div');
    header.style.marginTop = '12px';
    header.innerHTML = '<strong>Orders</strong>';
    els.ordersList.appendChild(header);
  }

  orders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-card';
    const items = order.line_items || [];
    card.innerHTML = `
      <div class="order-header">
        <div>
          <strong>${order.name || 'Order'}</strong>
          <div class="order-meta">
            <span class="pill">Shipping: ${order.fulfillment_status || 'UNKNOWN'}</span>
            ${order.delivery_status ? `<span class="pill">Delivery: ${order.delivery_status}</span>` : ''}
            ${order.latest_status ? `<span class="pill">Latest: ${order.latest_status}</span>` : ''}
            <span class="pill">Payment: ${order.financial_status || 'UNKNOWN'}</span>
            <span class="pill">${formatMoney(order.total, order.currency)}</span>
          </div>
        </div>
        <div class="pill">Order</div>
      </div>
      <ul class="order-items" style="display:none;"></ul>
      <div class="order-actions">
        <button class="secondary btn-hold">Put On Hold</button>
        <button class="secondary btn-cancel">Cancel Order</button>
        <button class="secondary btn-refund">Refund</button>
      </div>
    `;

    const list = card.querySelector('.order-items');
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.sku || ''} - ${item.title || ''} - Qty ${item.quantity || 0}`;
      list.appendChild(li);
    });
    if (order.tracking_numbers && order.tracking_numbers.length) {
      order.tracking_numbers.forEach((number, idx) => {
        const company = (order.tracking_companies || [])[idx] || 'Carrier';
        const url = (order.tracking_urls || [])[idx] || '';
        const li = document.createElement('li');
        if (url) {
          li.innerHTML = `Tracking: ${company} ${number} - <a href="${url}" target="_blank" rel="noopener">${url}</a>`;
        } else {
          li.textContent = `Tracking: ${company} ${number}`;
        }
        list.appendChild(li);
      });
    }

    const header = card.querySelector('.order-header');
    header.addEventListener('click', () => {
      list.style.display = list.style.display === 'none' ? 'block' : 'none';
      const fulfillment = String(order.fulfillment_status || '').toUpperCase();
      if (fulfillment === 'FULFILLED' || fulfillment === 'PARTIALLY_FULFILLED') {
        minimizeOrdersSection();
      }
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
    holdBtn.disabled = fulfillment !== 'UNFULFILLED';
    cancelBtn.disabled = fulfillment !== 'UNFULFILLED';
    refundBtn.disabled = fulfillment !== 'FULFILLED' && fulfillment !== 'PARTIALLY_FULFILLED';

    holdBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm(`Put ${order.name || 'this order'} on hold?`);
        if (!confirmed) return;
        setStatus(els.ordersStatus, `Putting ${order.name || 'order'} on hold...`, '');
        setStatus(els.ordersStatus, `Hold requested for ${order.name || 'order'}.`, 'good');
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
      }
    });

    cancelBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm(`Cancel ${order.name || 'this order'}? This cannot be undone.`);
        if (!confirmed) return;
        setStatus(els.ordersStatus, `Canceling ${order.name || 'order'}...`, '');
        await apiPost('/order_cancel', { order_id: order.legacy_id || order.id });
        setStatus(els.ordersStatus, `Cancel requested for ${order.name || 'order'}.`, 'good');
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
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
        refundPanel.style.display = 'none';
      } catch (err) {
        setStatus(els.ordersStatus, err.message, 'bad');
      }
    });

    els.ordersList.appendChild(card);
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

async function handleCustomerSelect(customer, allCustomers) {
  els.customerId.value = customer.id;
  renderCustomers(allCustomers, customer.id);
  setStatus(els.customerStatus, `Selected customer ${customer.id}. Fetching addresses...`, '');
  try {
    const data = await apiGet(`/customer_addresses?customer_id=${encodeURIComponent(customer.id)}`);
    lastAddresses = data.addresses || [];
    renderAddresses(lastAddresses);
    setStatus(els.customerStatus, `Selected customer ${customer.id}. Loaded ${lastAddresses.length} address(es).`, 'good');
    await fetchOrdersForCustomer(customer.id);
  } catch (err) {
    setStatus(els.customerStatus, err.message, 'bad');
  }
}

function setInvoiceUrl(url) {
  els.invoiceUrl.value = url || '';
  if (els.invoiceLink) {
    if (url) {
      els.invoiceLink.textContent = 'Open invoice';
      els.invoiceLink.href = url;
      els.invoiceLink.style.display = 'inline-block';
    } else {
      els.invoiceLink.textContent = '';
      els.invoiceLink.href = '#';
      els.invoiceLink.style.display = 'none';
    }
  }
}

function setTotals(draftOrder) {
  els.subtotal.value = draftOrder?.subtotalPrice || '';
  els.totalTax.value = draftOrder?.totalTax || '';
  els.total.value = draftOrder?.totalPrice || '';
}

function setDraftButtonState(isUpdate) {
  if (!els.btnCreateDraft) return;
  els.btnCreateDraft.textContent = isUpdate ? 'Update Draft Order' : 'Create Draft Order';
}

function getPromoCode() {
  const code = els.promoCode.value.trim();
  return code || '';
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

els.addressSelect.addEventListener('change', updateAddressPreview);
if (els.email) {
  els.email.addEventListener('input', () => {
    userEditedEmail = true;
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
  els.btnSelectFirstCustomer,
  els.navCustomer,
  els.navOrders,
  els.navOrder,
]);

if (els.navCustomer) els.navCustomer.addEventListener('click', () => setActiveModule('customer'));
if (els.navOrders) els.navOrders.addEventListener('click', () => setActiveModule('orders'));
if (els.navOrder) els.navOrder.addEventListener('click', () => setActiveModule('order'));

if (els.btnCustomerNext) {
  els.btnCustomerNext.addEventListener('click', () => setActiveModule('orders'));
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
  }
});

els.btnCreateCustomer.addEventListener('click', async () => {
  try {
    const name = els.newCustomerName.value.trim();
    const phone = els.newCustomerPhone.value.trim();
    const email = els.newCustomerEmail.value.trim();
    if (!name) throw new Error('Customer name required');
    if (!phone) throw new Error('Phone required');
    if (!email) throw new Error('Email required');
    setStatus(els.newCustomerStatus, 'Creating customer...', '');
    const payload = { name, phone, email };
    const data = await apiPost('/customer_create', payload);
    const customer = data.customer;
    if (!customer?.id) throw new Error('Customer create failed');
    setStatus(els.newCustomerStatus, `Created customer ${customer.id}.`, 'good');
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
        const params = new URLSearchParams({ phone: els.newCustomerPhone.value.trim(), limit: '5' });
        const data = await apiGet(`/search?${params.toString()}`);
        renderCustomers(data.customers || []);
        setStatus(els.newCustomerStatus, 'Found existing customer with this phone. Click to select.', 'good');
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
        return;
      } catch (searchErr) {
        setStatus(els.newCustomerStatus, searchErr.message, 'bad');
        return;
      }
    }
    setStatus(els.newCustomerStatus, err.message, 'bad');
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
    const data = await apiGet(`/search?${params.toString()}`);
    lastSearchCustomers = data.customers || [];
    renderCustomers(lastSearchCustomers);
    if (els.btnSelectFirstCustomer) {
      els.btnSelectFirstCustomer.style.display = lastSearchCustomers.length ? 'inline-block' : 'none';
    }
    // Reset dependent panels so we don't show stale orders/addresses.
    lastOrders = [];
    lastDraftOrders = [];
    els.ordersList.innerHTML = '';
    setStatus(els.ordersStatus, '', '');
    lastAddresses = [];
    renderAddresses(lastAddresses);
    els.shipPreview.value = '';
    updateShippingRestrictionWarning();

    const currentId = els.customerId.value.trim();
    const exactMatch = currentId
      ? lastSearchCustomers.find((c) => String(c.id) === String(currentId))
      : null;
    if (exactMatch) {
      await handleCustomerSelect(exactMatch, lastSearchCustomers);
    } else if (lastSearchCustomers.length === 1) {
      await handleCustomerSelect(lastSearchCustomers[0], lastSearchCustomers);
    }
    setStatus(els.customerStatus, `Found ${data.count || 0} customer(s). Click a result to select.`, 'good');
  } catch (err) {
    setStatus(els.customerStatus, err.message, 'bad');
  }
}

els.btnSearchCustomer.addEventListener('click', runCustomerSearch);

if (els.btnSelectFirstCustomer) {
  els.btnSelectFirstCustomer.addEventListener('click', () => {
    if (!lastSearchCustomers.length) return;
    handleCustomerSelect(lastSearchCustomers[0], lastSearchCustomers);
  });
}

els.btnNewOrder.addEventListener('click', () => {
  minimizeOrdersSection();
  els.draftOrderId.value = '';
  setInvoiceUrl('');
  setTotals(null);
  orderItems = [];
  renderOrderItems();
  setDraftButtonState(false);
  setActiveModule('order');
  setStatus(els.draftStatus, 'Starting a new order. Add SKUs below.', 'good');
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
  } catch (err) {
    setStatus(els.addrStatus, err.message, 'bad');
  }
});

// Addresses are fetched automatically when selecting a customer.

async function fetchOrdersForCustomer(customerId) {
  try {
    setStatus(els.ordersStatus, 'Loading recent orders...', '');
    const data = await apiGet(`/customer_orders?customer_id=${encodeURIComponent(customerId)}`);
    lastOrders = data.orders || [];
    lastDraftOrders = data.draft_orders || [];
    renderOrders(lastOrders, lastDraftOrders);
    setStatus(els.ordersStatus, `Loaded ${lastOrders.length} order(s), ${lastDraftOrders.length} draft order(s).`, 'good');
  } catch (err) {
    setStatus(els.ordersStatus, err.message, 'bad');
  }
}

els.btnLookupSku.addEventListener('click', async () => {
  try {
    const sku = els.sku.value.trim();
    if (!sku) throw new Error('SKU required');
    setStatus(els.skuStatus, 'Looking up SKU...', '');
    const data = await apiGet(`/sku_lookup?sku=${encodeURIComponent(sku)}&limit=5&cb=${Date.now()}`);
    const variant = data.variant || pickVariantBySku(data.variants || [], sku);
    if (!variant) throw new Error('No variant found');
    lastVariant = variant;
    els.variantPrice.value = variant.price || '';
    renderSkuCard(variant);
    if (variant.bogo) {
      els.promoCode.value = 'INT999';
    }
    setStatus(els.skuStatus, `Found ${data.count} variant(s).`, 'good');
  } catch (err) {
    setStatus(els.skuStatus, err.message, 'bad');
  }
});

els.btnAddSku.addEventListener('click', () => {
  if (!lastVariant) {
    setStatus(els.skuStatus, 'Lookup a SKU first', 'bad');
    return;
  }
  let qty = Math.max(1, Number(els.skuQty.value || 1));
  if (lastVariant.bogo) {
    qty = roundUpToEven(qty);
    els.promoCode.value = 'INT999';
  }
  const existing = orderItems.find((item) => item.variantId === lastVariant.id);
  if (existing) {
    existing.quantity = lastVariant.bogo ? roundUpToEven(existing.quantity + qty) : existing.quantity + qty;
  } else {
    orderItems.push({
      variantId: lastVariant.id,
      sku: lastVariant.sku,
      title: lastVariant.product?.title || lastVariant.title,
      price: lastVariant.price,
      quantity: qty,
      bogo: Boolean(lastVariant.bogo),
      image_url: lastVariant.image_url || '',
      image_alt: lastVariant.image_alt || '',
      restricted_states: parseRestrictedStates(lastVariant.restricted_states || ''),
    });
  }
  renderOrderItems();
  updateShippingRestrictionWarning();
  setStatus(els.skuStatus, 'Added to order.', 'good');
});

els.btnCreateDraft.addEventListener('click', async () => {
  try {
    const customerId = els.customerId.value.trim();
    if (!customerId) throw new Error('Customer ID required');
    if (!orderItems.length) throw new Error('Add at least one SKU');

    const addrIdx = Number(els.addressSelect.value || 0);
    const addr = lastAddresses[addrIdx];

    const isUpdate = Boolean(els.draftOrderId.value.trim());
    setStatus(els.draftStatus, isUpdate ? 'Updating draft order...' : 'Creating draft order...', '');

    const promoCode = orderItems.some((item) => item.bogo) ? 'INT999' : getPromoCode();

    if (isUpdate) {
      const payload = {
        draft_order_id: els.draftOrderId.value.trim(),
        line_items: orderItems.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
      };
      if (promoCode) payload.promo_code = promoCode;
      const data = await apiPost('/draft_order_update', payload);
      setInvoiceUrl(data.invoice_url || '');
      setTotals(data.draft_order || null);
      setStatus(els.draftStatus, `Draft order ${data.draft_order?.name || ''} updated.`, 'good');
      return;
    }

    const payload = {
      customer_id: customerId,
      line_items: orderItems.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
      note: 'Swanson Shopify Assistant',
    };
    if (promoCode) payload.promo_code = promoCode;
    if (addr) {
      payload.shipping_address = addr;
      payload.billing_same_as_shipping = true;
    }
    const data = await apiPost('/draft_order', payload);
    els.draftOrderId.value = data.draft_order?.legacyResourceId || '';
    setInvoiceUrl(data.invoice_url || '');
    setTotals(data.draft_order || null);
    setDraftButtonState(true);
    setStatus(els.draftStatus, `Draft order ${data.draft_order?.name || ''} created.`, 'good');
  } catch (err) {
    setStatus(els.draftStatus, err.message, 'bad');
  }
});

async function loadSettings() {
  try {
    const meta = await client.metadata();
    const metaSettings = meta && meta.settings ? meta.settings : {};
    let getSettings = {};
    try {
      const settingsResult = await client.get('settings');
      getSettings = settingsResult?.settings || settingsResult || {};
    } catch (err) {
      getSettings = {};
    }
    settings = { ...metaSettings, ...getSettings };
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

async function pullRequesterEmail() {
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

loadSettings().then(prefillRequesterAndSearch);
setTimeout(() => { prefillActive = false; }, 3000);

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
setDraftButtonState(false);
setActiveModule('customer');
