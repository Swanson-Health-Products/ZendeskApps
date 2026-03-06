# Swanson Shopify Assistant Feature Inventory

Last updated: 2026-03-06
App: `Swanson Shopify Assistant`
Zendesk app ID: `1212333`

This document lists the user-facing features currently implemented in the Zendesk app and its backing Lambda.

## App Surface

- Embedded Zendesk sidebar app for:
  - support tickets
  - new ticket flow
- Three primary modules:
  - `Customer`
  - `Orders`
  - `Cart`
- Shared status messaging and in-app progress states
- Centralized button/theme styling across the app

## Customer Module

- Prefills customer lookup from Zendesk ticket context when data is available
- Customer search by:
  - email
  - phone
  - name
  - Swanson customer ID
- Click-to-select customer search results
- Hover and selected-state styling on customer result rows
- `Clear Customer` action to reset the selected customer without clearing the whole app session
- Customer profile summary display, including:
  - customer ID
  - email
  - phone
  - total orders
  - tags / status context where available
- Shipping address list / address selection
- New customer creation from the app
- Duplicate handling during customer creation:
  - detects existing phone/email conflicts
  - falls back to search for the existing customer

## Orders Module

- Loads both regular orders and draft orders for the selected customer
- Separate sections for:
  - `Draft Orders`
  - `Orders`
- Default visibility behavior:
  - customer orders open by default
  - draft orders collapsed by default
- Expand / collapse controls for order cards
- Order metadata display, including:
  - created date
  - updated date
  - totals
  - payment / fulfillment / fraud pills
- Expanded order details include:
  - line items
  - shipment details
  - fraud analysis
- Fraud text wraps correctly for long messages/signals
- Shipment tracking support:
  - tracking number
  - carrier
  - tracking link
  - latest tracking update
  - expected delivery when Shopify provides ETA data
  - expandable tracking history timeline per shipment
- Order actions:
  - reorder items into cart
  - hold / cancel / refund actions when exposed by backend/UI state
- Draft order actions:
  - open existing draft into cart for editing
  - open invoice
  - copy invoice URL
- Draft conversion polling after invoice actions:
  - polls every 20 seconds
  - detects conversion to completed order
  - provides compact progress/refresh UX

## Cart Module

- Start a new order from the selected customer
- Rehydrate cart from:
  - reorder flow
  - opened draft order
- SKU lookup by exact SKU
- Product/variant search with multi-result display
- Add to order directly from returned search results
- SKU preview/results clear after item is added to the cart
- Per-line-item controls:
  - quantity
  - remove line
  - inline manual price override
  - reset overridden price back to catalog price
- Manual price override UI features:
  - click price to edit
  - inline save / cancel
  - manual-price indicator
  - catalog-price comparison
- Local subtotal / tax / total recalculation in the UI
- Draft order create
- Draft order update
- Open draft for further editing
- Invoice URL handling:
  - open invoice button
  - copy URL button
- Loading / progress states for:
  - draft create/update
  - draft open
  - invoice conversion polling

## Promotions and Pricing

- Manual promo code entry
- Source code to promo code conversion path
- Cloudflare-backed promo/source lookup integration with fault-tolerant fallback to normal promo behavior
- UI messaging when a source code converts to a promo code
- Promo application feedback after draft create/update
- BOGO-aware handling for eligible items/promos
- Existing draft discount hydration for display in cart
- Per-line-item discounted display logic when returned by draft data
- Manual line price overrides persist through Shopify draft order create/update

## Shipping and Address Handling

- Select shipping address from customer addresses
- Shipping line input support:
  - shipping speed/title
  - shipping cost
  - free shipping toggle
- Restricted shipping guard based on item/state rules
- Blocks draft submission when restricted items conflict with the selected shipping state
- Address validation state display when returned from Shopify draft data
- Shipping preview area with improved wrapping/overflow handling

## Upsell and Replenishment Features

- Upsell section inside Cart
- Builds upsell suggestions from prior customer purchase history
- Filters out items already in the current cart
- Filters to in-stock items
- One-click add from upsell suggestions
- Low-supply / replenishment callout logic based on:
  - servings per container
  - elapsed time since prior purchase
  - low-supply windows

## Audit and Agent Context

- Captures Zendesk agent context for backend audit logging:
  - Zendesk user ID
  - agent name
  - agent email
- Sends audit events only for actions taken inside this app
- Backend audit log batching / flush behavior
- Adds `agnoStack-metadata.agent_id` to draft create/update metadata when agent ID is available
- Internal note session logging has been removed; logging is backend-only

## UX / Interaction Improvements Currently Implemented

- Modernized visual styling aligned more closely to Swanson brand direction
- Icon-first affordances in several places instead of verbose text labels
- Consistent hover treatment across primary and secondary buttons
- White-text hover contrast on dark green buttons
- Orders can be expanded/collapsed to reduce scrolling
- Draft orders and shipment history can be collapsed independently
- Customer search results and cards use improved spacing and readability
- Draft/order progress states include visible in-progress feedback

## Backend / Integration Notes

- Shopify Admin API usage is GraphQL-based
- Lambda-backed API handles:
  - customer search
  - order/draft retrieval
  - SKU lookup
  - draft create/update
  - promo/source resolution
  - audit ingestion
- Idempotency keys are used for draft mutations
- Draft mutation behavior supports agent metadata and price overrides

## Known Constraints

- Shipment ETA and event history only appear when Shopify/carrier data is available
- Large/complex draft orders can still experience Shopify-side performance limits
- Some order actions depend on the data Shopify returns for the specific order
