# AGENTS.md — RichBlue Pro Analytics

## Repo structure

- **npm workspace monorepo** — `apps/api` (`@ta/api`), `apps/desktop` (`@ta/desktop`)
- `packages/shared` is empty (not used)
- `AI_INSTRUCTIONS.md` — critical architectural rules; read before modifying

## Architecture

- **Electron 37** wrapper with embedded **Python FastAPI** backend (subprocess managed by Electron's `main.cjs`)
- **Frontend**: React 19 + Vite 8 + TypeScript 6, TanStack Query, Chart.js, vanilla CSS
- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.x, SQLite, Alembic
- **Routing**: `HashRouter` everywhere (required for Electron file:// loading)
- **Vite config**: `base: './'` (required for Electron production)
- UI scaling uses `--ui-zoom` CSS variable on `<html>`

## Dev commands (run from repo root)

```powershell
# Start everything (API + Electron)
npm run dev

# Start only the desktop renderer + Electron
npm run dev:desktop

# Start only the API
npm run dev:api

# API alone (inside apps/api/)
npm -w @ta/api run dev                       # uvicorn on 127.0.0.1:8001

# Desktop alone (inside apps/desktop/)
npm -w @ta/desktop run dev:renderer           # Vite on port 5173
```

## API testing

Tests live in `apps/api/tests/`. They use FastAPI `TestClient` with a temp SQLite DB and override `db.engine`.

```powershell
$env:PYTHONPATH = '.'
pytest -q apps/api/tests
```

Only 6 test files exist (`test_cash_endpoints.py`, `test_egx_scraper.py`, etc.). No frontend tests.

## Build (Windows installer)

```powershell
.\build.ps1
```

Pipeline: PyInstaller (`api.spec`) → `npm install` → Vite build → electron-builder NSIS.

**Critical**: Fully close `RichBlue.exe` and `api.exe` before building — file locks cause `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`.

## API gotchas

- **Python venv** must be at `apps/api/.venv/` (not `.venv` at root)
- Backend uses **port 8001** (not 8000)
- `PAID_API_URL` / `PAID_API_KEY` env vars for optional paid data provider
- `TRADING_APP_DATABASE_URL` env var overrides default SQLite path (`apps/api/data/trading.db`)

## Python package notes

- `xlsxwriter` required for Excel exports
- `reportlab` uses `colors.HexColor` (case-sensitive — NOT `hexColor`)
- If adding new Python deps, update `requirements.txt` and verify PyInstaller compatibility
- New hidden imports must be added to `api.spec` `hiddenimports` list

## Desktop / Electron gotchas

- Electron main is CJS (`electron/main.cjs`). Preload is `electron/preload.cjs`.
- `contextIsolation: true`, `nodeIntegration: false`
- Window minimizes to tray on close (not quit). Use tray → Quit to fully exit.
- Electron starts API as subprocess and waits for `/health` (up to 30s)

## Style conventions

- `tsconfig.app.json`: `noUnusedLocals: true`, `noUnusedParameters: true`, `verbatimModuleSyntax: true`
- ESLint (flat config): `@eslint/js` recommended + `typescript-eslint` recommended + react-hooks + react-refresh
- No `any` by convention; all API types defined in `src/lib/api.ts`
- No CSS framework — vanilla CSS design system
