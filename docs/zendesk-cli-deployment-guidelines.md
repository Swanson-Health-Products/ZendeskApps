# Zendesk CLI Deployment Guidelines

This document captures the current deployment flow for Zendesk private apps in this repo.

## Scope
- Repo: `ZendeskApps`
- Primary app in this workflow: `apps/swanson-shopify-assistant`
- Zendesk account: `swansonhealthproducts`

## Standard Deploy Flow
Run from the app folder:

```powershell
cd C:\Users\kevin.wolf\ZendeskApps\apps\swanson-shopify-assistant
npx @zendesk/zcli apps:validate .
npx @zendesk/zcli apps:package .
```

Deploy:

```powershell
# existing private app (uses app_id from zcli.apps.config.json)
npx @zendesk/zcli apps:update .

# first-time install
npx @zendesk/zcli apps:create .
```

`zcli.apps.config.json` example:

```json
{"app_id":1212333}
```

## Auth Options
Use one of these:

1. Interactive profile login
```powershell
npx @zendesk/zcli login -i
```

2. Environment variables (non-interactive)
```powershell
$env:ZENDESK_SUBDOMAIN='swansonhealthproducts'
$env:ZENDESK_EMAIL='<agent_email>'
$env:ZENDESK_API_TOKEN='<api_token>'
```

## Known App IDs
- `swanson-shopify-assistant`: `1212333` (confirmed in Zendesk Admin API)
- `shopify-lookup-app`: `1207112` (legacy app)

Always verify the installed app id before update.

## Verification Checklist
- `apps:validate` passes
- `apps:package` produces zip under `tmp/`
- `apps:update` returns success
- App renders in ticket sidebar and new ticket sidebar
- API settings still configured in Zendesk Admin (base URL, API key)

## Fallback: Manual Upload
If CLI deploy is blocked:
1. Build package zip from app root contents (`manifest.json`, `assets/`, `translations/`).
2. Admin Center -> Apps and integrations -> Zendesk Support apps.
3. Open the installed private app and upload new version.

## Common Failures
- `zcli` not found: invoke with `npx @zendesk/zcli`.
- Auth/profile missing: run `login -i` or set `ZENDESK_*` env vars.
- API token errors: verify token validity and role permissions.
- CLI runtime issues: retry with Node 22 LTS if Node 24 causes native/assertion errors.
- `Unexpected token '﻿' ... is not valid JSON`: `manifest.json` contains UTF-8 BOM; rewrite file as UTF-8 without BOM.
- `invalid byte sequence in UTF-8`: one or more text files in the package are not UTF-8 encoded; convert them before upload.

## Session Notes (2026-02-27)
- `npx @zendesk/zcli` works, but Node 24 can crash on Windows during `apps:validate` with:
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c line 76`.
- Workaround command pattern:
  `npx --yes --package=node@22 --package=@zendesk/zcli zcli <command>`.
- `swanson-shopify-assistant` deployment confirmed to app `1212333`.
- Live app version after deployment: `0.2.7` (`app.updated_at` `2026-02-27T20:00:41Z`).

## Security
- Never commit API tokens, profile exports, or local token files.
- Keep secrets in secure local storage or Zendesk credential store.
