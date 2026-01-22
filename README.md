# Zendesk Integrations

This repo contains Zendesk private apps and supporting AWS Lambdas used by Swanson Health Products.

## High-level Overview

These apps are intentionally built to improve agent speed and consistency inside Zendesk without expanding Zendesk’s trusted surface area:

- Zendesk apps are thin UIs that call approved endpoints and present results in the ticket sidebar.
- Sensitive credentials stay out of the browser and out of the repo (stored in AWS Secrets Manager or Zendesk secure settings).
- External systems (Shopify, CXone) are accessed via small, purpose-built bridges so changes are isolated and auditable.

## Intent & Rationale

- **Agent-first workflow**: optimize for “one ticket at a time” work; fast lookups, minimal clicks, copy-friendly outputs.
- **Least privilege**: only the minimum permissions needed to serve the lookup use case.
- **Keep secrets server-side**: Shopify Admin tokens never ship to the browser; Lambdas fetch secrets at runtime.
- **Predictable operations**: small deploy units (app folders + Lambda folders) reduce blast radius and make rollbacks easy.

## Structure

- `apps/cxone-lookup-app/` - CXone caller/requester lookup app (Zendesk private app)
- `apps/promo-lookup-app/` - Promo/source offer lookup app (Zendesk private app)
- `apps/shopify-lookup-app/` - Shopify customer lookup app (Zendesk private app)
- `lambda/cxone-bridge/` - AWS Lambda bridge for CXone active-call lookups
- `lambda/shopify-lookup/` - AWS Lambda that queries Shopify Admin API (via GraphQL) for customer lookup

## Notes

- Apps are deployed to Zendesk via `zcli` from each app folder (`zcli apps:update` or `zcli apps:package` + upload).
- Lambda deployments are performed via AWS (CLI or Console). `lambda/shopify-lookup/` requires bundling dependencies (AWS SDK v3 client) with the deployment artifact.
- Do not commit credentials. Zendesk app settings (API base URLs, API keys) are configured in Zendesk Admin. Shopify tokens should be stored in AWS Secrets Manager and read by the Lambda at runtime.
