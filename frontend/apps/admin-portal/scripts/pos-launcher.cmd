@echo off
rem AAHAR POS launcher. Opens the POS in its own window and passes this computer's name, so the
rem till sets itself up without typing (lib/pos-launch.ts). Copy it to each till - by Group
rem Policy, say - and pin a shortcut to it. The name is only a convenience: anyone can edit it,
rem just as anyone can type another name in the POS gate.
rem
rem   pos-launcher.cmd                                   - this PC's local dev server
rem   pos-launcher.cmd https://portal.example.com/fandb  - the portal at that address

set "AAHAR_URL=http://localhost:3000/fandb"
if not "%~1"=="" set "AAHAR_URL=%~1"

rem Chrome where installed, else Edge (on every Windows). Both register with Windows, so neither
rem needs a full path.
set "BROWSER=msedge"
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && set "BROWSER=chrome"
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>&1 && set "BROWSER=chrome"

start "" %BROWSER% --app="%AAHAR_URL%/pos/billing?pc=%COMPUTERNAME%"
