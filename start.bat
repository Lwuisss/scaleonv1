@echo off
rem Windows Hello (geçiş anahtarı) için sayfa http://localhost üzerinden açılmalı.
start "" http://localhost:8000
python -m http.server 8000 || py -m http.server 8000
