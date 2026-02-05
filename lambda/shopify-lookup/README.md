## Request

`GET /search?first_name=...&last_name=...&email=...&phone=...&query=...&limit=...`
`GET /customer_addresses?customer_id=...`
`GET /sku_lookup?sku=...&limit=...`
`POST /draft_order`
`POST /draft_order_update`
`GET /draft_order_get?draft_order_id=...`

`/draft_order` and `/draft_order_update` accept `promo_code` (e.g., SAVE50) to apply a Shopify discount code.

## Response

Returns `{ count, customers, query }` for `/search`.
Returns `{ customer, defaultAddress, addresses }` for `/customer_addresses`.
Returns `{ count, variants }` for `/sku_lookup`.
Returns `{ draft_order, invoice_url }` for `/draft_order`.
Returns `{ draft_order, invoice_url }` for `/draft_order_update`.
Returns `{ draft_order }` for `/draft_order_get`.
