# RichBlue Trading Platform - One-Click Packaging Script
# This script bundles the FastAPI backend (using PyInstaller) and the Vite frontend (into a dist)
# Note: For a true "single .exe", you would typically use Electron or a similar wrapper.
# This script prepares the files for that or for manual distribution.

$ProjectRoot = Get-Location
$ApiDir = "$ProjectRoot\apps\api"
$DesktopDir = "$ProjectRoot\apps\desktop"
$OutputDir = "$ProjectRoot\release"

Write-Host "--- Starting Packaging Process ---" -ForegroundColor Cyan

# 1. Create Release Directory
if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }
New-Item -ItemType Directory -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\backend" | Out-Null

# 2. Build Frontend
Write-Host "Building Frontend..." -ForegroundColor Yellow
Set-Location $DesktopDir
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit }
Copy-Item -Recurse -Force "dist" "$OutputDir\frontend"

# 3. Build Backend (PyInstaller)
Write-Host "Building Backend (PyInstaller)..." -ForegroundColor Yellow
Set-Location $ApiDir
# Ensure pyinstaller is installed: pip install pyinstaller
# We bundle into a single directory for speed, or --onefile for a single exe
# We must include the database initialization and any static assets
pyinstaller --noconfirm --onedir --console --name "richblue-api" `
    --add-data "app;app" `
    "app\main.py"

if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit }
Copy-Item -Recurse -Force "dist\richblue-api" "$OutputDir\backend"

# 4. Create Launcher Script
Write-Host "Creating Launcher..." -ForegroundColor Yellow
$LauncherContent = @"
@echo off
start /b "" "backend\richblue-api\richblue-api.exe"
start "" "frontend\index.html"
echo RichBlue Trading Platform is starting...
pause
"@
$LauncherContent | Out-File -FilePath "$OutputDir\LaunchRichBlue.bat" -Encoding ascii

Set-Location $ProjectRoot
Write-Host "--- Packaging Complete! ---" -ForegroundColor Green
Write-Host "Files are located in: $OutputDir"
Write-Host "To run the app, use LaunchRichBlue.bat"
