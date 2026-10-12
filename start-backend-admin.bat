@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process python -ArgumentList 'backend\server.py' -WorkingDirectory '%~dp0' -Verb RunAs"
