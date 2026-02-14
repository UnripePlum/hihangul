@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "AUTO_ROOT=%%~fI"

set "ROOT=%AUTO_ROOT%"
set "DO_SYNC=0"

if /I "%~1"=="--sync" set "DO_SYNC=1"
if not "%~1"=="" if /I not "%~1"=="--sync" set "ROOT=%~1"
if /I "%~2"=="--sync" set "DO_SYNC=1"

if not exist "%ROOT%" (
  echo [start-all] ERROR: root not found: %ROOT%
  exit /b 1
)

echo [start-all] root: %ROOT%

if not exist "%ROOT%\scripts\dev\run_windows_brain_windows.cmd" (
  echo [start-all] ERROR: script not found: %ROOT%\scripts\dev\run_windows_brain_windows.cmd
  exit /b 1
)

if "%DO_SYNC%"=="1" (
  echo [start-all] syncing source to local disk...
  call "%ROOT%\scripts\dev\sync_to_windows.cmd"
  if errorlevel 1 (
    echo [start-all] ERROR: sync failed
    exit /b 1
  )
)

echo [start-all] checking Python runtime...
set "PY_READY="
if not "%HIHANGUL_PYTHON%"=="" if exist "%HIHANGUL_PYTHON%" set "PY_READY=1"
if "%PY_READY%"=="" (
  py -3 -V >nul 2>nul && set "PY_READY=1"
)
if "%PY_READY%"=="" (
  python -V >nul 2>nul && set "PY_READY=1"
)
if "%PY_READY%"=="" (
  echo [start-all] Python not found. trying install via winget...
  winget --version >nul 2>nul
  if errorlevel 1 (
    echo [start-all] ERROR: winget not found. Install Python manually or set HIHANGUL_PYTHON.
    exit /b 1
  )
  winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo [start-all] ERROR: Python auto-install failed.
    exit /b 1
  )
)

start "HiHangul Brain" cmd /k "title HiHangul Brain && %ROOT%\scripts\dev\run_windows_brain_windows.cmd %ROOT%\apps\windows-brain"
start "HiHangul Agent" cmd /k "title HiHangul Agent && %ROOT%\scripts\dev\run_windows_agent_windows.cmd %ROOT%\apps\windows-agent"
start "HiHangul UI" cmd /k "title HiHangul UI && %ROOT%\scripts\dev\start_windows_ui_windows.cmd %ROOT%\apps\windows-ui --no-sync"

echo [start-all] launched Brain(8000), Agent(9000), UI
exit /b 0
