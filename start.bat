@echo off
title Scaleon Pazaryeri Yonetimi
cd /d "%~dp0"
start "" http://localhost:3000
node server.js
pause
