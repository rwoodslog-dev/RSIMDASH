@echo off
cd /d "%~dp0"
where python >NUL 2>&1
if errorlevel 1 (
  echo Python introuvable : installe Python 3 depuis python.org en cochant "Add python.exe to PATH"
  pause
  exit /b
)
python server.py %*
pause
