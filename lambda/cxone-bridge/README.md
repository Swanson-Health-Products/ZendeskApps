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

## How It Works

1) Validate API key (if configured).
2) Fetch a NICE access token and cache it in memory for warm invocations.
3) Look up the agent by username/email to get the agentId.
4) Query active contacts for the agent and select the most recent answered call.
5) Extract a phone number from the contact and return it (or 204 if none).

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

## API Gateway

- HTTP API name: cxone-bridge-api
- API ID: dt3u9hxf9e
- Stages: prod, $default
- Access logs: /aws/apigateway/cxone-bridge-api

## Monitoring

- Lambda metrics: Invocations, Errors, Throttles, Duration in CloudWatch.
- API Gateway access logs (HTTP API): status codes and request details.
  - Log group: /aws/apigateway/cxone-bridge-api

## Example

curl "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod?username=agent@example.com" \
  -H "x-api-key: <api-key>"

## Troubleshooting

- Getting 401: API_KEY is set and your request is missing or has a bad key.
- Getting 204 with active calls: agent lookup or call state may not be matching; check NICE user and contact state fields.
- Getting 500: verify NIC credentials and region/version; check CloudWatch logs for the error message.
- Need 200 vs 204 counts: query the access log group and filter by status.

## Deploy

Zip the contents of `lambda/cxone-bridge/` and update the Lambda code via AWS Console or CLI.
