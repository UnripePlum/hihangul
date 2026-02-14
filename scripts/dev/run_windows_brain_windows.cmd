@echo off
setlocal

set "APP_DIR=C:\dev\hihangul\apps\windows-brain"
if not "%~1"=="" set "APP_DIR=%~1"

if not exist "%APP_DIR%" (
  echo [windows-brain] ERROR: app dir not found: %APP_DIR%
  exit /b 1
)

cd /d "%APP_DIR%"

set "PY_EXE="
set "PY_EXE_OVERRIDE=%HIHANGUL_PYTHON%"

if not "%PY_EXE_OVERRIDE%"=="" (
  if exist "%PY_EXE_OVERRIDE%" (
    set "PY_EXE=%PY_EXE_OVERRIDE%"
  )
)

if "%PY_EXE%"=="" (
  for /f "usebackq delims=" %%P in (`py -3 -c "import sys; print(sys.executable)" 2^>nul`) do (
    if exist "%%~P" set "PY_EXE=%%~P"
  )
)
if "%PY_EXE%"=="" (
  for /f "usebackq delims=" %%P in (`where python 2^>nul`) do (
    if exist "%%~P" (
      set "PY_EXE=%%~P"
      goto :py_found
    )
  )
)
if "%PY_EXE%"=="" (
  for %%P in (
    "%LocalAppData%\Programs\Python\Python313-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python312-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python311-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python310-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python313\python.exe"
    "%LocalAppData%\Programs\Python\Python312\python.exe"
    "%LocalAppData%\Programs\Python\Python311\python.exe"
    "%LocalAppData%\Programs\Python\Python310\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
  ) do (
    if exist %%~P (
      set "PY_EXE=%%~P"
      goto :py_found
    )
  )
)

:py_found
if "%PY_EXE%"=="" (
  echo [windows-brain] ERROR: Python launcher not found.
  echo [windows-brain] Set HIHANGUL_PYTHON to python.exe path, e.g.
  echo [windows-brain]   set HIHANGUL_PYTHON=C:\Users\%%USERNAME%%\AppData\Local\Programs\Python\Python311\python.exe
  echo [windows-brain] Or install Python from python.org and enable PATH.
  exit /b 1
)
echo [windows-brain] python: %PY_EXE%

set "VENV_PY=%APP_DIR%\.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
  if exist ".venv" (
    echo [windows-brain] broken .venv detected. recreating...
    rmdir /S /Q .venv
  )
  "%PY_EXE%" -m venv .venv
  if errorlevel 1 (
    echo [windows-brain] ERROR: failed to create .venv with "%PY_EXE%".
    exit /b 1
  )
)

set "PY_EXE=%VENV_PY%"
if not exist "%PY_EXE%" (
  echo [windows-brain] ERROR: venv python not found after recreate: %PY_EXE%
  exit /b 1
)

if not exist ".venv\.deps-ok" (
  echo [windows-brain] installing requirements...
  "%PY_EXE%" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [windows-brain] ERROR: pip install failed. Check network and requirements.
    exit /b 1
  )
  echo ok> .venv\.deps-ok
)
"%PY_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
