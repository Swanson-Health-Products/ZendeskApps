# Zendesk Integrations

This repo contains the Zendesk private apps and the CXOne bridge Lambda used by Swanson Health Products.

## Structure

- `apps/cxone-lookup-app/` - CXOne requester lookup app (Zendesk private app)
- `apps/promo-lookup-app/` - Promo/source offer lookup app (Zendesk private app)
- `lambda/cxone-bridge/` - AWS Lambda bridge for CXOne active-call lookups

## Notes

- Apps are deployed to Zendesk via ZIP packages from each app folder.
- Lambda deployment bundles the contents of `lambda/cxone-bridge/`.
- Secrets are provided via environment variables in AWS (not stored in this repo).
