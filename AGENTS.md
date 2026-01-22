# Repository Guidelines

## Intentionality (Why this exists)

This repo is structured around a few deliberate choices:

- **Agent experience first**: sidebar tools that reduce context switching and support the “one ticket at a time” workflow.
- **Small, composable integrations**: each app/Lambda has a narrow responsibility so changes are isolated and easier to test.
- **Secrets stay out of the browser and git**: tokens/keys live in Zendesk secure settings and/or AWS Secrets Manager.
- **Least privilege by default**: IAM roles and API keys should only grant what each integration needs.

## Project Structure & Module Organization

- `apps/cxone-lookup-app/` — Zendesk private app that polls CXOne and sets the ticket requester.
- `apps/promo-lookup-app/` — Zendesk private app for promo/source offer lookup.
- `apps/shopify-lookup-app/` — Zendesk private app for searching Shopify customers (name/email/phone/Swanson ID).
- `lambda/cxone-bridge/` — AWS Lambda bridge used by the CXOne app (`index.js`).
- `lambda/shopify-lookup/` — AWS Lambda backing the Shopify lookup app (API Gateway + API key recommended).
- App assets live under each app’s `assets/` folder; localization strings live in `translations/`.

## Build, Test, and Development Commands

This repo does not include a unified build system. Use app- or Lambda-specific tools:

- Zendesk apps (run locally): `zcli apps:server` from within an app folder.
- Package a Zendesk app: `zcli apps:package` from the app folder (produces a ZIP in `tmp/`).
- Lambda deploy: zip the contents of a Lambda folder and update the AWS Lambda code (AWS Console or CLI).
  - `lambda/shopify-lookup/` needs dependencies bundled (for example, install and zip `node_modules/` + `index.js`).

## Coding Style & Naming Conventions

- Use 2-space indentation for JSON and HTML in apps.
- Use 2-space indentation for JavaScript in the Zendesk apps and Lambda.
- Keep file and folder names lowercase with hyphens (e.g., `cxone-lookup-app`).
- Prefer descriptive function names (e.g., `getActiveCall`, `findRequesterByPhone`).

## Testing Guidelines

There is no test harness in this repository. Validate changes via:

- Zendesk app behavior in Agent Workspace (ticket sidebar + new ticket).
- Lambda responses via API Gateway (expects `200` with JSON body, or `4xx/5xx` on error).

## Commit & Pull Request Guidelines

- Use short, imperative commit messages (e.g., `Fix requester guard logic`, `Add API key support`).
- PRs should include: summary of changes, deployment impact (Zendesk app/Lambda), and any manual test notes.
- Attach screenshots only if UI changes are visible in the agent workspace.

## Security & Configuration Tips

- Do **not** commit credentials.
- Zendesk app settings (API base URL, API key, bridge URL, etc.) are configured in the Zendesk admin UI.
- For Shopify: store the Admin API token in AWS Secrets Manager and grant the Lambda permission to read it.

## Architecture Notes (High level)

- **Zendesk → API Gateway/Lambda**: when calling external services that require privileged credentials, prefer a Lambda behind API Gateway.
- **API keys**: use API Gateway API keys for simple request authentication; rotate periodically.
- **Browser constraints**: Zendesk apps often call through the Zendesk Apps Proxy; keep endpoints and headers compatible and CORS-friendly.