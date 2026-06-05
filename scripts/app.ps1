# scripts/app.ps1
# RichBlue Trading Journal — lifecycle helper.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\app.ps1 start
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\app.ps1 stop
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\app.ps1 restart
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\app.ps1 status

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start","stop","restart","status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$PidFile   = Join-Path $ScriptDir ".app.pid"

function Get-TrackedPid {
    if (-not (Test-Path $PidFile)) { return $null }
    $p = (Get-Content $PidFile -Raw).Trim()
    if ($p -match '^\d+$') { return [int]$p }
    return $null
}

function Test-AppRunning {
    $tracked = Get-TrackedPid
    if ($tracked -and (Get-Process -Id $tracked -ErrorAction SilentlyContinue)) {
        return $tracked
    }
    return $null
}

function Get-AppProcessTree {
    $root = $RepoRoot.Replace('\','\\')
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='electron.exe' or Name='python.exe'" |
        Where-Object {
            $cmd = $_.CommandLine
            if (-not $cmd) { return $false }
            if ($cmd -match $root) { return $true }
            if ($cmd -match '\.venv\\Scripts\\python') { return $true }
            if ($cmd -match 'concurrently' -and $cmd -match 'npm') { return $true }
            return $false
        }
    return $procs
}

function Stop-App {
    $running = Test-AppRunning
    if (-not $running) {
        Write-Host "No tracked app process found. Scanning for orphan app processes..."
    } else {
        Write-Host "Stopping tracked process tree (PID $running)..."
        try {
            Stop-Process -Id $running -Force -ErrorAction SilentlyContinue
        } catch {}
    }

    $orphans = Get-AppProcessTree
    if ($orphans) {
        Write-Host ("Killing {0} orphan app process(es)..." -f $orphans.Count)
        foreach ($p in $orphans) {
            Write-Host ("  - PID {0}  {1}" -f $p.ProcessId, ($p.Name))
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }

    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force
    }

    Start-Sleep -Milliseconds 500
    $stillRunning = Get-AppProcessTree
    if ($stillRunning) {
        Write-Host ("WARNING: {0} process(es) still running." -f $stillRunning.Count)
        return $false
    }
    Write-Host "App stopped."
    return $true
}

function Start-App {
    $existing = Test-AppRunning
    if ($existing) {
        Write-Host ("App already running (PID {0}). Use 'restart' to reload." -f $existing)
        return
    }
    if (Test-Path $PidFile) {
        Remove-Item $PidFile -Force
    }

    Write-Host "Starting RichBlue Trading Journal in a new window..."
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c","cd /d `"$RepoRoot`" && npm run dev" `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Normal `
        -PassThru

    $proc.Id | Out-File -FilePath $PidFile -Encoding ascii -NoNewline
    Write-Host ("App launched. Tracking PID {0}." -f $proc.Id)
    Write-Host "Close the spawned cmd window to stop the dev servers, or run scripts\stop.bat."
}

function Get-Status {
    $tracked = Get-TrackedPid
    $running = Test-AppRunning
    $tree = Get-AppProcessTree
    Write-Host "Repo root:        $RepoRoot"
    Write-Host "Tracked PID file: $(if (Test-Path $PidFile) { $PidFile } else { '<missing>' })"
    if ($tracked) {
        Write-Host ("Tracked PID:      {0}" -f $tracked)
    } else {
        Write-Host "Tracked PID:      <none>"
    }
    if ($running) {
        Write-Host ("Status:           RUNNING (tracked PID {0})" -f $running)
    } elseif ($tree) {
        Write-Host ("Status:           RUNNING (untracked, {0} process(es) match repo)" -f $tree.Count)
    } else {
        Write-Host "Status:           STOPPED"
    }
    if ($tree) {
        Write-Host "Matched processes:"
        foreach ($p in $tree) {
            $cmdShort = ($p.CommandLine -replace '^.*?\\','') -replace '\s+',' '
            if ($cmdShort.Length -gt 80) { $cmdShort = $cmdShort.Substring(0,77) + '...' }
            Write-Host ("  - PID {0,6}  {1,-12}  {2}" -f $p.ProcessId, $p.Name, $cmdShort)
        }
    }
}

switch ($Action) {
    "start"   { Start-App }
    "stop"    { $null = Stop-App }
    "restart" {
        Write-Host "Restarting app..."
        $null = Stop-App
        Start-Sleep -Seconds 1
        Start-App
    }
    "status"  { Get-Status }
}
