@echo off
setlocal EnableExtensions

set "APP_DIR=C:\dev\hihangul\apps\windows-agent"
if not "%~1"=="" set "APP_DIR=%~1"

if not exist "%APP_DIR%" (
  echo [windows-agent] ERROR: app dir not found: %APP_DIR%
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
      echo "%%~P" | findstr /I "WindowsApps" >nul
      if errorlevel 1 (
        set "PY_EXE=%%~P"
        goto :py_found
      )
    )
  )
)
if "%PY_EXE%"=="" (
  for %%P in (
    "%LocalAppData%\Programs\Python\Python313\python.exe"
    "%LocalAppData%\Programs\Python\Python312\python.exe"
    "%LocalAppData%\Programs\Python\Python311\python.exe"
    "%LocalAppData%\Programs\Python\Python310\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "%LocalAppData%\Programs\Python\Python313-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python312-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python311-arm64\python.exe"
    "%LocalAppData%\Programs\Python\Python310-arm64\python.exe"
  ) do (
    if exist %%~P (
      set "PY_EXE=%%~P"
      goto :py_found
    )
  )
)

:py_found
if "%PY_EXE%"=="" (
  echo [windows-agent] ERROR: Python launcher not found.
  echo [windows-agent] Set HIHANGUL_PYTHON to python.exe path, e.g.
  echo [windows-agent]   set HIHANGUL_PYTHON=C:\Users\%%USERNAME%%\AppData\Local\Programs\Python\Python311\python.exe
  echo [windows-agent] Or install Python from python.org and enable PATH.
  exit /b 1
)
echo [windows-agent] python: %PY_EXE%

if /I "%HIHANGUL_ENABLE_PRECISE_LAYOUT%"=="1" (
  set "PY_MACHINE="
  for /f "usebackq delims=" %%M in (`"%PY_EXE%" -c "import platform; print(platform.machine())" 2^>nul`) do (
    if not defined PY_MACHINE set "PY_MACHINE=%%M"
  )
  if /I "%PY_MACHINE%"=="ARM64" (
    echo [windows-agent] precise mode requires x64 python. current machine=%PY_MACHINE%
    call :pick_x64_python
    if not defined PY_EXE (
      echo [windows-agent] ERROR: x64 python not found for precise mode.
      echo [windows-agent] Install Python x64 and set HIHANGUL_PYTHON to that path.
      exit /b 1
    )
    echo [windows-agent] switched to x64 python: %PY_EXE%
  )
)

set "VENV_PY=%APP_DIR%\.venv\Scripts\python.exe"
if exist "%VENV_PY%" (
  "%VENV_PY%" -V >nul 2>nul
  if errorlevel 1 (
    echo [windows-agent] broken .venv detected ^(invalid base python^). recreating...
    rmdir /S /Q .venv
  )
)
if /I "%HIHANGUL_ENABLE_PRECISE_LAYOUT%"=="1" (
  if exist "%VENV_PY%" (
    set "VENV_MACHINE="
    for /f "usebackq delims=" %%M in (`"%VENV_PY%" -c "import platform; print(platform.machine())" 2^>nul`) do (
      if not defined VENV_MACHINE set "VENV_MACHINE=%%M"
    )
    if /I "%VENV_MACHINE%"=="ARM64" (
      echo [windows-agent] precise mode: ARM64 venv detected. recreating venv with x64 python.
      rmdir /S /Q .venv
    )
  )
)

if not exist "%VENV_PY%" (
  if exist ".venv" (
    echo [windows-agent] broken .venv detected. recreating...
    rmdir /S /Q .venv
  )
  "%PY_EXE%" -m venv .venv
  if errorlevel 1 (
    echo [windows-agent] ERROR: failed to create .venv with "%PY_EXE%".
    exit /b 1
  )
)

set "PY_EXE=%VENV_PY%"
if not exist "%PY_EXE%" (
  echo [windows-agent] ERROR: venv python not found after recreate: %PY_EXE%
  exit /b 1
)

set "REQ_HASH="
for /f "delims=" %%H in ('certutil -hashfile requirements.txt SHA256 ^| findstr /R /I "^[0-9A-F][0-9A-F]"') do (
  if not defined REQ_HASH set "REQ_HASH=%%H"
)
set "REQ_HASH=%REQ_HASH: =%"
set "OLD_REQ_HASH="
if exist ".venv\.deps-hash" set /p OLD_REQ_HASH=<".venv\.deps-hash"
set "INSTALL_DEPS=0"
if not exist ".venv\.deps-ok" set "INSTALL_DEPS=1"
if "%REQ_HASH%"=="" set "INSTALL_DEPS=1"
if /I not "%REQ_HASH%"=="%OLD_REQ_HASH%" set "INSTALL_DEPS=1"

if "%INSTALL_DEPS%"=="1" (
  echo [windows-agent] installing requirements...
  "%PY_EXE%" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [windows-agent] ERROR: pip install failed. Check network and requirements.
    exit /b 1
  )
  echo ok> .venv\.deps-ok
  > ".venv\.deps-hash" echo %REQ_HASH%
)

if /I "%HIHANGUL_ENABLE_PRECISE_LAYOUT%"=="1" (
  echo [windows-agent] precise layout mode requested. installing optional deps...
  "%PY_EXE%" -m pip install --upgrade "pip==26.0.1"
  if errorlevel 1 (
    echo [windows-agent] ERROR: failed to pin pip==26.0.1
    exit /b 1
  )
  "%PY_EXE%" -m pip install pdfminer.six==20231228
  if errorlevel 1 (
    echo [windows-agent] ERROR: failed to install pdfminer.six for precise layout mode.
    echo [windows-agent] Hints:
    echo [windows-agent] - Check network / package index access.
    echo [windows-agent] - Try x64 Python and set HIHANGUL_PYTHON to that interpreter.
    echo [windows-agent] - Or disable precise mode: set HIHANGUL_ENABLE_PRECISE_LAYOUT=0
    exit /b 1
  )
  "%PY_EXE%" -m pip install --prefer-binary --only-binary=:all: pymupdf==1.27.1 >nul 2>nul
  if errorlevel 1 (
    echo [windows-agent] note: PyMuPDF unavailable. using pdfminer precise fallback.
  ) else (
    echo [windows-agent] precise layout optional dependencies installed: PyMuPDF plus pdfminer.
  )
)
"%PY_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
goto :eof

:pick_x64_python
set "PY_EXE="
for %%P in (
  "%LocalAppData%\Programs\Python\Python313\python.exe"
  "%LocalAppData%\Programs\Python\Python312\python.exe"
  "%LocalAppData%\Programs\Python\Python311\python.exe"
  "%LocalAppData%\Programs\Python\Python310\python.exe"
  "C:\Python313\python.exe"
  "C:\Python312\python.exe"
  "C:\Python311\python.exe"
  "C:\Python310\python.exe"
) do (
  if exist "%%~P" (
    set "PY_EXE=%%~P"
    goto :eof
  )
)
goto :eof
