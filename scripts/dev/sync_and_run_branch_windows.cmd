@echo off
setlocal EnableExtensions

if "%~1"=="" goto usage
set "BRANCH_NAME=%~1"

set "SAFE_BRANCH=%BRANCH_NAME:/=-%"
if /I "%BRANCH_NAME%"=="main" (
  set "FOLDER_NAME=hihangul"
) else (
  set "FOLDER_NAME=hihangul-%SAFE_BRANCH%"
)

set "SRC=\\Mac\Home\IdeaProjects\%FOLDER_NAME%"
set "DST=C:\dev\hihangul"

echo [sync-branch] Branch      : %BRANCH_NAME%
echo [sync-branch] Folder Name : %FOLDER_NAME%
echo [sync-branch] Source      : %SRC%
echo [sync-branch] Destination : %DST%

if not exist "%SRC%" (
  echo [sync-branch] ERROR: Source path does not exist: %SRC%
  echo [sync-branch] Ensure Parallels shared folders are active and the branch project exists.
  exit /b 1
)

if not exist "%DST%" mkdir "%DST%"

echo [sync-branch] Syncing files...
robocopy "%SRC%" "%DST%" /MIR /IS /IT /R:2 /W:1 /MT:16 /XD .git node_modules .venv dist dist-electron __pycache__ /XF *.pyc *.pyo *.DS_Store

set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [sync-branch] ERROR: robocopy failed with code %RC%
  exit /b %RC%
)

echo [sync-branch] Sync complete. robocopy exit code: %RC%
echo [sync-branch] Done.
exit /b 0

:usage
echo Usage: sync_and_run_branch_windows.cmd ^<branch_name^>
echo   ^<branch_name^>   The branch name (e.g. main, feat/brain).
echo                     main maps to 'hihangul'.
echo                     Others map to 'hihangul-^<branch_name^>'. Slashes will be converted to dashes.
exit /b 1
