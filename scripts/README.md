# scripts/

Lifecycle helpers for the RichBlue Trading Journal dev stack.

| File | Purpose |
|---|---|
| `start.bat` | Start API + Electron. Idempotent (no-op if already running). |
| `stop.bat` | Stop API + Electron. Kills tracked PID + any orphan node/electron/python processes spawned by the app. |
| `restart.bat` | Stop, then start. |
| `status.bat` | Show whether the app is running, with matched PIDs. |
| `app.ps1` | Shared PowerShell module used by the `.bat` files. |

## Usage

```powershell
# From the repo root:
scripts\start
scripts\stop
scripts\restart
scripts\status
```

Or invoke the PowerShell module directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\app.ps1 start
```

## Notes

- `start` opens a new `cmd` window running `npm run dev`; the app logs appear in that window. Closing the window stops everything.
- `.app.pid` is written on start and removed on stop. The stop script also scans for any node/electron/python processes whose command line references this repo (handles orphans from crashed previous sessions).
- A `.gitignore` entry keeps `.app.pid` out of version control.
