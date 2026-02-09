# CXone Plugin Exhaustive Notes

Date: 2026-02-09
Scope: `apps/cxone-lookup-app` + `lambda/cxone-bridge`

## 1. Executive Summary

The CXone integration consists of a Zendesk private app (sidebar + background locations) and an AWS Lambda bridge that returns the active caller ANI for the current agent. The design is lightweight and operationally simple, but there are material security and reliability gaps around credential handling, logging, and matching behavior.

## 2. Current Architecture

Components:
- Zendesk app sidebar UI: `apps/cxone-lookup-app/assets/iframe.html`
- Zendesk app background worker: `apps/cxone-lookup-app/assets/background.html`
- Zendesk app config: `apps/cxone-lookup-app/manifest.json`
- AWS Lambda bridge: `lambda/cxone-bridge/index.js`

Primary data flow:
1. App initializes in Zendesk and reads settings/agent context.
2. App polls bridge endpoint for active call info.
3. Bridge queries CXone for current active call by agent.
4. App searches Zendesk users by phone.
5. App sets `ticket.requester` if empty.
6. App optionally sets CXone contact id in custom field `ticket.customField:48798728820115` when empty.

Polling behavior:
- Fast poll: 2s.
- Slow poll: 20s after ticket age exceeds 5 minutes.

## 3. Live AWS Lambda Parity Check

Function:
- Name: `cxone-bridge`
- Region: `us-east-1`
- Runtime: `nodejs18.x`
- LastModified: `2026-01-08T22:24:29.000+0000`
- Handler: `index.handler`

Artifact parity:
- Deployed Lambda `CodeSha256`: `mLNtw8XbKvpeeS0w3nkw16d/wg65P9Cz88Ut/4bCTPc=`
- Local `lambda/cxone-bridge/cxone-bridge.zip` SHA-256 (base64): `mLNtw8XbKvpeeS0w3nkw16d/wg65P9Cz88Ut/4bCTPc=`
- Conclusion: local packaged zip matches deployed `$LATEST` artifact hash.

## 4. Priority Findings

### P0 (High)

1. API key and identity data in URL query string.
- App appends `username` and `api_key` query params:
  - `apps/cxone-lookup-app/assets/background.html:63`
  - `apps/cxone-lookup-app/assets/iframe.html:170`
- Bridge accepts query param key:
  - `lambda/cxone-bridge/index.js:151`
- Risk: query strings leak in logs, browser history, proxy caches, and monitoring tooling.

2. Public non-secure key fallback exists.
- Manifest defines `bridgeApiKeyPublic` with `secure: false`:
  - `apps/cxone-lookup-app/manifest.json:52`
- App uses public fallback:
  - `apps/cxone-lookup-app/assets/background.html:39`
  - `apps/cxone-lookup-app/assets/iframe.html:115`
- Risk: protected bridge key is exposed in client runtime.

3. Bridge can be effectively unauthenticated if env key is absent.
- Auth enforcement is conditional on truthy `API_KEY`:
  - `lambda/cxone-bridge/index.js:11`
  - `lambda/cxone-bridge/index.js:143`
- Risk: misconfiguration leads to open endpoint.

### P1 (Medium)

4. Agent resolution is ambiguous.
- Bridge queries agents by `searchString` and takes first result:
  - `lambda/cxone-bridge/index.js:66`
  - `lambda/cxone-bridge/index.js:72`
- Risk: wrong agent selected when multiple matches exist.

5. Answered-call detection has false-positive edge.
- `stateRaw.includes("active")` also matches `inactive`:
  - `lambda/cxone-bridge/index.js:109`
- Risk: stale/non-active calls treated as active.

6. Sidebar repeated work on unchanged ANI.
- Sidebar lacks unchanged-number guard:
  - `apps/cxone-lookup-app/assets/iframe.html:179`
- Risk: redundant Zendesk searches and repeated set attempts.

7. Missing email still allows recurring failing polls.
- App can call bridge without usable `username`:
  - `apps/cxone-lookup-app/assets/background.html:64`
  - `apps/cxone-lookup-app/assets/iframe.html:171`
- Bridge returns 400 when username missing:
  - `lambda/cxone-bridge/index.js:157`
- Risk: avoidable request noise.

### P2 (Low)

8. PII logging in app and bridge.
- App logs include user email, URL, phone lookup context:
  - `apps/cxone-lookup-app/assets/background.html:12`
  - `apps/cxone-lookup-app/assets/background.html:30`
  - `apps/cxone-lookup-app/assets/background.html:156`
- Bridge logs username, phone, contactId when enabled:
  - `lambda/cxone-bridge/index.js:161`
  - `lambda/cxone-bridge/index.js:174`
- Risk: sensitive data in logs.

9. Hardcoded custom field id reduces portability.
- Fixed id in both app contexts:
  - `apps/cxone-lookup-app/assets/background.html:242`
  - `apps/cxone-lookup-app/assets/iframe.html:287`
- Risk: breaks across sandbox/prod field-id differences.

10. No explicit outbound timeout in bridge `https` requests.
- `https.request` with no set timeout:
  - `lambda/cxone-bridge/index.js:21`
- Risk: slow/stalled upstream burns Lambda timeout budget.

## 5. Recommended Remediation Plan

### Phase 1 (Security hardening first)

1. Remove query-string `api_key` usage from app and bridge.
2. Use header-only key (`X-API-Key`) if key auth remains.
3. Remove `bridgeApiKeyPublic` parameter and code path.
4. Make bridge auth fail-closed:
   - If bridge is expected to be protected, require `API_KEY` and return 500 on startup misconfig or 401 on missing key.

### Phase 2 (Correctness and reliability)

1. Change agent lookup to exact email/username match before fallback.
2. Fix call-state detection (`active` should not match `inactive`).
3. Add unchanged-ANI guard in sidebar (`latestDigits` early return).
4. Short-circuit polling when `currentUserEmail` is unavailable.
5. Add outbound HTTP timeout + bounded retries for transient CXone failures.

### Phase 3 (Operational quality)

1. Redact/mask PII in logs; keep debug off by default.
2. Move custom field id into manifest setting, validate at init.
3. Add reason metadata for no-result responses (`no_active_call`, `no_phone`) to improve diagnostics.

## 6. Validation Checklist After Fixes

1. Security:
- No key in URL at runtime.
- No public key setting in manifest.
- Bridge rejects unauthorized requests consistently.

2. Functional:
- Correct requester auto-set on active call.
- No requester overwrite when requester already set.
- ContactId custom field set once and not overwritten.

3. Reliability:
- Poll cadence transitions correctly.
- Sidebar/background do not spam duplicate lookups on unchanged ANI.
- Bridge handles temporary CXone failures with bounded retries and timeout.

4. Observability:
- Logs avoid raw email/phone/contactId.
- Failure reasons are diagnosable without exposing sensitive payloads.

## 7. Change Control Notes

- This document records the current state and recommendations only.
- It does not include secret values.
- Existing unrelated local modifications in repo were intentionally not included in this notes change.
