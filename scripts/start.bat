@echo off
REM Start RichBlue Trading Journal (API + Electron).
REM Idempotent: no-op if already running.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app.ps1" start
