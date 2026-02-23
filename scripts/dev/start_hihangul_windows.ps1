param(
  [string]$Root = "",
  [switch]$Sync,
  [switch]$Precise,
  [switch]$RemoteDebug
)

$ErrorActionPreference = "Stop"
$ScriptVersion = "2026.02.19.1"

function Find-X64Python {
  param(
    [string[]]$Candidates
  )
  foreach ($candidate in $Candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  return $null
}

if (-not $Root) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
}

if (-not (Test-Path $Root)) {
  throw "root not found: $Root"
}

if ($Precise) {
  $env:HIHANGUL_ENABLE_PRECISE_LAYOUT = "1"
}
if ($RemoteDebug) {
  $env:HIHANGUL_ENABLE_REMOTE_DEBUGGING = "1"
}

Write-Host "[start-all] root: $Root"
Write-Host "[start-all] options: sync=$($Sync.IsPresent) precise=$($env:HIHANGUL_ENABLE_PRECISE_LAYOUT) remote_debug=$($env:HIHANGUL_ENABLE_REMOTE_DEBUGGING)"
Write-Host "[start-all] script version: $ScriptVersion"

if ($env:HIHANGUL_ENABLE_PRECISE_LAYOUT -eq "1") {
  $x64Candidates = @(
    "$env:LocalAppData\Programs\Python\Python313\python.exe",
    "$env:LocalAppData\Programs\Python\Python312\python.exe",
    "$env:LocalAppData\Programs\Python\Python311\python.exe",
    "$env:LocalAppData\Programs\Python\Python310\python.exe",
    "C:\Python313\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    "C:\Python310\python.exe"
  )

  if ($env:HIHANGUL_PYTHON -and $env:HIHANGUL_PYTHON -match "arm64") {
    Write-Host "[start-all] precise layout: ARM64 python override detected. ignoring HIHANGUL_PYTHON."
    $env:HIHANGUL_PYTHON = ""
  }

  if ($env:HIHANGUL_PYTHON -and (Test-Path $env:HIHANGUL_PYTHON)) {
    Write-Host "[start-all] precise layout: using HIHANGUL_PYTHON=$($env:HIHANGUL_PYTHON)"
    $picked = $env:HIHANGUL_PYTHON
  } else {
    $picked = Find-X64Python -Candidates $x64Candidates
  }
  if (-not $picked) {
    Write-Host "[start-all] precise layout: x64 python not found. trying install via winget..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw "winget not found. Install Python x64 manually."
    }
    & winget install -e --id Python.Python.3.11 --architecture x64 --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
      throw "Python x64 auto-install failed."
    }
    $picked = Find-X64Python -Candidates $x64Candidates
  }

  if (-not $picked) {
    throw "x64 python still not found after install. Set HIHANGUL_PYTHON manually."
  }

  $env:HIHANGUL_PYTHON = $picked
  Write-Host "[start-all] precise layout: selected x64 python: $picked"
}

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
  & winget install -e --id Python.Python.3.11 --architecture x64 --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Python auto-install failed."
  }
}

Start-Process cmd.exe -ArgumentList "/k `"title HiHangul Brain && $Root\scripts\dev\brain\run_windows_brain_windows.cmd $Root\apps\windows-brain`"" -WindowStyle Normal
Start-Process cmd.exe -ArgumentList "/k `"title HiHangul Agent && $Root\scripts\dev\agent\run_windows_agent_windows.cmd $Root\apps\windows-agent`"" -WindowStyle Normal
Start-Process cmd.exe -ArgumentList "/k `"title HiHangul UI && $Root\scripts\dev\ui\start_windows_ui_windows.cmd $Root\apps\windows-ui --no-sync`"" -WindowStyle Normal

Write-Host "[start-all] launched Brain(8000), Agent(9000), UI"
