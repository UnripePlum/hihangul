@echo off
setlocal

set "SRC=C:\Mac\Home\IdeaProjects\hihangul"
set "DST=C:\dev\hihangul"
set "APP_DIR=C:\dev\hihangul\apps\windows-ui"
set "DO_SYNC=1"

if /I "%~1"=="--no-sync" set "DO_SYNC=0"
if not "%~1"=="" if /I not "%~1"=="--no-sync" set "APP_DIR=%~1"
if /I "%~2"=="--no-sync" set "DO_SYNC=0"

if not exist "%APP_DIR%" (
  if "%DO_SYNC%"=="0" (
    echo [start] ERROR: app dir not found: %APP_DIR%
    exit /b 1
  )
)

if "%DO_SYNC%"=="1" (
  echo [start] syncing source to local disk...
  call "%~dp0sync_to_windows.cmd" "%SRC%" "%DST%"
  if errorlevel 1 (
    echo [start] ERROR: sync failed
    exit /b 1
  )
)

cd /d "%APP_DIR%"

echo [start] app dir: %CD%

echo [start] checking node_modules...
if not exist "node_modules" (
  echo [start] node_modules missing. running npm install...
  call npm.cmd install
  if errorlevel 1 (
    echo [start] ERROR: npm install failed
    exit /b 1
  )
)

echo [start] starting dev:win-vm
call npm.cmd run dev:win-vm
exit /b %ERRORLEVEL%
