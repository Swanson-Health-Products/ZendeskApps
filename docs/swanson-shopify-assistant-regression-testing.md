# Swanson Shopify Assistant Regression Testing (Chrome DevTools)

Last updated: 2026-03-06  
Tooling: Chrome DevTools MCP on live Zendesk Agent Workspace  
Target ticket: `https://swansonhealthproducts.zendesk.com/agent/tickets/new/1?brand_id=43073659649683`  
App ID: `1212333`

## Goal

Run a repeatable regression pass against the embedded Zendesk app after frontend deploys, Lambda deploys, or behavior changes that affect customer lookup, orders, cart, pricing, shipping, promo logic, and backend audit logging.

## Preconditions

- Logged into Zendesk as an agent with access to the app.
- Testing must happen inside the embedded app in Zendesk Agent Workspace, not by opening the app iframe URL directly.
- App settings are already configured in Zendesk Admin.
- If backend changes were deployed, API Gateway and Lambda are already updated before running the UI pass.

## Test Scope Guide

Use the smallest test pass that matches the change.

### Smoke Pass

Use after:
- CSS-only tweaks
- copy/text changes
- button styling/hover changes
- small frontend layout adjustments

Minimum cases:
- 1. App boot and navigation
- 2. Customer search and selection
- 5. Orders list rendering
- 7. Order expand/collapse controls
- 12. Cart SKU lookup and product search
- 25. Button styling consistency
- 26. Console sanity

### Functional Pass

Use after:
- frontend logic changes
- order rendering changes
- cart behavior changes
- promo/source-code UI changes
- new UX features that do not alter backend contracts

Minimum cases:
- all Smoke Pass cases
- 3. Clear customer behavior
- 6. Order intelligence strip
- 8. Shipment detail rendering
- 9. Shipment tracking history toggle
- 10. Draft order open flow
- 11. Reorder flow
- 13. Cart line-item controls
- 14. Manual line-price override
- 16. Promo code flow
- 17. Source-code to promo-code conversion
- 18. BOGO handling
- 22. Invoice actions and conversion polling
- 23. Upsell suggestions
- 24. Replenishment / low-supply callouts

### Exhaustive Pass

Use after:
- Lambda deploys
- Shopify payload changes
- pricing logic changes
- shipping/address validation changes
- audit logging changes
- draft create/update payload changes
- release candidates / production hardening

Minimum cases:
- all Functional Pass cases
- backend smoke script
- 4. Customer creation / duplicate handling
- 15. Draft create with manual price override
- 19. Shipping line controls
- 20. Restricted shipping guard
- 21. Address validation handling
- Backend Audit Regression section

### Quick Rule

- frontend-only visual tweak: `Smoke Pass`
- frontend behavior change: `Functional Pass`
- backend, pricing, shipping, audit, or draft mutation change: `Exhaustive Pass`

## Recommended Execution Order

1. Backend smoke
- Run:
```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\kevin.wolf\ZendeskApps\scripts\run-shopify-assistant-regression.ps1
```
- Expected:
  - timestamped output in `docs/regression-artifacts/`
  - non-zero exit code on backend failure

2. Embedded Zendesk UI regression
- Use Chrome DevTools MCP on the live Zendesk ticket sidebar.
- Capture screenshots for any visible UI regression.
- Inspect network requests for create/update draft flows when pricing, promo, or order hydration behavior changes.

3. Backend audit verification
- Confirm app-originated actions write only to backend audit storage.
- Confirm the app is not writing internal-note audit messages into the Zendesk composer.

## Core Regression Matrix

### 1. App boot and navigation

Action:
- Open the ticket sidebar.
- Expand `Swanson Shopify Assistant`.
- Confirm `Customer`, `Orders`, and `Cart` navigation is visible.

Expected:
- iframe loads from `1212333.apps.zdusercontent.com`
- no blocking error banner
- nav buttons render and switch modules correctly

### 2. Customer search and selection

Action:
- In `Customer`, verify email prefill when requester context exists.
- Search by email.
- Click a returned customer result row.

Expected:
- results render with hover styling
- selected row is visually distinct
- customer profile loads
- saved addresses load
- `Clear Customer` becomes available
- `Next: Orders` enables only after selection

### 3. Clear customer behavior

Action:
- With a selected customer, click `Clear Customer`.

Expected:
- selected customer context resets
- profile, orders, drafts, cart context, promo state, upsell state, and conversion polling state clear
- search inputs/results remain available for quick reselection
- `Next: Orders` becomes disabled

### 4. Customer creation / duplicate handling

Action:
- Open `New Customer`.
- Attempt create with valid values.
- Attempt create using an already-existing phone or email.

Expected:
- successful create selects the new customer
- duplicate phone/email path falls back to customer search rather than silent failure

### 5. Orders list rendering

Action:
- Open `Orders` for a selected customer.

Expected:
- status line shows loaded order and draft counts
- `Draft Orders` section renders above `Orders`
- customer orders default open
- draft orders default collapsed
- order cards show:
  - shipping pill
  - payment pill
  - fraud pill
  - amount
  - placed/updated dates when available
  - order number

### 6. Order intelligence strip

Action:
- Inspect multiple order cards.

Expected:
- compact intelligence pills appear under the order meta row when data is available
- examples include:
  - `No shipments yet`
  - `Awaiting fulfillment`
  - `Payment captured`
  - `Placed 4 weeks ago`
  - shipment count / delivered / in transit signals where applicable
- no corrupted glyphs in pills or order controls

### 7. Order expand/collapse controls

Action:
- Expand and collapse multiple orders.
- Verify only the selected order opens at a time.

Expected:
- icon-only chevron button renders correctly
- no mojibake / corrupted characters
- expanding one order collapses the others

### 8. Shipment detail rendering

Action:
- Expand an order with fulfillment data.

Expected:
- shipment cards show:
  - shipment title/status
  - tracking number
  - tracking link
  - latest update
  - expected delivery when Shopify provides ETA
- text separators render correctly as a bullet separator (`\u2022`), not corrupted text
- long fraud/shipping text wraps inside the card instead of overflowing

### 9. Shipment tracking history toggle

Action:
- On an order with tracking events, click `Show tracking history`.
- Collapse it again.

Expected:
- tracking history is collapsed by default
- button toggles to `Hide tracking history` when expanded
- only the shipment's own event history expands
- history entries show readable status/date/message formatting

### 10. Draft order open flow

Action:
- In `Draft Orders`, click `Open Draft`.

Expected:
- app switches into cart editing context
- progress state is visible while loading
- draft order ID populates
- line items hydrate into cart
- totals, promo state, shipping line, and address validation state hydrate
- invoice buttons become usable when invoice URL exists

### 11. Reorder flow

Action:
- In `Orders`, click `Reorder Items` on a recent order.

Expected:
- cart populates with reorderable items
- order items include image/title/sku/qty
- status confirms reorder load success

### 12. Cart SKU lookup and product search

Action:
- In `Cart`, search by exact SKU.
- Search by product term with multiple variants.

Expected:
- exact SKU lookup shows preview card with image/title/sku/price/inventory
- multi-result searches show per-result `Add To Order` buttons
- after add, preview/results clear from the search area

### 13. Cart line-item controls

Action:
- Add at least one SKU.
- Adjust quantity.
- Remove a line.

Expected:
- line items update without stale UI state
- subtotal/tax/total update correctly in the cart display

### 14. Manual line-price override

Action:
- Add a SKU to cart.
- Click the line-item price.
- Change it to a valid lower value.
- Save.
- Then reset to catalog price.

Expected:
- inline editor appears with save/cancel controls
- local totals update immediately after save
- line shows manual-price indicator and catalog comparison
- reset returns the line to catalog price

### 15. Draft create with manual price override

Action:
- Create a draft order after applying a manual price override.
- If possible, reopen or update the same draft and verify the overridden price persisted.

Expected:
- backend accepts the override
- Shopify draft reflects overridden unit price rather than catalog price
- totals returned from draft match the overridden line price

### 16. Promo code flow

Action:
- Enter a standard promo code.
- Create or update a draft.

Expected:
- promo status clearly reports success or no-discount outcome
- no stale promo message remains after starting a new order

### 17. Source-code to promo-code conversion

Action:
- Enter a known source code (example: `INTE3CCA`).
- Create or update a draft.

Expected:
- UI clearly reports source conversion to the resolved promo code
- fallback behavior still works if source lookup does not resolve and the entered value should be treated as a normal promo code

### 18. BOGO handling

Action:
- Add a known BOGO SKU (example previously used: `SWA030`).
- Create or update draft.

Expected:
- BOGO path applies the expected promo handling
- quantities normalize correctly for BOGO logic
- promo status communicates BOGO application outcome

### 19. Shipping line controls

Action:
- Set shipping speed and/or shipping cost.
- Toggle free shipping.

Expected:
- UI updates shipping values correctly
- totals update accordingly
- free shipping clears conflicting paid shipping values when intended

### 20. Restricted shipping guard

Action:
- Use a restricted SKU/state combination when available.
- Attempt draft create/update.

Expected:
- draft submission is blocked before mutation
- clear warning is shown for the restricted state conflict

### 21. Address validation handling

Action:
- Open a draft or create/update a draft that returns address validation summary.

Expected:
- validation message renders
- override requirement is enforced before update when needed

### 22. Invoice actions and conversion polling

Action:
- On an open draft with invoice URL, click:
  - `Open Invoice`
  - `Copy URL`
- Observe conversion status panel.

Expected:
- invoice open/copy actions work
- conversion polling starts only from invoice actions
- polling checks every 20 seconds
- compact in-progress state is visible
- if conversion completes, status reflects that and `Refresh Orders` is available
- if conversion never completes, timeout messaging is non-blocking and does not break the agent workflow

### 23. Upsell suggestions

Action:
- In `Cart`, expand the upsell panel for a customer with prior purchase history.
- Add one upsell suggestion.

Expected:
- upsell list excludes items already in cart
- only in-stock items are shown
- one-click add works
- upsell item disappears from visible suggestions once added to cart

### 24. Replenishment / low-supply callouts

Action:
- Inspect upsell suggestions for a customer with prior consumable purchases.

Expected:
- when data supports it, suggestions show low-supply / replenishment callouts based on elapsed time and servings-per-container logic

### 25. Button styling consistency

Action:
- Hover major action buttons across modules.

Expected:
- hover states are visually consistent
- dark green hover states retain readable white text
- invoice buttons match each other stylistically

### 26. Console sanity

Action:
- Review console messages while exercising the app.

Expected:
- no blocking runtime errors from `Swanson Shopify Assistant`
- warnings/errors from other Zendesk apps may exist but should be called out separately

## Backend Audit Regression

### 1. App-only audit scope

Action:
- Exercise actions inside this app.
- Do not interact with AgnoStack during this validation pass.

Expected:
- backend audit entries reflect actions taken inside this app only
- AgnoStack activity should not create `Swanson Shopify Assistant` audit records

### 2. Agent identity capture

Action:
- Open the app and perform customer/draft actions.

Expected:
- backend audit events include Zendesk agent context:
  - agent ID
  - name
  - email
- draft metadata includes `agnoStack-metadata.agent_id` when draft mutations are sent

### 3. No internal-note audit spam

Action:
- Open the app and perform actions.
- Inspect the Zendesk internal note composer.

Expected:
- no automatic audit/session messages are inserted into the Zendesk note body
- logging remains backend-only

### 4. Flush behavior

Action:
- Perform several app actions, then inspect backend audit results.

Expected:
- audit entries batch and flush successfully
- duplicate spam is not created for rapid repeat actions

## Suggested Test Data

Use real customer/order cases when available:

- `kevin.wolf@swansonhealth.com`
  - useful for general customer/cart/draft validation
- `cbarth001@hotmail.com`
  - useful for shipment event / expected delivery / tracking history validation
- order `SHP6647478`
  - known shipment-event coverage
- source code `INTE3CCA`
  - known source-to-promo conversion path
- promo code `SWNMANIA`
  - known promo validation path
- BOGO SKU `SWA030`
  - known BOGO validation path

## Known Limits / Notes

- Shipment ETA and event history only appear when Shopify/carrier data provides them.
- Some refund/cancel/hold actions depend on the specific order state returned by Shopify.
- Large draft orders may still hit Shopify-side performance limits; this regression guide validates current behavior, not Shopify throughput guarantees.
- When UI encoding regressions are suspected, specifically inspect:
  - expand/collapse chevrons
  - bullet separators in shipment updates and tracking history

## Documentation References

- Feature inventory:
  - `docs/swanson-shopify-assistant-features.md`
- Promo / orders behavior:
  - `docs/shopify-assistant-promo-pricing-and-orders.md`
- Deployment guidance:
  - `docs/zendesk-cli-deployment-guidelines.md`


