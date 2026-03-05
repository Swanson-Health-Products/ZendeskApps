# Zendesk In-App Benchmark (Swanson App vs Agnostack)

Date: 2026-03-05
Environment: Zendesk ticket page (`/agent/tickets/new/1`), requester `kevin.wolf@swansonhealth.com`
Timezone in log: Central (`-07:00` recorded from host clock offset)

## Scenario
- Build a draft order with 15 unique SKUs in-app.
- Apply promo code `SWNMANIA`.
- Create draft order and capture timing checkpoints.

## Swanson Shopify Assistant (App 1212333)
- SKUs added (15):
  - CNT011, CNT251, CNT162, CNT168, CNT170, CNT008, CNT238, CNT207, BAR111, BAR106, CNT007, CNT271, CNT091, CNT285, ALG003
- Promo input: `SWNMANIA`
- Draft result: `#D35410`
- Invoice: `https://www.swansonvitamins.com/69381390474/invoices/1ebd4865065f0f240d3410a00d7f45b3`
- Promo status shown by app: `Promo SWNMANIA was sent, but no discount was returned for current items.`

### Timings
- First add start: `2026-03-05 13:55:41 -07:00`
- Draft create start: `2026-03-05 14:02:41 -07:00`
- Draft create done: `2026-03-05 14:03:01 -07:00`
- Total (first add -> draft created): **440s**
- Create call only: **20s**

## Agnostack (Shopify Premium for Zendesk, app 867416)
- App iframe is now automatable in-ticket (controls exposed in current session).
- Comparable in-app run completed for active draft `#D35424` with 6 SKUs:
  - SWA030 (qty 2), CNT011, CNT251, CNT162, CNT168, CNT170
- Promo input: `SWNMANIA`
- Promo result in-app:
  - `Discount (Line Item): SWNMANIA -$26.89`
  - Subtotal shown after promo: `$81.94`

### Timings (captured in current run)
- Run start: `2026-03-05 14:14:12 -07:00`
- First add start: `2026-03-05 14:14:34 -07:00`
- Last add done in this comparable sample: `2026-03-05 13:20:39 -07:00`
- Promo applied: `2026-03-05 13:21:13 -07:00`

### Notes
- I was able to execute the Agnostack workflow directly inside the Zendesk ticket app (no external tab).
- This sample is a validated in-app comparison for add-flow + promo behavior, but it is not a full 15-SKU Agnostack run yet.

## Artifacts
- Raw event log: `docs/benchmark-live-log-20260305.txt`
- This summary: `docs/benchmark-zendesk-app-vs-agnostack-20260305.md`
