# Swanson Shopify Assistant Regression Testing (Chrome DevTools)

Last executed: 2026-03-03  
Tooling: Chrome DevTools MCP on live Zendesk Agent Workspace  
Target ticket: `https://swansonhealthproducts.zendesk.com/agent/tickets/new/1?brand_id=43073659649683`  
App ID: `1212333`  
Deployed asset observed: `.../assets/1772560467-0759b7b20481abb5477a119d1bdda92f/iframe.html`

## Goal

Run non-destructive regression checks directly in the live app iframe through Chrome DevTools and capture pass/fail status.

## Preconditions

- Logged into Zendesk as agent.
- Apps panel open and `Swanson Shopify Assistant` expanded.
- App settings already configured in Zendesk Admin.

## DevTools Regression Cases

1. Iframe boot and module chrome
- Action:
  - Verify iframe exists with `1212333.apps.zdusercontent.com` source.
  - Verify header and nav buttons (`Customer`, `Orders`, `Cart`) render.
- Expected:
  - iframe present and reachable
  - module navigation visible

2. Customer prefill and search
- Action:
  - In `Customer` module, verify email prefill.
  - Click `Search`.
- Expected:
  - customer results render
  - profile card and addresses render

3. Orders list rendering
- Action:
  - Click `Orders`.
- Expected:
  - status shows loaded order/draft counts
  - draft rows render (`Open Draft`, `Invoice`)
  - order rows render with shipping/payment/fraud pills and action buttons

4. Minimize/restore regression (`New Order` path)
- Action:
  1. In `Orders`, click `New Order` (moves to `Cart`)
  2. Return to `Customer`, click `Search`
  3. Return to `Orders`
- Expected:
  - orders list is visible again
  - no stuck hidden/minimized orders panel

5. Reorder -> cart transition
- Action:
  - In `Orders`, click `Reorder Items` on a recent order.
- Expected:
  - app switches to `Cart`
  - draft builder table populates line items
  - status shows loading/loaded text

6. Draft load from Orders
- Action:
  - In `Orders`, click `Open Draft`.
- Expected:
  - app switches to `Cart`
  - draft items hydrate
  - status similar to `Loaded #Dxxxx for editing.`

7. Console sanity (app-specific)
- Action:
  - Inspect page console messages.
- Expected:
  - no blocking runtime errors from `Swanson Shopify Assistant`
  - external warnings from other apps are acceptable

8. Promo outcome visibility
- Action:
  1. In `Cart`, enter a promo code.
  2. Create or update a draft order.
  3. Inspect `#promoStatus` text.
- Expected:
  - when discount > 0: `Promo <CODE> applied: -$X.XX.`
  - when discount = 0 with promo entered: `Promo <CODE> was sent, but no discount was returned for current items.`
  - no stale promo status when `New Order` is started

## Results (2026-03-03)

- Case 1: PASS
- Case 2: PASS
- Case 3: PASS
- Case 4: PASS
- Case 5: PASS
- Case 6: PASS
- Case 7: PASS (no blocking Swanson app errors observed)
- Case 8: PASS (`Promo CEO40SW applied: -$8.32.` observed on new draft `#D33270`)

Notes:
- Console warnings were primarily from `Shopify Premium for Zendesk` and platform integrations, not from `Swanson Shopify Assistant`.
- Promo pricing mutation roundtrip was intentionally non-destructive in this run. Promo behavior expectations are documented in:
  - `docs/shopify-assistant-promo-pricing-and-orders.md`
