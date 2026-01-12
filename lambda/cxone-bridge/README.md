# CXOne Bridge Lambda

AWS Lambda bridge used by the CXOne Zendesk app to look up the active call (ANI) for an agent.

## API

Request:
- Method: GET
- Query parameters:
  - username (required): agent email/username
  - api_key (optional): only required if API_KEY is set
- Headers:
  - x-api-key (optional): only required if API_KEY is set

Responses:
- 200 OK: { "phone": "<digits>", "contactId": "<id>" }
- 204 No Content: no active call or no phone number found
- 400 Bad Request: username is missing
- 401 Unauthorized: API key missing or invalid
- 500 Internal Server Error: upstream or unexpected error

## Environment Variables

Required:
- NIC_ACCESS_KEY_ID
- NIC_ACCESS_KEY_SECRET

Optional:
- NIC_REGION (default: na1)
- NIC_API_VER (default: v27.0)
- API_KEY (enables simple API key auth via header or query string)
- LOG_REQUESTS ("true" to log request and response details)

## Behavior Notes

- Uses a cached NICE token per warm Lambda container to reduce auth calls.
- Returns 204 if no answered call is found or if a phone number cannot be extracted.
- When LOG_REQUESTS is true, phone numbers and contact IDs are logged; treat logs as sensitive.

## Deploy

Zip the contents of `lambda/cxone-bridge/` and update the Lambda code via AWS Console or CLI.
