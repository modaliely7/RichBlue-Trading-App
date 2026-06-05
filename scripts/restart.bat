@echo off
REM Stop, then start RichBlue Trading Journal.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app.ps1" restart
