# Login as the user created in the first test script
$body = @{
    email = 'test@test.com'
    password = 'password'
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri http://localhost:8080/api/auth/login -Method Post -Body $body -ContentType 'application/json'
$token = $response.token
$hospitalId = $response.hospitalId

Write-Host "Hospital ID: $hospitalId"
Write-Host "Token: $token"

# First, fetch categories and delete them to simulate an older hospital
$categories = Invoke-RestMethod -Uri "http://localhost:8080/api/bed-categories/$hospitalId" -Headers @{ 'Authorization' = "Bearer $token" }
foreach ($cat in $categories) {
    # Set occupied to 0 first in case they have beds
    $updateBody = @{
        occupiedBeds = 0
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8080/api/bed-categories/$hospitalId/$($cat.categoryId)" -Method Put -Body $updateBody -ContentType 'application/json' -Headers @{ 'Authorization' = "Bearer $token" }
    
    # Delete category
    Invoke-RestMethod -Uri "http://localhost:8080/api/bed-categories/$hospitalId/$($cat.categoryId)" -Method Delete -Headers @{ 'Authorization' = "Bearer $token" }
}

Write-Host "Deleted all categories for hospital."

# Now fetch the dashboard. This will trigger the auto-seeding logic in getDashboard!
try {
    $dashboardResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/hospital/$hospitalId/dashboard" -Headers @{ 'Authorization' = "Bearer $token" }
    Write-Host "Dashboard fetch successful!"
} catch {
    Write-Host "Error fetching dashboard!"
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
        Write-Host "Response Body: $errBody"
    } else {
        Write-Host $_.Exception.Message
    }
}
