@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
set "OMAHA_GH_EXE=%~dp0.local-wiki\tools\github-cli\bin\gh.exe"
if not exist "%OMAHA_GH_EXE%" (
  echo Portable GitHub CLI is missing: "%OMAHA_GH_EXE%"
  pause
  exit /b 1
)
"%OMAHA_GH_EXE%" --version >nul
if errorlevel 1 (
  echo The portable GitHub CLI could not start. Nothing was uploaded.
  pause
  exit /b 1
)
echo Publishing Omaha by Night from Player Wiki only...
"C:\Program Files\nodejs\node.exe" scripts\publish-wiki.mjs
set "PUBLISH_EXIT=%ERRORLEVEL%"
if not "%PUBLISH_EXIT%"=="0" (
  echo.
  echo Publishing did not complete. Read the error above.
) else (
  echo.
  echo Your public wiki is updated.
)
pause
exit /b %PUBLISH_EXIT%
