$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$failures = New-Object System.Collections.Generic.List[string]
$skips = New-Object System.Collections.Generic.List[string]

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

function Skip([string]$name) {
    Write-Output "SKIP: $name"
    $script:skips.Add($name)
}

function Get-EnvValue([string]$key, [string]$default) {
    $envFile = Join-Path $root ".env"
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in Get-Content -LiteralPath $envFile) {
            if ($line -match "^$([regex]::Escape($key))=(.*)$") {
                return $Matches[1].Trim()
            }
        }
    }
    return $default
}

Check "docker CLI available" { $null -ne (Get-Command docker -ErrorAction SilentlyContinue) }

$dockerComposePath = Join-Path $root "docker-compose.yml"
Check "docker-compose.yml exists" { Test-Path -LiteralPath $dockerComposePath -PathType Leaf }

if ($null -eq (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Output "RESULT: $($failures.Count) check(s) failed"
    exit 1
}

Push-Location $root
try {
    docker compose config --quiet 2>$null
    Check "docker compose config is valid" { $LASTEXITCODE -eq 0 }

    $resolvedConfig = docker compose config 2>$null
    Check "resolved config defines postgres service" { $resolvedConfig -match "postgres:17-alpine" }
    Check "resolved config defines redis service" { $resolvedConfig -match "redis:7-alpine" }
    Check "postgres healthcheck present" { $resolvedConfig -match "pg_isready" }
    Check "redis healthcheck present" { $resolvedConfig -match "redis-cli" -and $resolvedConfig -match "- ping" }
    Check "postgres data volume mounted" { $resolvedConfig -match "/var/lib/postgresql/data" }
    Check "redis data volume mounted" { $resolvedConfig -match "redisdata" -and $resolvedConfig -match "/data" }
    Check "redis appendonly persistence enabled" { $resolvedConfig -match "--appendonly" }
    Check "ports bound to localhost only" { $resolvedConfig -match "127.0.0.1" -and $resolvedConfig -notmatch 'published: "0.0.0.0"' }

    $serverVersion = ""
    try {
        $serverVersion = (docker info --format "{{.ServerVersion}}" 2>$null | Out-String).Trim()
    } catch {
        $serverVersion = ""
    }

    if ([string]::IsNullOrEmpty($serverVersion)) {
        Skip "live container smoke test (docker daemon not running)"
    } else {
        Write-Output "INFO: docker daemon running (server $serverVersion)"
        $dbUser = Get-EnvValue "POSTGRES_USER" "minimart"
        $dbName = Get-EnvValue "POSTGRES_DB" "minimart"
        $dbPass = Get-EnvValue "POSTGRES_PASSWORD" "changeme"
        & docker compose up -d --wait
        Check "docker compose up --wait succeeds" { $LASTEXITCODE -eq 0 }
        if ($LASTEXITCODE -eq 0) {
            $psText = (docker compose ps --format json 2>$null | Out-String)
            $containers = @()
            foreach ($line in ($psText -split "`r?`n")) {
                if ([string]::IsNullOrWhiteSpace($line)) { continue }
                try {
                    $containers += ($line | ConvertFrom-Json)
                } catch {
                }
            }
            Check "both containers reported running" { @($containers | Where-Object { $_.State -eq "running" }).Count -ge 2 }
            $unhealthy = @($containers | Where-Object { $_.Health -ne "healthy" -or $_.State -ne "running" })
            Check "all containers healthy" { $unhealthy.Count -eq 0 }

            & docker compose exec -T -e "PGPASSWORD=$dbPass" postgres psql -U $dbUser -d $dbName -q -c "CREATE TABLE IF NOT EXISTS persist_probe (id int); INSERT INTO persist_probe VALUES (1);"
            Check "postgres write probe succeeds" { $LASTEXITCODE -eq 0 }
            & docker compose exec -T redis redis-cli SET persist_probe probe1
            Check "redis write probe succeeds" { $LASTEXITCODE -eq 0 }
        }
        & docker compose down
        Check "docker compose down succeeds" { $LASTEXITCODE -eq 0 }
        & docker compose up -d --wait
        Check "docker compose re-up --wait succeeds" { $LASTEXITCODE -eq 0 }
        if ($LASTEXITCODE -eq 0) {
            $pgCount = (& docker compose exec -T -e "PGPASSWORD=$dbPass" postgres psql -tA -U $dbUser -d $dbName -c "SELECT count(*) FROM persist_probe;" 2>$null | Out-String).Trim()
            Check "postgres data persisted across restart" { $pgCount -eq "1" }
            $redisValue = (& docker compose exec -T redis redis-cli GET persist_probe 2>$null | Out-String).Trim()
            Check "redis data persisted across restart" { $redisValue -eq "probe1" }

            & docker compose exec -T -e "PGPASSWORD=$dbPass" postgres psql -U $dbUser -d $dbName -q -c "DROP TABLE IF EXISTS persist_probe;"
            & docker compose exec -T redis redis-cli DEL persist_probe
        }
        & docker compose down
        Check "docker compose down succeeds (final)" { $LASTEXITCODE -eq 0 }
    }
}
finally {
    Pop-Location
}

if ($failures.Count -gt 0) {
    Write-Output "RESULT: $($failures.Count) check(s) failed"
    exit 1
} else {
    Write-Output "RESULT: ALL CHECKS PASSED ($($skips.Count) skipped)"
    exit 0
}