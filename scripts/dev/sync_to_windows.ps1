param(
  [Parameter(Mandatory=$true)]
  [string]$Source,
  [Parameter(Mandatory=$true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"

Write-Host "[sync] Source      : $Source"
Write-Host "[sync] Destination : $Destination"

if (-not (Test-Path $Source)) {
  throw "Source path does not exist: $Source"
}

if (-not (Test-Path $Destination)) {
  New-Item -Path $Destination -ItemType Directory | Out-Null
}

$excludeDirs = @(
  ".git",
  "node_modules",
  ".venv",
  "dist",
  "dist-electron",
  "__pycache__"
)

$excludeFiles = @(
  "*.pyc",
  "*.pyo",
  "*.DS_Store"
)

$robocopyArgs = @(
  $Source,
  $Destination,
  "/E",
  "/R:2",
  "/W:1",
  "/MT:16",
  "/XD"
) + $excludeDirs + @(
  "/XF"
) + $excludeFiles

Write-Host "[sync] Running robocopy..."
robocopy @robocopyArgs
$code = $LASTEXITCODE

# Robocopy exit codes 0-7 are considered success.
if ($code -ge 8) {
  throw "robocopy failed with exit code $code"
}

Write-Host "[sync] Done. robocopy exit code: $code"
Write-Host "[sync] Next: cd $Destination\apps\windows-ui; npm install; npm run dev:win-vm"
