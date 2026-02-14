@echo off
setlocal

set "SRC=C:\Mac\Home\IdeaProjects\hihangul"
set "DST=C:\dev\hihangul"

if not "%~1"=="" set "SRC=%~1"
if not "%~2"=="" set "DST=%~2"

echo [sync] Source      : %SRC%
echo [sync] Destination : %DST%

if not exist "%SRC%" (
  echo [sync] ERROR: Source path does not exist.
  exit /b 1
)

if not exist "%DST%" mkdir "%DST%"

robocopy "%SRC%" "%DST%" /E /R:2 /W:1 /MT:16 ^
  /XD .git node_modules .venv dist dist-electron __pycache__ ^
  /XF *.pyc *.pyo *.DS_Store

set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [sync] ERROR: robocopy failed with code %RC%
  exit /b %RC%
)

echo [sync] Done. robocopy exit code: %RC%
echo [sync] Next: cd /d %DST%\apps\windows-ui ^&^& npm install ^&^& npm run dev:win-vm
exit /b 0
