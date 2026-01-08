# CXone Caller Lookup & Bridge

Zendesk ticket sidebar app plus a CXone bridge (AWS Lambda) that pulls the caller ANI and sets the ticket requester automatically.

## What’s deployed
- **Zendesk app** (app_id `1202002`), installed as a private app.
- **Bridge URL**: `https://dt3u9hxf9e.execute-api.us-east-1.amazonaws.com/prod/call`
  - Query: `username=<agent email>` (app adds this automatically from `currentUser.email`).
  - Returns `200 { phone, contactId }` when an answered call is found; otherwise `204`.

## How the app works
- **Background location**: polls `bridgeUrl` every 5s (adds `username=<agent email>`), looks up the user by phone, and pushes `ticket.requester` into all open ticket sidebars (new + existing) via the instances API. Works even if the panel isn’t opened.
- **Ticket sidebar UI**: still shows status/result and will also set requester on match (same lookup logic).
- **Requester safety**: both background and sidebar only set the requester if none is present (checks for existing `ticket.requester.id` or `.email`), and re-check right before setting to avoid races on unsaved tickets.
- **Race guard for new tickets**: both background and sidebar re-check the requester immediately before setting to avoid overwriting an agent selection on unsaved tickets.

## Lambda bridge details (cxone-bridge, us-east-1)
- Env vars: `NIC_ACCESS_KEY_ID`, `NIC_ACCESS_KEY_SECRET`, `NIC_REGION=na1`, `NIC_API_VER=v27.0`, `LOG_REQUESTS=true`.
- Flow: token → agent lookup `agents?searchString=<username>` → `contacts/active?agentId=...` → filter calls.
- **Answered-only filter** (must meet any of):
  - `stateName` contains “active”
  - `contactStateCategory` contains “with agent”
  - `stateId === 4`
  If none match, the bridge returns 204 (no ANI).
- ANI extraction fields (first with 7+ digits wins): `ani`, `aniValue`, `contactPoint`, `fromAddress`, `toAddress`, `fromNumber`, `phoneNumber`, `dialedNumber`.

## Files
- App: `assets/iframe.html` (UI), `assets/background.html` (background poller), `manifest.json`, `translations/en.json`.
- Bridge source: `C:\Users\kevin.wolf\cxone-bridge-code\index.js`.
- Local polling helper: `poll-active.js` (uses `RCcreds.txt` for CXone access keys).

## Update the app
From `.../ZendeskApps/cxone-lookup-app`:
1) `zcli apps:validate .`
2) `zcli apps:package .`
3) `zcli apps:update . --app-id 1202002`

## Update the Lambda
From `cxone-bridge-code`:
1) `Compress-Archive -Force -Path * -DestinationPath C:\Users\kevin.wolf\cxone-bridge-update.zip`
2) `aws lambda update-function-code --function-name cxone-bridge --zip-file fileb://cxone-bridge-update.zip`

## Troubleshooting
- Bridge returns 204: no call matching answered criteria yet (stateName/Category/stateId). Wait for answer or check CXone state values.
- Username missing: ensure Zendesk agent email matches CXone; the app appends `username` automatically.
- Inspect raw active calls: `node poll-active.js` (will print RAW PHONE CALL blocks); use fields like `contactStateCategory`, `stateName`, `stateId` to refine filters if needed.
- Background not setting requester: confirm the app is installed in Support and the agent has open ticket tabs; background pushes to all open ticket/new-ticket sidebars.
