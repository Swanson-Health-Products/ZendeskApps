# Swanson Shopify Assistant: Promo Pricing, Cart, and Orders

This document describes the current expected behavior based on the deployed app and Lambda implementation.

## Promo Pricing In Cart

- The cart/draft builder sends `promo_code` to backend endpoints:
  - `POST /draft_order`
  - `POST /draft_order_update`
- Manual promo codes are entered in the cart `Promo Code` field.
- BOGO items auto-force promo code `INT999`:
  - when SKU lookup identifies `variant.bogo`
  - when items loaded from order/draft include BOGO enrichment
- BOGO quantities are normalized to even quantities before draft creation/update.
- If an existing draft has only order-level discount (no line-level discounts), UI allocates discount across lines proportionally for display.

### Display Rules

- Cart line display shows:
  - base/original unit price
  - discounted unit price
  - per-unit savings when `discount_total` is present
- Totals (`Subtotal`, `Tax`, `Total`) are populated from returned `draft_order`.
- Shipping line is included if speed/free-shipping is set in UI.

## Orders Display Behavior

- `GET /customer_orders?customer_id=...` returns:
  - `orders` (recent orders)
  - `draft_orders`
  - `profile`
- Orders are rendered in the `Orders` module with:
  - shipment/payment/fraud pills
  - expandable details (line items, shipments, fraud analysis)
  - actions (reorder, hold, cancel, refund)
- Draft orders are shown above regular orders with `Open Draft` action.

## Fix Applied (2026-03-03)

- Issue: if an agent clicked `New Order`, orders were minimized and could stay hidden on subsequent customer loads.
- Fix: orders panel now auto-restores visibility before loading customer orders.
- File changed:
  - `apps/swanson-shopify-assistant/assets/app.js`

## Source References

- Frontend app logic:
  - `apps/swanson-shopify-assistant/assets/app.js`
- Frontend UI:
  - `apps/swanson-shopify-assistant/assets/iframe.html`
- Backend API behavior:
  - `lambda/shopify-lookup/index.js`
  - `lambda/shopify-lookup/README.md`
