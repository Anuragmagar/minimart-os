$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$failures = New-Object System.Collections.Generic.List[string]

function Check([string]$name, [scriptblock]$condition) {
    $ok = $false
    try {
        $ok = & $condition
    } catch {
        $ok = $false
    }
    if ($ok) {
        Write-Output "PASS: $name"
    } else {
        Write-Output "FAIL: $name"
        $script:failures.Add($name)
    }
}

$requiredDirs = @(
    "apps\pos",
    "services\api",
    "packages",
    "infrastructure\docker",
    "infrastructure\scripts",
    "brain",
    "docs",
    "plans"
)

foreach ($dir in $requiredDirs) {
    Check "directory $dir exists" { Test-Path -LiteralPath (Join-Path $root $dir) -PathType Container }
}

Check "AGENTS.md exists" { Test-Path -LiteralPath (Join-Path $root "AGENTS.md") -PathType Leaf }
Check "README.md exists" { Test-Path -LiteralPath (Join-Path $root "README.md") -PathType Leaf }
Check "docker-compose.yml exists" { Test-Path -LiteralPath (Join-Path $root "docker-compose.yml") -PathType Leaf }

$gitignorePath = Join-Path $root ".gitignore"
Check ".gitignore exists" { Test-Path -LiteralPath $gitignorePath -PathType Leaf }
$gitignoreContent = Get-Content -Raw -LiteralPath $gitignorePath
$requiredPatterns = @(".env", "node_modules", ".dart_tool", "build", "dist", ".env.example")
foreach ($pattern in $requiredPatterns) {
    Check ".gitignore contains '$pattern'" { $gitignoreContent.Contains($pattern) }
}

$envExamplePath = Join-Path $root ".env.example"
Check "root .env.example exists" { Test-Path -LiteralPath $envExamplePath -PathType Leaf }
$envExampleLines = Get-Content -LiteralPath $envExamplePath
$requiredEnvVars = @("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_PORT", "REDIS_PORT")
foreach ($var in $requiredEnvVars) {
    Check "root .env.example defines $var" { (@($envExampleLines -like "$var=*")).Count -gt 0 }
}

$apiEnvExamplePath = Join-Path $root "services\api\.env.example"
Check "services/api .env.example exists" { Test-Path -LiteralPath $apiEnvExamplePath -PathType Leaf }
$apiEnvExampleLines = Get-Content -LiteralPath $apiEnvExamplePath
$requiredApiEnvVars = @("NODE_ENV", "PORT", "DATABASE_URL", "REDIS_URL", "TZ")
foreach ($var in $requiredApiEnvVars) {
    Check "services/api .env.example defines $var" { (@($apiEnvExampleLines -like "$var=*")).Count -gt 0 }
}

Check "root .env.example uses placeholder password" { @($envExampleLines -like "POSTGRES_PASSWORD=changeme").Count -gt 0 }
Check "services/api .env.example uses placeholder password" { @($apiEnvExampleLines -match "changeme").Count -gt 0 }
Check "no real .env file at root" { -not (Test-Path -LiteralPath (Join-Path $root ".env") -PathType Leaf) }
Check "no real .env file in services/api" { -not (Test-Path -LiteralPath (Join-Path $root "services\api\.env") -PathType Leaf) }
Check "git repository initialized" { Test-Path -LiteralPath (Join-Path $root ".git") -PathType Container }

if ($failures.Count -gt 0) {
    Write-Output "RESULT: $($failures.Count) check(s) failed"
    exit 1
} else {
    Write-Output "RESULT: ALL CHECKS PASSED"
    exit 0
}