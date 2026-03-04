param(
  [string]$FunctionName = "zendesk-shopify-lookup",
  [string]$Region = "us-east-1",
  [string]$CustomerEmail = "kevin.wolf@swansonhealth.com",
  [string]$Sku = "SWA030",
  [string]$OutDir = "C:\Users\kevin.wolf\ZendeskApps\docs\regression-artifacts"
)

$ErrorActionPreference = "Stop"
$aws = "C:\Users\kevin.wolf\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe"

if (-not (Test-Path $aws)) {
  throw "AWS CLI not found at $aws"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Invoke-LambdaEvent {
  param(
    [string]$Name,
    [hashtable]$Event
  )
  $id = [Guid]::NewGuid().ToString("N")
  $inFile = Join-Path $env:TEMP ("shopify_reg_in_{0}.json" -f $id)
  $outFile = Join-Path $env:TEMP ("shopify_reg_out_{0}.json" -f $id)
  ($Event | ConvertTo-Json -Depth 20 -Compress) | Set-Content -Path $inFile -Encoding ascii
  & $aws lambda invoke `
    --function-name $FunctionName `
    --region $Region `
    --cli-binary-format raw-in-base64-out `
    --payload ("file://" + $inFile) `
    $outFile | Out-Null
  $raw = Get-Content -Raw $outFile
  try {
    return ($raw | ConvertFrom-Json)
  } catch {
    return [pscustomobject]@{
      statusCode = 500
      body = "{`"error`":`"invalid_json_response`"}"
    }
  }
}

function Parse-Body {
  param([string]$Body)
  try { return $Body | ConvertFrom-Json } catch { return $null }
}

$results = @()

# 1) Customer search
$searchResp = Invoke-LambdaEvent -Name "search" -Event @{
  httpMethod = "GET"
  path = "/search"
  queryStringParameters = @{
    email = $CustomerEmail
    limit = "5"
  }
}
$searchBody = Parse-Body $searchResp.body
$searchPass = ($searchResp.statusCode -eq 200 -and $searchBody -and ($searchBody.count -ge 1))
$customerGid = $null
if ($searchBody -and $searchBody.customers -and $searchBody.customers.Count -gt 0) {
  $customerGid = $searchBody.customers[0].gid
}
$results += [pscustomobject]@{
  Case = "Customer search by email"
  StatusCode = $searchResp.statusCode
  Pass = $searchPass
  Detail = if ($searchPass) { "Found $($searchBody.count) customer(s)." } else { "Search did not return expected customer." }
}

# 2) SKU lookup
$skuResp = Invoke-LambdaEvent -Name "sku_lookup" -Event @{
  httpMethod = "GET"
  path = "/sku_lookup"
  queryStringParameters = @{
    sku = $Sku
    limit = "5"
  }
}
$skuBody = Parse-Body $skuResp.body
$skuPass = ($skuResp.statusCode -eq 200 -and $skuBody -and ($skuBody.count -ge 1))
$results += [pscustomobject]@{
  Case = "SKU lookup ($Sku)"
  StatusCode = $skuResp.statusCode
  Pass = $skuPass
  Detail = if ($skuPass) { "Found $($skuBody.count) SKU match(es)." } else { "SKU lookup failed or no results." }
}

if ($customerGid) {
  # 3) Customer profile
  $profileResp = Invoke-LambdaEvent -Name "customer_profile" -Event @{
    httpMethod = "GET"
    path = "/customer_profile"
    queryStringParameters = @{
      customer_id = $customerGid
    }
  }
  $profileBody = Parse-Body $profileResp.body
  $hasConsentFields = $false
  if ($profileBody -and $profileBody.profile) {
    $hasConsentFields = ($null -ne $profileBody.profile.email_marketing_state) -and ($null -ne $profileBody.profile.sms_marketing_state) -and ($null -ne $profileBody.profile.accepts_marketing)
  }
  $profilePass = ($profileResp.statusCode -eq 200 -and $hasConsentFields)
  $results += [pscustomobject]@{
    Case = "Customer profile consent fields"
    StatusCode = $profileResp.statusCode
    Pass = $profilePass
    Detail = if ($profilePass) { "Consent fields present for $customerGid." } else { "Consent fields missing or profile call failed." }
  }

  # 4) Customer orders
  $ordersResp = Invoke-LambdaEvent -Name "customer_orders" -Event @{
    httpMethod = "GET"
    path = "/customer_orders"
    queryStringParameters = @{
      customer_id = $customerGid
    }
  }
  $ordersBody = Parse-Body $ordersResp.body
  $ordersPass = ($ordersResp.statusCode -eq 200 -and $ordersBody -and ($null -ne $ordersBody.orders))
  $results += [pscustomobject]@{
    Case = "Customer orders payload"
    StatusCode = $ordersResp.statusCode
    Pass = $ordersPass
    Detail = if ($ordersPass) { "Orders payload returned." } else { "Orders payload missing or call failed." }
  }

  # 5) Customer addresses
  $addrResp = Invoke-LambdaEvent -Name "customer_addresses" -Event @{
    httpMethod = "GET"
    path = "/customer_addresses"
    queryStringParameters = @{
      customer_id = $customerGid
    }
  }
  $addrBody = Parse-Body $addrResp.body
  $addrPass = ($addrResp.statusCode -eq 200 -and $addrBody -and ($null -ne $addrBody.addresses))
  $results += [pscustomobject]@{
    Case = "Customer addresses payload"
    StatusCode = $addrResp.statusCode
    Pass = $addrPass
    Detail = if ($addrPass) { "Addresses payload returned." } else { "Addresses payload missing or call failed." }
  }
} else {
  $results += [pscustomobject]@{
    Case = "Customer-dependent checks"
    StatusCode = 0
    Pass = $false
    Detail = "Skipped profile/orders/addresses because customer search returned no gid."
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $OutDir ("shopify-assistant-regression-{0}.md" -f $stamp)
$passCount = ($results | Where-Object { $_.Pass }).Count
$totalCount = $results.Count

$lines = @()
$lines += "# Swanson Shopify Assistant Regression Report"
$lines += ""
$lines += "- Executed: $(Get-Date -Format o)"
$lines += "- Lambda: $FunctionName"
$lines += "- Region: $Region"
$lines += "- Customer email seed: $CustomerEmail"
$lines += "- SKU seed: $Sku"
$lines += "- Result: **$passCount/$totalCount passed**"
$lines += ""
$lines += "## Results"
$lines += ""
foreach ($r in $results) {
  $status = if ($r.Pass) { "PASS" } else { "FAIL" }
  $lines += "- **$status** | $($r.Case) | HTTP $($r.StatusCode) | $($r.Detail)"
}
$lines += ""
$lines += "## Embedded Zendesk App Checks (Manual)"
$lines += ""
$lines += "Run the embedded checks from:"
$lines += "- docs/swanson-shopify-assistant-regression-testing.md"
$lines += ""
$lines += "Minimum embedded checks after backend pass:"
$lines += "- App boot with Customer, Orders, Cart visible"
$lines += "- Customer search and profile rendering"
$lines += "- Orders list render and New Order navigation regression"
$lines += "- Reorder Items / Open Draft cart hydration"
$lines += "- No blocking app-specific console errors"

$lines -join "`r`n" | Set-Content -Path $reportPath -Encoding utf8

Write-Output "Regression complete: $passCount/$totalCount passed"
Write-Output "Report: $reportPath"
if ($passCount -ne $totalCount) {
  exit 1
}
