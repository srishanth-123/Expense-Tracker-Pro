# API Test Script for Expense Tracker
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMTUyZmM0MDY1NjRkY2EyY2JlMTJkNCIsImlhdCI6MTc3OTc3MzM5NCwiZXhwIjoxNzgyMzY1Mzk0fQ.uoaPT_tNgrHfiQJhsyJhXT4Yj-JmjbEMCl-MhfYEjk0"
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

Write-Host "=== API Testing Results ===" -ForegroundColor Cyan
Write-Host ""

# Test Wallet Balance
Write-Host "1. Testing GET /api/v1/wallet/balance" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/wallet/balance" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Wallet History
Write-Host "2. Testing GET /api/v1/wallet/history" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/wallet/history" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Wallet Add Balance
Write-Host "3. Testing POST /api/v1/wallet/add" -ForegroundColor Yellow
try {
    $body = @{
        amount = 1000
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/wallet/add" -Method POST -Headers $headers -Body $body
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Splits
Write-Host "4. Testing GET /api/v1/split/user" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/split/user" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Create Split
Write-Host "5. Testing POST /api/v1/split/create" -ForegroundColor Yellow
try {
    $body = @{
        description = "Test split expense"
        amount = 500
        splitType = "equal"
        participants = @(
            @{ user = "6a152fc406564dca2cbe12d4" },  # Current user
            @{ user = "6a152fc406564dca2cbe12d4" }   # Another user (using same ID for test)
        )
    } | ConvertTo-Json -Depth 10
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/split/create" -Method POST -Headers $headers -Body $body
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Notifications
Write-Host "6. Testing GET /api/v1/notifications" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/notifications" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Mark All Notifications Read
Write-Host "7. Testing PATCH /api/v1/notifications/read-all" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/notifications/read-all" -Method PATCH -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Search
Write-Host "8. Testing GET /api/v1/search?q=test" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/search?q=test" -Method GET -Headers $headers
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Payment
Write-Host "9. Testing POST /api/v1/payment/create-order" -ForegroundColor Yellow
try {
    $body = @{
        amount = 500
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/payment/create-order" -Method POST -Headers $headers -Body $body
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Testing Complete ===" -ForegroundColor Cyan
