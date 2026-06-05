@echo off
REM Stop RichBlue Trading Journal. Kills tracked PID + orphan app processes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app.ps1" stop
