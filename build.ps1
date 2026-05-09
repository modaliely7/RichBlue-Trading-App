# ==============================================================================
#  build.ps1  -  RichBlue One-Click Windows Installer Builder
#  Run from the project root:  .\build.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Root       = $PSScriptRoot
$ApiDir     = Join-Path $Root "apps\api"
$DesktopDir = Join-Path $Root "apps\desktop"

function Header($msg) {
    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan
}

function Step($msg) { Write-Host "  >> $msg" -ForegroundColor Yellow }
function Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green  }
function Fail($msg) { Write-Host "  FAIL $msg" -ForegroundColor Red; exit 1 }

# -- 0. Pre-flight checks ------------------------------------------------------
Header "Pre-flight checks"

$PythonExe = Join-Path $ApiDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Fail "Python venv not found at $PythonExe. Please run: cd apps\api; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt"
}
Ok "Python venv found"

$NodeCheck = & node --version 2>&1
if ($LASTEXITCODE -ne 0) { Fail "Node.js is not installed or not in PATH" }
Ok "Node $NodeCheck found"

# -- 1. Install PyInstaller into venv ------------------------------------------
Header "Step 1/4 - Install PyInstaller into venv"

Step "Installing pyinstaller..."
& $PythonExe -m pip install pyinstaller --quiet --upgrade
if ($LASTEXITCODE -ne 0) { Fail "pip install pyinstaller failed" }
Ok "PyInstaller installed"

# -- 2. Build Python API -> dist/api/api.exe ------------------------------------
Header "Step 2/4 - Bundle Python API with PyInstaller"

Step "Running PyInstaller (this may take 2-5 minutes)..."
Push-Location $ApiDir
& $PythonExe -m PyInstaller api.spec --noconfirm --clean
$exitCode = $LASTEXITCODE
Pop-Location
if ($exitCode -ne 0) { Fail "PyInstaller build failed" }

$ApiExe = Join-Path $ApiDir "dist\api\api.exe"
if (-not (Test-Path $ApiExe)) { Fail "api.exe was not created at $ApiExe" }
Ok "api.exe built -> $ApiExe"

# -- 3. Install Node dependencies ----------------------------------------------
Header "Step 3/4 - Install Node dependencies"

Step "Running npm install at workspace root..."
Push-Location $Root
cmd /c "npm install --legacy-peer-deps"
$exitCode = $LASTEXITCODE
Pop-Location
if ($exitCode -ne 0) { Fail "npm install failed" }
Ok "Node modules installed"

# -- 4. Build React renderer + package with electron-builder -------------------
Header "Step 4/4 - Build Electron app + NSIS Installer"

Step "Building React renderer (Vite)..."
Push-Location $DesktopDir
cmd /c "npm run build:renderer"
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) { Pop-Location; Fail "Vite build failed" }
Ok "React renderer built"

Step "Packaging with electron-builder..."
cmd /c "npx electron-builder --win --config"
$exitCode = $LASTEXITCODE
Pop-Location
if ($exitCode -ne 0) { Fail "electron-builder failed" }

# -- Done ----------------------------------------------------------------------
$InstallerDir = Join-Path $Root "dist-installer"
$Installer = Get-ChildItem $InstallerDir -Filter "*.exe" -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like "*Setup*" } |
             Select-Object -First 1

Header "BUILD COMPLETE"
if ($Installer) {
    Ok "Installer: $($Installer.FullName)"
    Write-Host ""
    Write-Host "  -> Double-click the .exe to install RichBlue on this machine." -ForegroundColor White
    Write-Host "  -> Share the .exe with others for distribution." -ForegroundColor White
    Start-Process explorer.exe $InstallerDir
} else {
    Write-Host "  Installer created in: $InstallerDir" -ForegroundColor Green
}
Write-Host ""
