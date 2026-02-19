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

set "NPM_HASH_SOURCE=package-lock.json"
if not exist "%NPM_HASH_SOURCE%" set "NPM_HASH_SOURCE=package.json"
set "NPM_HASH="
for /f "delims=" %%H in ('certutil -hashfile "%NPM_HASH_SOURCE%" SHA256 ^| findstr /R /I "^[0-9A-F][0-9A-F]"') do (
  if not defined NPM_HASH set "NPM_HASH=%%H"
)
set "NPM_HASH=%NPM_HASH: =%"
set "OLD_NPM_HASH="
if exist "node_modules\.deps-hash" set /p OLD_NPM_HASH=<"node_modules\.deps-hash"
set "INSTALL_NPM=0"

echo [start] checking node_modules/install state...
if not exist "node_modules" (
  set "INSTALL_NPM=1"
)
if "%NPM_HASH%"=="" set "INSTALL_NPM=1"
if /I not "%NPM_HASH%"=="%OLD_NPM_HASH%" set "INSTALL_NPM=1"

if "%INSTALL_NPM%"=="1" (
  echo [start] node_modules missing. running npm install...
  call npm.cmd install
  if errorlevel 1 (
    echo [start] ERROR: npm install failed
    exit /b 1
  )
  > "node_modules\.deps-hash" echo %NPM_HASH%
)

echo [start] checking lucide-react...
call npm.cmd ls lucide-react --depth=0 >nul 2>nul
if errorlevel 1 (
  echo [start] lucide-react missing. installing...
  call npm.cmd install lucide-react
  if errorlevel 1 (
    echo [start] ERROR: lucide-react install failed
    exit /b 1
  )
  if not "%NPM_HASH%"=="" > "node_modules\.deps-hash" echo %NPM_HASH%
)

echo [start] starting dev:win-vm
call npm.cmd run dev:win-vm
exit /b %ERRORLEVEL%
