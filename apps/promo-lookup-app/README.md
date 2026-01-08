## Source Offer Lookup (Zendesk Support)

Ticket sidebar app that lets agents enter a source code and returns the promo and offer codes using the public Cloudflare Worker endpoints.

### Quick start
1. Install deps: none (static app).
2. Run locally:
   ```
   zcli apps:server .
   ```
   Then open a ticket with `?zcli_apps=true`.
3. Validate/package/deploy:
   ```
   zcli apps:validate .
   zcli apps:package .
   zcli apps:create .   # first install
   # zcli apps:update . # subsequent updates
   ```

### Notes
- Uses `assets/iframe.html` as the entrypoint for `ticket_sidebar`.
- Fetches from `https://shopify-app-react-cf-dev.swansonvitamins.workers.dev/api/source-code-map` and `https://shopify-app-react-cf-dev.swansonvitamins.workers.dev/api/source-promo-map`.
- No auth required; if CORS ever blocks direct calls, proxy through a backend.
