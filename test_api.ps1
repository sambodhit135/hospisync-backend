$body = @{
    hospitalName = 'Test Hospital'
    govId = 'TEST' + (Get-Random)
    email = 'test@test.com'
    password = 'password'
    totalIcuBeds = 10
    totalDecareBeds = 10
    totalGeneralBeds = 10
    totalChildcareBeds = 10
    totalEssentialBeds = 10
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri http://localhost:8080/api/auth/register -Method Post -Body $body -ContentType 'application/json'
$token = $response.token
$hospitalId = $response.hospitalId

Write-Host "Registered Hospital ID: $hospitalId"
Write-Host "Token: $token"

try {
    $dashboardResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/hospital/$hospitalId/dashboard" -Headers @{ 'Authorization' = "Bearer $token" }
    $dashboardResponse | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error fetching dashboard!"
    Write-Host $_.Exception.Message
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $errBody = $reader.ReadToEnd()
    Write-Host "Response Body: $errBody"
}
