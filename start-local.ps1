param(
  [switch]$SkipDocker,
  [switch]$SeedSubscriptions
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $Root 'env.local'
$ComposeOverride = Join-Path $Root 'docker-compose.override.yaml.disabled'

function Import-EnvFile {
  param([string]$Path)

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()

    if ($line.Length -eq 0 -or $line.StartsWith('#')) {
      return
    }

    if ($line -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      return
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing env.local. Create it from .env first: Copy-Item .env env.local"
}

Set-Location $Root
Import-EnvFile -Path $EnvFile

if (-not $SkipDocker) {
  docker compose --env-file env.local -f docker-compose.yml -f $ComposeOverride up -d mongodb meilisearch
}

if ($SeedSubscriptions) {
  npm run seed-subscriptions
}

$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCommand) {
  $shell = $pwshCommand.Source
} else {
  $shell = (Get-Command powershell.exe -ErrorAction Stop).Source
}

$BackendPort = if ($env:PORT) { $env:PORT } else { '3080' }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { '3090' }

$backendCommand = "Set-Location '$Root'; npm run backend:dev"
$frontendCommand = "Set-Location '$Root'; `$env:PORT='$FrontendPort'; `$env:BACKEND_PORT='$BackendPort'; npm run frontend:dev"

Start-Process -FilePath $shell -ArgumentList @('-NoExit', '-NoProfile', '-Command', $backendCommand) -WindowStyle Normal
Start-Process -FilePath $shell -ArgumentList @('-NoExit', '-NoProfile', '-Command', $frontendCommand) -WindowStyle Normal

Write-Host 'Local LibreChat startup triggered.'
Write-Host "Backend:  http://localhost:$BackendPort"
Write-Host "Frontend: http://localhost:$FrontendPort"
