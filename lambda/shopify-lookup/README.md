## Request

`GET /search?first_name=...&last_name=...&email=...&phone=...&query=...&limit=...`
`GET /customer_addresses?customer_id=...`
`GET /sku_lookup?sku=...&limit=...`
`POST /draft_order`
`POST /draft_order_update`
`GET /draft_order_get?draft_order_id=...`
`POST /order_cancel`
`POST /order_refund`
`POST /audit_log`

`/draft_order` and `/draft_order_update` accept `promo_code` (e.g., SAVE50) to apply a Shopify discount code.

## Response

Returns `{ count, customers, query }` for `/search`.
Returns `{ customer, defaultAddress, addresses }` for `/customer_addresses`.
Returns `{ count, variants }` for `/sku_lookup`.
Returns `{ draft_order, invoice_url }` for `/draft_order`.
Returns `{ draft_order, invoice_url }` for `/draft_order_update`.
Returns `{ draft_order }` for `/draft_order_get`.
Returns `{ ok, job }` for `/order_cancel`.
Returns `{ ok, refund }` for `/order_refund`.
Returns `{ ok, stored, mode }` for `/audit_log`.
`/order_refund` accepts optional `line_items` array: `{ line_item_id, quantity }` for item-level refunds.

`/audit_log` accepts:
- `reason`: string
- `ticket_id`: string
- `actor`: `{ id, name, email }`
- `events`: `[{ at, at_central, type, detail }]`

Audit storage behavior:
- If `AUDIT_LOG_TABLE` is set, audit rows are persisted to DynamoDB via `batchWrite`.
- If `AUDIT_LOG_TABLE` is not set, events are written to CloudWatch logs (`AUDIT_EVENTS`).

Environment variables for audit logging:
- `AUDIT_LOG_TABLE` (optional): DynamoDB table name for audit events.
- `AUDIT_LOG_TTL_DAYS` (optional, default `90`): TTL window for persisted audit items.

Environment variables for Shopify API versioning:
- `SHOPIFY_API_VERSION` (recommended): explicit Admin GraphQL version (for example, `2026-01`).
- If not set, Lambda defaults to `2026-01`.
