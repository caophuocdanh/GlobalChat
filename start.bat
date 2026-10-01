@echo off
title GLOBAL CHAT SERVER
cd /d "%~dp0"
echo ====================================================
echo             KHOI DONG GLOBAL CHAT
echo ====================================================
echo Dang khoi chay may chu Node.js...
start http://localhost:3000
node server.js
pause
