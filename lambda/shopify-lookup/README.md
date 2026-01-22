# Shopify Lookup Lambda

This Lambda proxies Shopify customer search for the Zendesk Shopify Customer Lookup app.

## Environment

- `SHOPIFY_STORE` (required) - Shopify store subdomain
- `SHOPIFY_API_VERSION` (default: 2024-10)
- `SHOPIFY_TOKEN_SECRET_ARN` (required) - Secrets Manager ARN with Admin API token
- `MAX_RESULTS` (default: 10)

## Request

`GET /search?first_name=...&last_name=...&email=...&phone=...&query=...&limit=...`

## Response

Returns `{ count, customers, query }`.
