@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
set "OMAHA_GH_EXE=%~dp0.local-wiki\tools\github-cli\bin\gh.exe"
echo Running local checks only. GitHub login is not required.
"C:\Program Files\nodejs\node.exe" scripts\publish-wiki.mjs --dry-run
set "CHECK_EXIT=%ERRORLEVEL%"
pause
exit /b %CHECK_EXIT%
