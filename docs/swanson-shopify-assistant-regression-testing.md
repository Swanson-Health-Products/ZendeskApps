# Swanson Shopify Assistant Regression Testing (Chrome DevTools)

Last executed: 2026-03-03  
Tooling: Chrome DevTools MCP on live Zendesk Agent Workspace  
Target ticket: `https://swansonhealthproducts.zendesk.com/agent/tickets/new/1?brand_id=43073659649683`  
App ID: `1212333`  
Deployed asset observed: `.../assets/1772566084-8a9e2c4605f092d06ef283077c8348ad/iframe.html`

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

## Delta Regression (UI/Header Removal + Restricted Shipping Guard)

Executed: 2026-03-03 (post-deploy of latest iframe)

1. Top header removal
- Action:
  - Open deployed iframe and verify top title/subtitle block is absent.
- Expected:
  - No `Swanson Shopify Assistant` + subtitle block above module nav.
- Result:
  - PASS

2. Module navigation still functional
- Action:
  - Click `Customer`, `Orders`, `Cart` in sequence.
- Expected:
  - Correct module content renders each time.
- Result:
  - PASS

3. Order expand control icon-only
- Action:
  - Inspect orders rendering code and control output.
- Expected:
  - Expand/collapse uses icon toggle, not text label.
- Result:
  - PASS (`▸` / `▾` toggle in `order-expand-toggle`)

4. Address preview styling for overflow/readability
- Action:
  - Inspect `#shipPreview` CSS.
- Expected:
  - Inherited font, wrapping, and vertical scroll for long addresses.
- Result:
  - PASS (`font-family: inherit`, `overflow-wrap: anywhere`, `max-height`, `overflow-y: auto`)

5. Restricted shipping guard on create/update draft
- Action:
  - Inspect cart submit path for state conflict blocking logic.
- Expected:
  - Draft create/update stops with clear error when item restricted for selected state.
- Result:
  - PASS (`getRestrictedShippingConflictState()` guard and error throw before create/update)

6. Hover contrast (white text on dark green)
- Action:
  - Inspect hover rules for nav/action buttons.
- Expected:
  - Hover state keeps white text on dark background.
- Result:
  - PASS (`.module-nav button:hover`, `.order-actions button:hover`, `.btn-compact:hover` set readable contrast)

Limitations for this delta pass:
- Live data mutation tests (customer search/draft write) were not re-run in standalone iframe because app settings are injected in Zendesk context; standalone showed `Missing API key. Check app configuration.` which is expected outside normal embedded context.
