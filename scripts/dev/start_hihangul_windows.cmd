@echo off
setlocal EnableExtensions
set "SCRIPT_VERSION=2026.02.19.13"

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "AUTO_ROOT=%%~fI"

set "ROOT=%AUTO_ROOT%"
set "DO_SYNC=0"
set "DO_PRECISE=0"
set "DO_REMOTE_DEBUG=0"
set "POST_SYNC=0"
set "PY_OVERRIDE=%HIHANGUL_PYTHON%"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--sync" (
  set "DO_SYNC=1"
  shift
  goto parse_args
)
if /I "%~1"=="--precise" (
  set "DO_PRECISE=1"
  shift
  goto parse_args
)
if /I "%~1"=="--remote-debug" (
  set "DO_REMOTE_DEBUG=1"
  shift
  goto parse_args
)
if /I "%~1"=="--post-sync" (
  set "POST_SYNC=1"
  shift
  goto parse_args
)
if /I "%~1"=="--help" goto usage
if "%ROOT%"=="%AUTO_ROOT%" (
  set "ROOT=%~1"
  shift
  goto parse_args
)
echo [start-all] ERROR: unknown argument: %~1
goto usage

:args_done
if "%DO_PRECISE%"=="1" set "HIHANGUL_ENABLE_PRECISE_LAYOUT=1"
if "%DO_REMOTE_DEBUG%"=="1" set "HIHANGUL_ENABLE_REMOTE_DEBUGGING=1"

echo [start-all] options: sync=%DO_SYNC% precise=%HIHANGUL_ENABLE_PRECISE_LAYOUT% remote_debug=%HIHANGUL_ENABLE_REMOTE_DEBUGGING%
echo [start-all] script version: %SCRIPT_VERSION%

echo [start-all] root: %ROOT%
if not exist "%ROOT%" (
  echo [start-all] ERROR: root not found: %ROOT%
  exit /b 1
)

if "%DO_SYNC%"=="1" (
  echo [start-all] syncing source to local disk...
  call "%ROOT%\scripts\dev\sync_to_windows.cmd"
  if errorlevel 1 (
    echo [start-all] ERROR: sync failed
    exit /b 1
  )
  if not "%POST_SYNC%"=="1" (
    echo [start-all] relaunching after sync...
    set "RELAUNCH_ARGS=%ROOT%"
    if "%DO_PRECISE%"=="1" set "RELAUNCH_ARGS=%RELAUNCH_ARGS% --precise"
    if "%DO_REMOTE_DEBUG%"=="1" set "RELAUNCH_ARGS=%RELAUNCH_ARGS% --remote-debug"
    set "RELAUNCH_ARGS=%RELAUNCH_ARGS% --post-sync"
    cmd /c ""%ROOT%\scripts\dev\start_hihangul_windows.cmd" %RELAUNCH_ARGS%"
    exit /b %ERRORLEVEL%
  )
)

set "REQUIRE_X64=0"
if /I "%HIHANGUL_ENABLE_PRECISE_LAYOUT%"=="1" set "REQUIRE_X64=1"

set "HIHANGUL_PYTHON="
if defined PY_OVERRIDE if exist "%PY_OVERRIDE%" set "HIHANGUL_PYTHON=%PY_OVERRIDE%"
if defined HIHANGUL_PYTHON (
  echo "%HIHANGUL_PYTHON%" | findstr /I "WindowsApps" >nul && set "HIHANGUL_PYTHON="
)
if defined HIHANGUL_PYTHON if "%REQUIRE_X64%"=="1" (
  echo "%HIHANGUL_PYTHON%" | findstr /I "arm64" >nul && set "HIHANGUL_PYTHON="
)

if not defined HIHANGUL_PYTHON if exist "%LocalAppData%\Programs\Python\Python313\python.exe" set "HIHANGUL_PYTHON=%LocalAppData%\Programs\Python\Python313\python.exe"
if not defined HIHANGUL_PYTHON if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "HIHANGUL_PYTHON=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined HIHANGUL_PYTHON if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "HIHANGUL_PYTHON=%LocalAppData%\Programs\Python\Python311\python.exe"
if not defined HIHANGUL_PYTHON if exist "%LocalAppData%\Programs\Python\Python310\python.exe" set "HIHANGUL_PYTHON=%LocalAppData%\Programs\Python\Python310\python.exe"
if not defined HIHANGUL_PYTHON if exist "C:\Python313\python.exe" set "HIHANGUL_PYTHON=C:\Python313\python.exe"
if not defined HIHANGUL_PYTHON if exist "C:\Python312\python.exe" set "HIHANGUL_PYTHON=C:\Python312\python.exe"
if not defined HIHANGUL_PYTHON if exist "C:\Python311\python.exe" set "HIHANGUL_PYTHON=C:\Python311\python.exe"
if not defined HIHANGUL_PYTHON if exist "C:\Python310\python.exe" set "HIHANGUL_PYTHON=C:\Python310\python.exe"

if not defined HIHANGUL_PYTHON (
  if "%REQUIRE_X64%"=="1" (
    echo [start-all] python compatibility check failed. installing Python 3.11 x64...
  ) else (
    echo [start-all] python compatibility check failed. installing Python 3.11...
  )
  winget --version >nul 2>nul
  if errorlevel 1 (
    echo [start-all] ERROR: winget not found. Install Python manually.
    exit /b 1
  )
  if "%REQUIRE_X64%"=="1" (
    winget install -e --id Python.Python.3.11 --architecture x64 --accept-package-agreements --accept-source-agreements >nul 2>nul
    if errorlevel 1 winget upgrade -e --id Python.Python.3.11 --architecture x64 --accept-package-agreements --accept-source-agreements >nul 2>nul
  ) else (
    winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements >nul 2>nul
    if errorlevel 1 winget upgrade -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements >nul 2>nul
  )

  if exist "%LocalAppData%\Programs\Python\Python311\python.exe" set "HIHANGUL_PYTHON=%LocalAppData%\Programs\Python\Python311\python.exe"
  if not defined HIHANGUL_PYTHON if exist "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe" set "HIHANGUL_PYTHON=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe"
  if not defined HIHANGUL_PYTHON if exist "C:\Python311\python.exe" set "HIHANGUL_PYTHON=C:\Python311\python.exe"
  if not defined HIHANGUL_PYTHON (
    for /f "usebackq delims=" %%P in (`py -3.11 -c "import sys; print(sys.executable)" 2^>nul`) do (
      if not defined HIHANGUL_PYTHON if exist "%%~P" set "HIHANGUL_PYTHON=%%~P"
    )
  )
)

if not defined HIHANGUL_PYTHON (
  echo [start-all] ERROR: python not found after install.
  echo [start-all] hint: expected at %LocalAppData%\Programs\Python\Python311\python.exe
  exit /b 1
)
echo "%HIHANGUL_PYTHON%" | findstr /I "WindowsApps" >nul
if not errorlevel 1 (
  echo [start-all] ERROR: selected python is WindowsApps shim: %HIHANGUL_PYTHON%
  echo [start-all] Set HIHANGUL_PYTHON to a real python.exe path.
  exit /b 1
)

if "%REQUIRE_X64%"=="1" (
  echo "%HIHANGUL_PYTHON%" | findstr /I "arm64" >nul
  if not errorlevel 1 (
    echo [start-all] ERROR: precise mode requires x64 python. current=%HIHANGUL_PYTHON%
    exit /b 1
  )
)

set "PY_VER="
for /f "tokens=2 delims= " %%A in ('"%HIHANGUL_PYTHON%" -V 2^>^&1') do if not defined PY_VER set "PY_VER=%%A"
if not defined PY_VER (
  echo [start-all] ERROR: failed to run python: %HIHANGUL_PYTHON%
  exit /b 1
)

echo [start-all] python compatible: %HIHANGUL_PYTHON%
for %%D in ("%HIHANGUL_PYTHON%") do set "PY_DIR=%%~dpD"
if defined PY_DIR set "PATH=%PY_DIR%;%PATH%"
echo [start-all] python path pinned: %HIHANGUL_PYTHON%

if not exist "%ROOT%\scripts\dev\brain\run_windows_brain_windows.cmd" (
  echo [start-all] ERROR: script not found: %ROOT%\scripts\dev\brain\run_windows_brain_windows.cmd
  exit /b 1
)

start "HiHangul Brain" cmd /k "title HiHangul Brain && %ROOT%\scripts\dev\brain\run_windows_brain_windows.cmd %ROOT%\apps\windows-brain"
start "HiHangul Agent" cmd /k "title HiHangul Agent && %ROOT%\scripts\dev\agent\run_windows_agent_windows.cmd %ROOT%\apps\windows-agent"
start "HiHangul UI" cmd /k "title HiHangul UI && %ROOT%\scripts\dev\ui\start_windows_ui_windows.cmd %ROOT%\apps\windows-ui --no-sync"

echo [start-all] launched Brain(8000), Agent(9000), UI
exit /b 0

:usage
echo Usage: start_hihangul_windows.cmd [root] [--sync] [--precise] [--remote-debug]
echo   --sync         sync source to C:\dev\hihangul before launch
echo   --precise      set HIHANGUL_ENABLE_PRECISE_LAYOUT=1
echo   --remote-debug set HIHANGUL_ENABLE_REMOTE_DEBUGGING=1
exit /b 1
