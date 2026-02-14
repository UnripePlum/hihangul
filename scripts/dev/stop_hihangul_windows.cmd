@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CALLER_PID="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"ProcessId=$PID\").ParentProcessId" 2^>nul`) do set "CALLER_PID=%%P"

set "CALLER_PID=%CALLER_PID: =%"

echo(%CALLER_PID%| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo [stop-all] WARN: failed to detect caller PID, using legacy keep-caller mode
  powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop_hihangul_windows.ps1" -KeepCaller
) else (
  powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop_hihangul_windows.ps1" -ExcludePid %CALLER_PID%
)
exit /b %ERRORLEVEL%
