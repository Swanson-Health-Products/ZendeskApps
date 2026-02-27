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
# existing private app
npx @zendesk/zcli apps:update . --app-id <APP_ID>

# first-time install
npx @zendesk/zcli apps:create .
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

## Known App IDs (historical/local references)
- `shopify-lookup-app`: `1207112` (from local `zcli.apps.config.json` in legacy workspace)
- `cxone-lookup-app`: use value from current app README/config

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

## Session Notes (2026-02-27)
- `npx @zendesk/zcli` works, but Node 24 can crash on Windows during `apps:validate` with:
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c line 76`.
- Workaround command pattern:
  `npx --yes --package=node@22 --package=@zendesk/zcli zcli <command>`.
- `apps:update` reached Zendesk API but failed with `App ID not found` for tested IDs (`1207112`, `867416`), so current installed app id for `swanson-shopify-assistant` still needs confirmation in Admin Center.
- Until that app id is confirmed, use manual upload for safe deployment.

## Security
- Never commit API tokens, profile exports, or local token files.
- Keep secrets in secure local storage or Zendesk credential store.
