param(
  [string]$Root = "",
  [switch]$Sync
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
}

if (-not (Test-Path $Root)) {
  throw "root not found: $Root"
}

Write-Host "[start-all] root: $Root"

if ($Sync) {
  Write-Host "[start-all] syncing source to local disk..."
  & "$Root\scripts\dev\sync_to_windows.ps1"
  if ($LASTEXITCODE -ne 0) {
    throw "sync failed with code $LASTEXITCODE"
  }
}

Write-Host "[start-all] checking Python runtime..."
$pythonReady = $false

if ($env:HIHANGUL_PYTHON -and (Test-Path $env:HIHANGUL_PYTHON)) {
  $pythonReady = $true
}
if (-not $pythonReady) {
  $cmd = Get-Command py -ErrorAction SilentlyContinue
  if ($cmd) { $pythonReady = $true }
}
if (-not $pythonReady) {
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { $pythonReady = $true }
}
if (-not $pythonReady) {
  Write-Host "[start-all] Python not found. trying install via winget..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "winget not found. Install Python manually or set HIHANGUL_PYTHON."
  }
  & winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Python auto-install failed."
  }
}

Start-Process cmd.exe -ArgumentList "/k `"title HiHangul Brain && $Root\scripts\dev\run_windows_brain_windows.cmd $Root\apps\windows-brain`"" -WindowStyle Normal
Start-Process cmd.exe -ArgumentList "/k `"title HiHangul Agent && $Root\scripts\dev\run_windows_agent_windows.cmd $Root\apps\windows-agent`"" -WindowStyle Normal
Start-Process cmd.exe -ArgumentList "/k `"title HiHangul UI && $Root\scripts\dev\start_windows_ui_windows.cmd $Root\apps\windows-ui --no-sync`"" -WindowStyle Normal

Write-Host "[start-all] launched Brain(8000), Agent(9000), UI"
