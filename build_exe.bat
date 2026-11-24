@echo off
cd /d "%~dp0"
python -m pip install pyinstaller
python -m PyInstaller --onefile --name RSIM-Dash server.py
copy /y cars.json dist\ >nul
xcopy /e /i /y web dist\web >nul
echo.
echo Termine : dist\RSIM-Dash.exe (garde le dossier web et cars.json a cote)
pause
