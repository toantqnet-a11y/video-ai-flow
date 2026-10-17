@echo off
REM R0-01: double-click friendly wrapper; avoid changing execution policy globally.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-Windows.ps1" -Mode start
if errorlevel 1 (
  echo ContentStudio failed to start. Review the error code above.
  pause
)
