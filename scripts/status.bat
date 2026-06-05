@echo off
REM Show whether the app is running, with matched PIDs.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app.ps1" status
