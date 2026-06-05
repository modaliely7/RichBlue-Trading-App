# Roadmap: RichBlue Trading Journal

## Milestone: v2.0 — Closing the Core (complete)

The original 4-phase GSD plan was superseded by a 6-phase design that delivers test coverage, the design system, market data + reports, playbooks, the behavior engine, and trade review + immutability. All phases shipped to `feature/phase-6-market-data-reports`.

## Phases

- [x] **Phase 1: Test Coverage Foundation** — endpoint + calculator + scraper tests (W1-W3)
- [x] **Phase 2: Theme2 Design System** — Indigo/Emerald/Rose/Amber tokens, Inter font, Lucide icons, sidebar/side-panel layout (W4-W11)
- [x] **Phase 3: Hold-Trades Reporting & Tax** — realized vs unrealized, tax export, monthly digest, EOD scheduler (W12-W17, S1)
- [x] **Phase 4: S1 Split** — REPORTS route + Hold-trades refactor
- [x] **Phase 5: Market Data & Reports** — yfinance EGX catalog, TTL cache, 5 reports endpoints, Refresh/OnOpen/EOD scheduling
- [x] **Phase 6: Playbook + Trade Planning** — Playbook/PlaybookSetup models, 9 CRUD endpoints, `PlaybooksPage` UI, pre-trade plan fields
- [x] **Phase 7: Hybrid Behavior Engine** — rule-based insights, 7 insight categories, `InsightsPage` dashboard
- [x] **Phase 8: Trade Review + Immutability** — closed trades immediately 409, `POST /trades/{id}/close` with required grades, `CloseTradeModal`
- [x] **Phase 9: Lifecycle Scripts** — `scripts/start|stop|restart|status` backed by `app.ps1` with PID + orphan scan

## Test summary

- **61 pytest cases** across 8 files in `apps/api/tests/`
- Test command: `$env:PYTHONPATH='.'; & apps/api/.venv/Scripts/python.exe -m pytest -q apps/api/tests`
- Last run: **61 passed**

## Build / release

- `.\build.ps1` pipeline: PyInstaller (`api.spec`) → `npm install` → Vite build → electron-builder NSIS
- `api.spec` `hiddenimports`: `market_data`, `playbooks`, `insights` routers
- Alembic head: `e5a7b2c8d9f1` (chain `c1f0a2b3d4e5` → `d2e1f3a4b5c6` → `e5a7b2c8d9f1`)

## Outstanding (post-milestone)

None blocking v2.0. Candidate next milestones:
- **v2.1: CI + Backup/Restore** — GitHub Actions (lint, typecheck, pytest), Settings-page backup/restore/wipe
- **v2.1: Multi-provider Market Data** — paid provider fallback, TradingView scraping (deferred from Phase 5)
- **v2.1: Frontend tests** — Vitest + React Testing Library for journal/playbook/insights flows
- **v2.1: README rebuild** — full api+desktop setup, scripts/ usage, build/install instructions

