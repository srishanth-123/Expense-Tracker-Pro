# Script to populate database with sample categories and transactions
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMTUyZmM0MDY1NjRkY2EyY2JlMTJkNCIsImlhdCI6MTc3OTc3MzM5NCwiZXhwIjoxNzgyMzY1Mzk0fQ.uoaPT_tNgrHfiQJhsyJhXT4Yj-JmjbEMCl-MhfYEjk0"
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

Write-Host "=== Populating Sample Data ===" -ForegroundColor Cyan
Write-Host ""

# Use the existing Food category ID that was already created
$categoryId = "6a15301a06564dca2cbe12df"
Write-Host "Using existing category ID: $categoryId" -ForegroundColor Yellow
Write-Host ""

# Sample Transactions - just 5 to minimize rate limiting
$transactions = @(
    # Income
    @{ type = "income"; amount = 50000; description = "Monthly salary"; date = "2026-05-15" },
    @{ type = "income"; amount = 15000; description = "Freelance project"; date = "2026-05-18" },
    # Expenses
    @{ type = "expense"; amount = 450; description = "Grocery shopping"; date = "2026-05-20" },
    @{ type = "expense"; amount = 120; description = "Uber ride"; date = "2026-05-20" },
    @{ type = "expense"; amount = 2500; description = "New clothes"; date = "2026-05-19" }
)

Write-Host "Creating Transactions..." -ForegroundColor Yellow
Write-Host "Rate limiting detected. Waiting 30 seconds for rate limit to reset..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

$createdCount = 0
foreach ($txn in $transactions) {
    try {
        $body = @{
            type = $txn.type
            amount = $txn.amount
            description = $txn.description
            category = $categoryId
            date = $txn.date
        } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "http://localhost:5000/api/transactions" -Method POST -Headers $headers -Body $body
        $createdCount++
        Write-Host "  ✅ Created: $($txn.description) - ₹$($txn.amount)" -ForegroundColor Green
        # Add delay to avoid rate limiting (3 seconds)
        Start-Sleep -Seconds 3
    } catch {
        Write-Host "  ❌ Failed: $($txn.description) - $($_.Exception.Message)" -ForegroundColor Red
        # Add delay even on failure (3 seconds)
        Start-Sleep -Seconds 3
    }
}
Write-Host ""

Write-Host "=== Data Population Complete ===" -ForegroundColor Cyan
Write-Host "Transactions Created: $createdCount" -ForegroundColor Green
Write-Host ""
Write-Host "Refresh your browser to see the beautiful dashboard!" -ForegroundColor Yellow
