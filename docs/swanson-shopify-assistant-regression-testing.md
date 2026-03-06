# Swanson Shopify Assistant Regression Testing (Agent Runbook)

Last updated: 2026-03-06  
Primary executor: Codex CLI with Chrome DevTools MCP  
Execution context: embedded app inside Zendesk Agent Workspace only  
Target ticket baseline: `https://swansonhealthproducts.zendesk.com/agent/tickets/new/1?brand_id=43073659649683`  
App ID: `1212333`

## Purpose

This document is written for agent-driven execution, not just human review. Each case is structured so Codex CLI can run it with:
- explicit setup
- explicit actions
- explicit assertions
- explicit cleanup
- safe/non-destructive guidance

## Agent Execution Rules

- Always run inside the embedded Zendesk app, never against the standalone iframe URL.
- Prefer Chrome DevTools MCP for UI verification.
- Use the backend smoke script only for backend prechecks, not as a replacement for embedded UI validation.
- Treat production data carefully. Favor non-destructive paths whenever possible.
- If a case requires a destructive or customer-visible mutation, mark the run output clearly.
- Capture screenshots when a visible UI change is under test.
- Inspect network requests when validating draft pricing, promo, source conversion, or draft hydration behavior.

## Run Types

### Smoke Run

Use after:
- CSS-only changes
- copy/text changes
- hover/focus styling changes
- minor layout changes

Run cases:
- `BOOT-001`
- `CUST-001`
- `ORD-001`
- `ORD-003`
- `CART-001`
- `UI-001`
- `TECH-001`

### Functional Run

Use after:
- frontend logic changes
- order rendering changes
- cart behavior changes
- new UI features that do not alter backend contracts

Run cases:
- all Smoke Run cases
- `CUST-002`
- `ORD-002`
- `ORD-004`
- `ORD-005`
- `ORD-006`
- `CART-002`
- `CART-003`
- `CART-004`
- `PROMO-001`
- `PROMO-002`
- `PROMO-003`
- `DRAFT-001`
- `DRAFT-002`
- `UPSELL-001`
- `UPSELL-002`

### Exhaustive Run

Use after:
- Lambda deploys
- Shopify payload changes
- pricing logic changes
- shipping/address validation changes
- audit logging changes
- draft create/update payload changes
- production hardening / release candidates

Run cases:
- all Functional Run cases
- backend smoke script
- `CUST-003`
- `CART-005`
- `SHIP-001`
- `SHIP-002`
- `ADDR-001`
- `AUDIT-001`
- `AUDIT-002`
- `AUDIT-003`
- `AUDIT-004`

## Test Data Catalog

### TD-001 General customer
- Customer email: `kevin.wolf@swansonhealth.com`
- Use for:
  - customer search
  - clear customer
  - orders rendering
  - cart SKU add
  - draft open / reorder
  - general pricing and promo checks

### TD-002 Tracking customer
- Customer email: `cbarth001@hotmail.com`
- Key order: `SHP6647478`
- Use for:
  - shipment events
  - expected delivery
  - tracking history toggle
  - separator/glyph checks

### TD-003 Source-code conversion
- Source code: `INTE3CCA`
- Expected promo resolution: `SWNMANIA`

### TD-004 Promo
- Promo code: `SWNMANIA`

### TD-005 BOGO SKU
- SKU: `SWA030`

### TD-006 Simple SKU for cart/manual pricing
- Suggested SKU: `SWU114`

## Reset Procedures

### RESET-001 App state reset
- Navigate to `Customer`
- Click `Clear Customer` if visible
- Clear search inputs if the current case requires a fresh lookup
- Confirm `Next: Orders` is disabled

### RESET-002 Cart reset
- Navigate to `Cart`
- If a loaded draft is present, click `New Order` from `Orders` first or clear customer context and reselect customer
- Remove residual line items if the case requires a clean cart
- Clear promo code and shipping inputs when needed

### RESET-003 Orders refresh
- Use Zendesk `Reload all apps` when newly deployed assets must be loaded
- Re-open the app sidebar section if needed

## Backend Precheck

### PRE-001 Backend smoke

Type: semi-automated  
Safe: yes

Steps:
1. Run:
```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\kevin.wolf\ZendeskApps\scripts\run-shopify-assistant-regression.ps1
```

Assertions:
- exit code is zero
- report is written to `docs/regression-artifacts/`

## Case Format

Each case below uses:
- `Type`: automated / semi-automated / manual-check-assisted
- `Safe`: yes / no / conditional
- `Setup`
- `Actions`
- `Assertions`
- `Cleanup`

## Boot Cases

### BOOT-001 App boot and navigation

Type: automated  
Safe: yes

Setup:
- Open the target Zendesk ticket
- Expand `Swanson Shopify Assistant`

Actions:
1. Wait for iframe/app shell to load
2. Inspect visible navigation and app framing

Assertions:
- iframe is loaded from `1212333.apps.zdusercontent.com`
- `Customer`, `Orders`, and `Cart` navigation buttons are visible
- no blocking error banner is shown

Cleanup:
- none

## Customer Cases

### CUST-001 Customer search and selection

Type: automated  
Safe: yes

Setup:
- Run `RESET-001`
- Use `TD-001`

Actions:
1. Open `Customer`
2. Verify email input is present
3. Search for `kevin.wolf@swansonhealth.com`
4. Click the returned customer result row

Assertions:
- customer results render
- selected customer row is visually distinct
- profile card renders
- saved addresses render
- `Clear Customer` is visible
- `Next: Orders` is enabled

Cleanup:
- none

### CUST-002 Clear customer behavior

Type: automated  
Safe: yes

Setup:
- Complete `CUST-001`

Actions:
1. Click `Clear Customer`

Assertions:
- selected customer context clears
- profile clears
- orders/drafts/cart context clears
- `Next: Orders` becomes disabled
- search results remain usable for reselection

Cleanup:
- none

### CUST-003 Customer creation and duplicate handling

Type: manual-check-assisted  
Safe: conditional

Setup:
- Run `RESET-001`

Actions:
1. Open `New Customer`
2. Attempt customer creation with test-safe values
3. Attempt customer creation with an already-existing phone or email

Assertions:
- successful create selects the created customer
- duplicate path falls back to search instead of silent failure

Cleanup:
- if a new test customer was created, record the identifier in test notes

## Orders Cases

### ORD-001 Orders list rendering

Type: automated  
Safe: yes

Setup:
- Complete `CUST-001`

Actions:
1. Open `Orders`

Assertions:
- loaded order and draft counts appear
- `Draft Orders` renders above `Orders`
- customer orders are open by default
- draft orders are collapsed by default
- each order card shows shipping, payment, fraud, amount, and order number metadata

Cleanup:
- none

### ORD-002 Order intelligence strip

Type: automated  
Safe: yes

Setup:
- Complete `ORD-001`

Actions:
1. Inspect the first several order cards

Assertions:
- each card may show intelligence pills when data is available
- known example pills include:
  - `No shipments yet`
  - `Awaiting fulfillment`
  - `Payment captured`
  - relative placed-age text
- no corrupted glyphs appear in the intelligence strip

Cleanup:
- none

### ORD-003 Order expand/collapse control

Type: automated  
Safe: yes

Setup:
- Complete `ORD-001`

Actions:
1. Expand the first order
2. Expand the second order
3. Collapse it again

Assertions:
- chevron icon renders correctly
- expanding one order collapses the previously open order
- no mojibake appears in the control text/icon

Cleanup:
- collapse any expanded orders

### ORD-004 Shipment detail rendering

Type: automated  
Safe: yes

Setup:
- Run `RESET-001`
- Search/select `TD-002`
- Open `Orders`
- Expand order `SHP6647478`

Actions:
1. Inspect shipment cards on `SHP6647478`

Assertions:
- shipment title/status appears
- tracking number appears
- tracking link appears
- latest update appears
- expected delivery appears when provided by Shopify
- latest update uses a readable bullet separator (`\u2022`)
- long shipment/fraud text wraps inside the card

Cleanup:
- none

### ORD-005 Tracking history toggle

Type: automated  
Safe: yes

Setup:
- Complete `ORD-004`

Actions:
1. Click `Show tracking history` for shipment 1
2. Click it again to collapse

Assertions:
- shipment history is collapsed by default
- toggle changes between `Show tracking history` and `Hide tracking history`
- only the targeted shipment history expands

Cleanup:
- collapse shipment history

### ORD-006 Reorder flow

Type: automated  
Safe: conditional

Setup:
- Complete `ORD-001`

Actions:
1. Click `Reorder Items` on a recent order

Assertions:
- app switches to `Cart`
- cart line items populate
- line items show sku/title/qty/image context

Cleanup:
- run `RESET-002` if the next case requires a clean cart

## Draft Cases

### DRAFT-001 Draft open flow

Type: automated  
Safe: yes

Setup:
- Complete `ORD-001`
- Expand `Draft Orders` if needed

Actions:
1. Click `Open Draft` on an available draft

Assertions:
- progress state appears while loading
- cart editing context opens
- draft order ID populates
- line items, totals, shipping line, and invoice controls hydrate

Cleanup:
- none

### DRAFT-002 Invoice actions and conversion polling

Type: manual-check-assisted  
Safe: conditional

Setup:
- Complete `DRAFT-001`
- Require a draft with invoice URL

Actions:
1. Click `Open Invoice`
2. Click `Copy URL`
3. Observe the conversion polling panel

Assertions:
- invoice actions succeed
- polling starts from invoice actions only
- polling checks every 20 seconds
- compact in-progress status is visible
- timeout state, if reached, is non-blocking

Cleanup:
- stop polling if still active

## Cart Cases

### CART-001 SKU lookup and product search

Type: automated  
Safe: yes

Setup:
- Complete `CUST-001`
- Move to `Cart` through the supported workflow

Actions:
1. Search exact SKU `SWU114`
2. Search a broader product term with multiple results

Assertions:
- exact SKU search shows a preview card
- preview card shows image/title/sku/price/inventory when available
- product search shows per-result `Add To Order` buttons

Cleanup:
- none

### CART-002 Add-to-order from search results

Type: automated  
Safe: conditional

Setup:
- Complete `CART-001`

Actions:
1. Add a result from exact SKU search
2. Add a result from multi-result search

Assertions:
- item is added to cart
- search preview/results clear after add
- no stale preview card remains after add

Cleanup:
- remove extra items if the next case needs a clean cart

### CART-003 Line-item controls

Type: automated  
Safe: conditional

Setup:
- Ensure cart contains at least one line item

Actions:
1. Increase or decrease quantity
2. Remove a line item

Assertions:
- cart updates correctly
- subtotal/tax/total update in the UI

Cleanup:
- re-add required test SKU if later cases depend on it

### CART-004 Manual line-price override

Type: automated  
Safe: conditional

Setup:
- Add `TD-006` to cart

Actions:
1. Click the line-item price
2. Enter a lower valid price
3. Save
4. Click reset-to-catalog price

Assertions:
- inline editor appears
- local totals update immediately on save
- manual-price indicator and catalog comparison appear
- reset returns the line to catalog price

Cleanup:
- leave cart in known state for next case

### CART-005 Draft create/update with manual price override

Type: manual-check-assisted  
Safe: conditional

Setup:
- Add `TD-006` to cart
- Apply a manual line-price override

Actions:
1. Create or update draft order
2. Reopen or reload the draft if needed

Assertions:
- backend accepts override
- Shopify draft returns overridden price, not catalog price
- totals reflect overridden price
- network request/response can be inspected to verify pricing payload and returned totals

Cleanup:
- note created draft ID in test output

## Promo Cases

### PROMO-001 Standard promo code

Type: automated  
Safe: conditional

Setup:
- Cart contains at least one eligible item
- Use `TD-004`

Actions:
1. Enter promo code `SWNMANIA`
2. Create or update draft

Assertions:
- promo status reports either success or no-discount outcome clearly
- stale promo status does not persist after starting a new order

Cleanup:
- clear promo field if needed

### PROMO-002 Source-code conversion

Type: automated  
Safe: conditional

Setup:
- Cart contains at least one eligible item
- Use `TD-003`

Actions:
1. Enter source code `INTE3CCA`
2. Create or update draft

Assertions:
- UI reports conversion to promo `SWNMANIA`
- if no source mapping is returned, entered value is treated as a normal promo path without breaking the workflow

Cleanup:
- clear promo/source field if needed

### PROMO-003 BOGO handling

Type: manual-check-assisted  
Safe: conditional

Setup:
- Clean cart
- Use `TD-005`

Actions:
1. Add SKU `SWA030`
2. Create or update draft

Assertions:
- BOGO logic applies expected quantity/promo behavior
- promo status reflects BOGO outcome

Cleanup:
- note resulting draft state if created

## Shipping and Address Cases

### SHIP-001 Shipping line controls

Type: automated  
Safe: conditional

Setup:
- Cart contains at least one item

Actions:
1. Set shipping speed
2. Set or inspect shipping cost
3. Toggle free shipping

Assertions:
- shipping values update correctly
- totals update accordingly
- free shipping clears conflicting paid shipping values when intended

Cleanup:
- clear shipping settings if next case requires default state

### SHIP-002 Restricted shipping guard

Type: manual-check-assisted  
Safe: conditional

Setup:
- Requires a known restricted SKU/state combination

Actions:
1. Select shipping state that conflicts with the restricted SKU
2. Attempt draft create/update

Assertions:
- draft mutation is blocked before submit
- warning clearly identifies the restricted-state conflict

Cleanup:
- remove restricted SKU or reset address selection

### ADDR-001 Address validation handling

Type: manual-check-assisted  
Safe: conditional

Setup:
- Open or create a draft that returns address validation summary

Actions:
1. Inspect the address validation banner/message
2. Attempt update if override is required

Assertions:
- validation summary renders
- override requirement is enforced before update when necessary

Cleanup:
- none

## Upsell Cases

### UPSELL-001 Upsell suggestions

Type: automated  
Safe: conditional

Setup:
- Select a customer with prior purchase history
- Open `Cart`

Actions:
1. Expand upsell panel
2. Add one upsell suggestion

Assertions:
- suggestions exclude items already in cart
- only in-stock suggestions appear
- one-click add works
- added item disappears from visible upsell suggestions

Cleanup:
- remove upsell item if next case requires clean cart

### UPSELL-002 Replenishment / low-supply callouts

Type: manual-check-assisted  
Safe: yes

Setup:
- Use a customer with prior consumable purchases
- Expand upsell panel

Actions:
1. Inspect suggestion metadata and callouts

Assertions:
- low-supply/replenishment callouts appear when supported by the data
- callouts are based on elapsed time and servings logic, not random text

Cleanup:
- none

## UI and Technical Cases

### UI-001 Button styling consistency

Type: automated  
Safe: yes

Setup:
- Navigate through `Customer`, `Orders`, and `Cart`

Actions:
1. Hover primary and secondary buttons across modules

Assertions:
- hover states are consistent
- dark green hover states keep readable white text
- invoice buttons match each other stylistically

Cleanup:
- none

### TECH-001 Console sanity

Type: automated  
Safe: yes

Setup:
- Exercise the app through search, order open, and cart actions

Actions:
1. Inspect console output

Assertions:
- no blocking runtime errors from `Swanson Shopify Assistant`
- issues from other apps are noted separately and not misattributed

Cleanup:
- none

## Backend Audit Cases

### AUDIT-001 App-only audit scope

Type: semi-automated  
Safe: yes

Setup:
- Perform actions only inside this app
- Do not interact with AgnoStack during the validation window

Actions:
1. Search customer
2. Select customer
3. Open or update draft
4. Add/remove item

Assertions:
- backend audit contains only actions taken in this app
- AgnoStack activity should not create `Swanson Shopify Assistant` audit records

Cleanup:
- none

### AUDIT-002 Agent identity capture

Type: semi-automated  
Safe: yes

Setup:
- Perform customer/draft actions in the app

Actions:
1. Inspect backend audit records and/or request payloads

Assertions:
- agent ID, name, and email are present in backend audit context
- draft payload includes `agnoStack-metadata.agent_id` when available

Cleanup:
- none

### AUDIT-003 No internal-note audit spam

Type: automated  
Safe: yes

Setup:
- Open app and perform several actions

Actions:
1. Inspect Zendesk internal note composer body

Assertions:
- no automatic audit/session entries are inserted into the internal note
- logging remains backend-only

Cleanup:
- none

### AUDIT-004 Flush behavior

Type: semi-automated  
Safe: yes

Setup:
- Perform several app actions in a short window

Actions:
1. Inspect backend audit storage/results

Assertions:
- entries batch and flush successfully
- duplicate spam is not created for rapid repeats

Cleanup:
- none

## Agent Output Requirements

When Codex CLI runs this runbook, output should include:
- run type used: `Smoke`, `Functional`, or `Exhaustive`
- cases executed
- pass/fail per case
- screenshots captured
- network requests inspected
- any destructive/customer-visible mutations performed
- unresolved blockers or flaky behaviors

## Known Limits

- Shipment ETA and event history appear only when Shopify/carrier data exists.
- Some refund/cancel/hold actions depend on current Shopify order state.
- Large draft orders may still hit Shopify-side performance limits.
- Encoding regressions should always be checked on:
  - chevron controls
  - shipment bullet separators
  - tracking history event lines

## References

- Feature inventory:
  - `docs/swanson-shopify-assistant-features.md`
- Promo and orders behavior:
  - `docs/shopify-assistant-promo-pricing-and-orders.md`
- Deployment guidance:
  - `docs/zendesk-cli-deployment-guidelines.md`

