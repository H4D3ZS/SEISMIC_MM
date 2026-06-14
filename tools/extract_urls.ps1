$filePath = "C:\Users\HADES\.gemini\antigravity-ide\brain\c3154b4d-cc58-41d3-ae53-fdfea79584f7\.system_generated\steps\259\content.md"
if (Test-Path $filePath) {
    Write-Host "File exists, size:" (Get-Item $filePath).Length
    $content = Get-Content -Path $filePath -Raw
    
    # Simple regex for URLs
    $pattern = 'https?://[a-zA-Z0-9\./\-_%&\?=\+]+'
    $matches = [regex]::Matches($content, $pattern)
    $urls = @()
    foreach ($m in $matches) {
        $urls += $m.Value
    }
    
    Write-Host "--- UNIQUE URLS ---"
    $urls | Sort-Object -Unique
} else {
    Write-Host "ERROR: File not found at $filePath"
}
