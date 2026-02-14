param(
  [string]$AppDir = "C:\dev\hihangul\apps\windows-ui",
  [string]$Source = "C:\Mac\Home\IdeaProjects\hihangul",
  [string]$Destination = "C:\dev\hihangul",
  [switch]$NoSync
)

$ErrorActionPreference = "Stop"

if (-not $NoSync) {
  Write-Host "[start] syncing source to local disk..."
  & "$PSScriptRoot\sync_to_windows.ps1" -Source $Source -Destination $Destination
  if ($LASTEXITCODE -ne 0) {
    throw "sync failed with code $LASTEXITCODE"
  }
}

if (-not (Test-Path $AppDir)) {
  throw "app dir not found: $AppDir"
}

Set-Location $AppDir
Write-Host "[start] app dir: $pwd"

if (-not (Test-Path "node_modules")) {
  Write-Host "[start] node_modules missing. running npm install..."
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with code $LASTEXITCODE"
  }
}

Write-Host "[start] starting dev:win-vm"
& npm.cmd run dev:win-vm
exit $LASTEXITCODE
