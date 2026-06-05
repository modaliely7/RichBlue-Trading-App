# AGENTS.md — RichBlue Trading Journal

## Repo structure

- **npm workspace monorepo** — `apps/api` (`@ta/api`), `apps/desktop` (`@ta/desktop`)
- `packages/shared` is empty (not used)
- `AI_INSTRUCTIONS.md` — critical architectural rules; read before modifying
- `scripts/` — lifecycle helpers (start / stop / restart / status) backed by `app.ps1`

## Architecture

- **Electron 37** wrapper with embedded **Python FastAPI** backend (subprocess managed by Electron's `main.cjs`)
- **Frontend**: React 19 + Vite 8 + TypeScript 6, TanStack Query, Chart.js, vanilla CSS
- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.x, SQLite, Alembic
- **Routing**: `HashRouter` everywhere (required for Electron file:// loading)
- **Vite config**: `base: './'` (required for Electron production)
- UI scaling uses `--ui-zoom` CSS variable on `<html>`

## Routes (frontend)

- `/` Dashboard · `/portfolio` Holdings · `/trades` Journal · `/trades/add` New trade
- `/calendar` Calendar · `/cash` Cash & Ledger · `/symbols` Symbols
- `/analytics` Analytics · `/reports` Reports
- `/strategies` Strategies · `/playbooks` Playbooks · `/insights` Behavior Insights
- `/psychology` Psychology log · `/lessons` Lessons · `/calculators` Calculators
- `/data` Data import/export · `/settings` Settings

## Lifecycle scripts (run from repo root)

```powershell
scripts\start       # start API + Electron in a new window; idempotent
scripts\stop        # kill tracked PID + orphan app processes
scripts\restart     # stop + start
scripts\status      # show running state + matched PIDs
```

Under the hood these invoke `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\app.ps1 <action>` and track the spawned PID in `scripts/.app.pid`.

## Raw dev commands (still supported)

```powershell
npm run dev                          # start everything (API + Electron)
npm run dev:desktop                  # renderer + Electron only
npm run dev:api                      # API only

# API alone (inside apps/api/)
npm -w @ta/api run dev               # uvicorn on 127.0.0.1:8001

# Desktop alone (inside apps/desktop/)
npm -w @ta/desktop run dev:renderer  # Vite on port 5173
```

## API testing

```powershell
$env:PYTHONPATH = '.'
pytest -q apps/api/tests              # 61 tests, 8 files
```

Tests use FastAPI `TestClient` with a temp SQLite DB and override `db.engine`. No frontend tests.

## Build (Windows installer)

```powershell
.\build.ps1
```

Pipeline: PyInstaller (`api.spec`) → `npm install` → Vite build → electron-builder NSIS.

**Critical**: Fully close `RichBlue.exe` and `api.exe` (and any `node` / `electron.exe` / `python.exe` from the project) before building — file locks cause `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`. Use `scripts\stop` first.

## Trade lifecycle contract

- **Open trade** (`exit_price = NULL`): editable, deletable, can be closed via `POST /trades/{id}/close`.
- **Closed trade** (`exit_price` set): **immediately immutable** — `PATCH` / `DELETE` / `POST /close` all return **409 Conflict**. There is no grace period.
- Closing a trade is the "Trade Review": it requires `process_grade` (1-5), `r_multiple_grade` (1-5), `exit_price`, `exit_date`. Optional `exit_fees`, `lessons_learned`, `notes`.
- The `CloseTradeModal` in `apps/desktop/src/pages/JournalPage.tsx` enforces this on the frontend.

## Behavior engine

`apps/api/app/insights.py` runs rule-based analysis on closed trades and returns breakdowns + insights via `GET /insights?account_id=`. The frontend renders them on the `/insights` page. Sample-size thresholds: `MIN_SAMPLE=3`, `STRONG_SAMPLE=5`. Deterministic — no LLM.

## API gotchas

- **Python venv** must be at `apps/api/.venv/` (not `.venv` at root)
- Backend uses **port 8001** (not 8000)
- `PAID_API_URL` / `PAID_API_KEY` env vars for optional paid data provider
- `TRADING_APP_DATABASE_URL` env var overrides default SQLite path (`apps/api/data/trading.db`)
- Market data fetcher caches quotes (15min in market hours, 24h otherwise). yfinance via `.CA` suffix for EGX stocks.

## Python package notes

- `xlsxwriter` required for Excel exports
- `reportlab` uses `colors.HexColor` (case-sensitive — NOT `hexColor`)
- If adding new Python deps, update `requirements.txt` and verify PyInstaller compatibility
- New hidden imports must be added to `api.spec` `hiddenimports` list. Current list includes `market_data`, `playbooks`, `insights` routers.
- `datetime.datetime.utcnow()` is deprecated in Python 3.13 — prefer `datetime.now(UTC)`. Scheduler still has warnings; tracked separately.

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
- No comments in source unless asked
- Prefer derived state over `useState` + `useEffect` sync (the `react-hooks/set-state-in-effect` lint rule is strict)

