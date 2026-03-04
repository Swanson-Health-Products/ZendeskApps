# Swanson Shopify Assistant Regression Report

- Executed: 2026-03-04T14:56:40.3475919-07:00
- Lambda: zendesk-shopify-lookup
- Region: us-east-1
- Customer email seed: kevin.wolf@swansonhealth.com
- SKU seed: SWA030
- Result: **5/5 passed**

## Results

- **PASS** | Customer search by email | HTTP 200 | Found 1 customer(s).
- **PASS** | SKU lookup (SWA030) | HTTP 200 | Found 1 SKU match(es).
- **PASS** | Customer profile consent fields | HTTP 200 | Consent fields present for gid://shopify/Customer/8719271297162.
- **PASS** | Customer orders payload | HTTP 200 | Orders payload returned.
- **PASS** | Customer addresses payload | HTTP 200 | Addresses payload returned.

## Embedded Zendesk App Checks (Manual)

Run the embedded checks from:
- docs/swanson-shopify-assistant-regression-testing.md

Minimum embedded checks after backend pass:
- App boot with Customer, Orders, Cart visible
- Customer search and profile rendering
- Orders list render and New Order navigation regression
- Reorder Items / Open Draft cart hydration
- No blocking app-specific console errors
