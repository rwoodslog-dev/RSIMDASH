@echo off
chcp 65001 >NUL
cd /d "%~dp0"
set "DIR=%~dp0"
echo.
echo  === RSIM Dash : creation des raccourcis ===
echo.

rem 1) Raccourci bureau "RSIM Dash" (lance le serveur, fenetre reduite)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop');" ^
  "$s=$w.CreateShortcut($d+'\RSIM Dash.lnk'); $s.TargetPath='%DIR%start.bat'; $s.WorkingDirectory='%DIR%';" ^
  "$s.IconLocation='%DIR%rsim.ico'; $s.WindowStyle=7; $s.Description='Lancer RSIM Dash'; $s.Save();" ^
  "$u=$d+'\RSIM Dash Panneau.url'; Set-Content -Path $u -Encoding ASCII -Value @('[InternetShortcut]','URL=http://localhost:8888/hub','IconIndex=0','IconFile=%DIR%rsim.ico')"
if errorlevel 1 (
  echo  ! Echec de la creation des raccourcis.
) else (
  echo  OK : "RSIM Dash" - lance tout et ouvre le panneau - et "RSIM Dash Panneau" sont sur le bureau.
)

rem 2) Option : demarrage automatique avec Windows
echo.
set /p AUTO=" Lancer RSIM Dash automatiquement au demarrage de Windows ? (O/N) : "
if /i "%AUTO%"=="O" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$w=New-Object -ComObject WScript.Shell; $p=[Environment]::GetFolderPath('Startup')+'\RSIM Dash.lnk';" ^
    "$s=$w.CreateShortcut($p); $s.TargetPath='%DIR%start.bat'; $s.Arguments='--no-browser'; $s.WorkingDirectory='%DIR%'; $s.IconLocation='%DIR%rsim.ico'; $s.WindowStyle=7; $s.Save()"
  echo  OK : RSIM Dash se lancera tout seul, fenetre reduite, a chaque demarrage.
) else (
  echo  Pas de demarrage automatique.
)
echo.
pause
