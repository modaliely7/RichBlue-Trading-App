# RichBlue Trading Journal

## What This Is

A desktop trading journal for retail traders to log, analyze, and improve their performance. Features trade entry with strategy tagging, portfolio dashboard with KPIs and charts, performance analytics, technical/fundamental/smart-money analysis, AI-powered psychology coaching, cash management, and trading calculators — all running locally via an Electron shell over a Python FastAPI backend with SQLite storage.

## Core Value

Traders can log every trade with context (strategy, SL/TP, screenshots, tags) and get actionable insights from their history — what works, what doesn't, and why — without sending data to any cloud service.

## Requirements

### Validated

- Trade CRUD with strategy association, stop-loss/take-profit, and screenshot upload
- Dashboard portfolio KPIs (PnL, win rate, avg RR, free cash) with equity curve, diversification, and asset mix charts
- Performance analytics by day-of-week, hour-of-day, strategy, tags, and date range
- Calendar heatmap with daily PnL and day-detail drill-down
- Technical analysis page with 0-100 scoring, trend/momentum/volatility panels, buy/sell signals
- Stock fundamentals engine (market cap, P/E, EPS, D/E, growth/profitability, valuation panels)
- Smart Money & Quant page (VWAP, RVOL, CMF, breakout probability)
- AI Coach / Psychology page with emotion tracking, strategy summary, and insight cards
- Cash management (deposits/withdrawals, running balance)
- Trading calculators (Kelly Criterion, Risk of Ruin, Advanced Position Sizer, Scenario Simulator)
- Portfolio page with asset-class breakdown and positions table
- Symbols browser with statistics and trade history
- Settings (account switching, strategy setup, display scaling, theme, data management)
- EGX Exchange scraper with fallback scrapers for Egyptian stocks
- Excel export (xlsxwriter) and PDF export (reportlab)
- CSV import/export for trades
- Account isolation (Real vs Testing)
- PyInstaller + electron-builder Windows installer build pipeline

### Active

- [ ] **TEST-01**: Expand test coverage beyond current 6 test files (backend endpoints, scrapers, calculations)
- [ ] **T2D-01**: Implement Theme2 design system (dark theme variant with updated color palette and layout)
- [ ] **QUAL-01**: Add CI/CD pipeline for automated testing on PRs
- [ ] **DATA-01**: Implement working data backup/restore (currently placeholder in settings)
- [ ] **AI-01**: Enhance AI Coach with LLM-powered trade reviews and pattern recognition
- [ ] **DOC-01**: Document all API endpoints and key frontend components

### Out of Scope

- Cloud/multi-user sync — local-first by design; no server deployment
- Broker API integration (auto-fill trades) — regulatory complexity, manual entry is deliberate for review
- Mobile app — desktop-only; Electron ensures native file access and local DB
- Real-time market data streaming — uses on-demand pull scraping and paid API

## Context

Built by a solo retail trader for personal use, then generalized. The app name "RichBlue" appears in build artifacts and the main Electron window. The codebase started as a Python-only tool and grew into a full Electron+React+FastAPI stack. The existing `AI_INSTRUCTIONS.md` captures critical gotchas from past fixes (PyInstaller compatibility, reportlab case-sensitivity, base path for Vite builds). Graphify analysis found 70 code communities with good separation but 184 "orphan" components — indicating thin or missing documentation for many UI components. Theme2 design concept exists in the media/ directory but hasn't been coded. Test coverage is minimal (6 files).

## Constraints

- **Tech stack**: Python 3.13, FastAPI, SQLAlchemy 2.x, SQLite (backend); Electron 37, React 19, Vite 8, TypeScript 6, Chart.js (frontend)
- **Build**: PyInstaller for backend binary; electron-builder NSIS for Windows installer — both must remain compatible
- **Electron**: HashRouter, base: './', contextIsolation: true, nodeIntegration: false
- **File locks**: Must fully close app before building (ERR_ELECTRON_BUILDER_CANNOT_EXECUTE)
- **Python venv**: Must be at apps/api/.venv/ (not root)
- **Port**: Backend uses port 8001 (not 8000)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron + FastAPI (not Tauri) | Python backend needed for scraping/analysis; Electron provides familiar desktop shell | ✓ Good |
| SQLite local DB | No cloud dependency; portable single-file storage | ✓ Good |
| Manual trade entry | Deliberate friction forces trader to review each trade | ✓ Good |
| EGX scraper first | Primary market of the user | ✓ Good |
| PyInstaller + electron-builder | Single EXE distribution without requiring Python runtime | ✓ Good |

---
*Last updated: 2026-06-03 after GSD project initialization*
