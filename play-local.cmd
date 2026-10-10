@echo off
rem Local test on Windows: starts the game server in its own window and opens the game in the default browser.
rem The game is made of JavaScript modules, and browsers do not load those from a file opened by double-click.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is needed to run the game locally.
  pause
  exit /b 1
)
start "Raindrop Derby server - close this window to stop it" node tools\serve.mjs
rem Give the server a second to start listening.
ping -n 2 127.0.0.1 >nul
start "" "http://localhost:8090/raindrop-derby/"
