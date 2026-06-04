# Codebase Issues — RichBlue Trading Journal

**Audit date:** 2026-06-04
**Scope:** Full codebase (apps/api, apps/desktop, config)
**Total issues:** 47

---

## CRITICAL (will crash or produce wrong results) — 13 issues

### C1. Duplicate `/cash/dividend` route
- **File:** `apps/api/app/main.py:635` and `main.py:1068`
- **Detail:** Two handlers registered for `POST /cash/dividend`. First (`record_dividend`, line 635) supports stock dividends via `is_stock_dividend` flag. Second (`add_dividend`, line 1068) ignores that flag entirely. FastAPI uses the last registered handler, so `record_dividend` is dead code — stock dividend feature is broken.
- **Fix:** Remove the second handler (line 1068-1083). Keep `record_dividend` which has full stock dividend support.

### C2. Duplicate `/health` route
- **File:** `apps/api/app/main.py:166` and `main.py:1888`
- **Detail:** First handler returns `{"ok": True, "ts": ...}`. Second returns `{"status": "ok"}`. Electron main process polls `/health` for startup detection. If it expects `ok` key, the second registration overrides the first and Electron may fail to detect API readiness.
- **Fix:** Remove the second handler (line 1888-1890). Keep the first which includes timestamp.

### C3. PDF report PnL coloring reads wrong column
- **File:** `apps/api/app/main.py:545-554`
- **Detail:** Table header is `["Symbol", "Entry", "Exit", "PnL", "Strategies"]` (indices 0-4). Coloring code does `pnl_val = float(row_data[4])` which reads the **Strategies** column (a string like "Momentum, Breakout"), not PnL (index 3). `float()` on the string fails, bare `except: pass` silently swallows it — PnL cells are never colored.
- **Fix:** Change `row_data[4]` to `row_data[3]` on line 548.

### C4. `create_account` ignores user's `account_type`
- **File:** `apps/api/app/main.py:196`
- **Detail:** `acc = Account(name=req.name, account_type=AccountType.real)` — `req.account_type` from `AccountCreate` is completely ignored. Every account is created as `Real` regardless of user request.
- **Fix:** Change to `account_type=req.account_type`.

### C5. `ta` library missing from requirements.txt
- **File:** `apps/api/requirements.txt`
- **Detail:** `engine_quant.py` and `engine_technicals.py` both `import ta` at module level. `ta` is not listed in requirements.txt. Fresh `pip install -r requirements.txt` will NOT install it, causing `ModuleNotFoundError` on any smart-money or technical analysis endpoint.
- **Fix:** Add `ta` to requirements.txt.

### C6. `app.scoring` and `app.simulator` missing from api.spec hidden imports
- **File:** `apps/api/api.spec:57-68`
- **Detail:** `app.scoring` is imported dynamically in `main.py` (lines 1340, 1422, 1443). `app.simulator` is imported dynamically (line 2730). Neither is in the `hidden_imports` list. PyInstaller may not detect these dynamic imports — stock score and simulation endpoints will crash in the frozen exe.
- **Fix:** Add `"app.scoring"` and `"app.simulator"` to the `hidden_imports` list.

### C7. `test_portfolio_math.py` completely broken
- **File:** `apps/api/tests/test_portfolio_math.py`
- **Detail:** (a) Line 12 imports `TradeType` which was removed from `models.py` — `ImportError` crash. (b) Line 57 calls `pm.realized_pnl_cumulative_through(trades, as_of)` with 2 args, but the function requires 3: `(trades, txs, as_of_day)` — `TypeError` crash. (c) All tests pass `trade_type=TradeType.long` to `SimpleTrade`, which also fails.
- **Fix:** Remove `TradeType` import, remove `trade_type` kwargs, add `txs` argument to the call on line 57.

### C8. Dead code with undefined variables
- **File:** `apps/api/app/main.py:1675`
- **Detail:** After `return` at line 1672 inside `_compute_smart_money()`, there is a stray `return _refresh_fundamentals(s, sym)`. This is unreachable AND `s` and `sym` are not in scope (the function has no `session` parameter). Dead code from a bad merge/copy.
- **Fix:** Delete line 1675.

### C9. N+1 queries in `list_trades`
- **File:** `apps/api/app/main.py:672-680`
- **Detail:** The query does not use `.options(selectinload(Trade.strategies))`, but `_to_trade_read(t)` at line 680 accesses `t.strategies`. This triggers lazy loading for every trade — 201 DB queries for 200 trades. Compare to line 508 which correctly uses `selectinload`.
- **Fix:** Add `.options(selectinload(Trade.strategies))` to the query.

### C10. `StrategySelect.tsx` undefined `filtered` variable
- **File:** `apps/desktop/src/components/StrategySelect.tsx:30,77`
- **Detail:** `filtered` is used on line 30 (`filtered.map(...)`) and line 77 (`filtered.length === 0`) but is never defined. Should be derived from `allStrategies` and `query`. Component crashes at render.
- **Fix:** Add `const filtered = query ? allStrategies.filter(s => s.name.toLowerCase().includes(query.toLowerCase())) : allStrategies` before line 30.

### C11. Orphaned pages — no routes, no sidebar links
- **Files:** `apps/desktop/src/pages/PsychologyPage.tsx`, `LessonsPage.tsx`, `QuantPage.tsx`
- **Detail:** These three page components exist but are not imported in `App.tsx` and have no sidebar links in `Sidebar.tsx`. They are unreachable dead code.
- **Fix:** Either add routes + sidebar links, or delete the files if not needed.

### C12. `concurrently` missing from root package.json
- **File:** `package.json`
- **Detail:** Root `dev` script uses `concurrently` but it's only listed in `apps/desktop/package.json` devDependencies. Running `npm run dev` from root on a clean install fails with `concurrently: command not found`.
- **Fix:** Add `concurrently` to root `devDependencies`.

### C13. `@tanstack/react-query` in devDependencies
- **File:** `apps/desktop/package.json:69`
- **Detail:** `@tanstack/react-query` is listed under `devDependencies` but imported in 20+ `.tsx` files at runtime. Vite bundles it fine, but this is semantically wrong and misleading.
- **Fix:** Move `@tanstack/react-query` from `devDependencies` to `dependencies`.

---

## WARNING (subtle problems) — 17 issues

### W1. Deprecated `datetime.utcnow()` used throughout (32+ locations)
- **Files:** `models.py` (14 places), `main.py` (7 places), `scoring.py` (1), `data_providers.py` (6), `fundamentals.py` (2), `engine_quant.py` (1), `engine_technicals.py` (1)
- **Detail:** Deprecated since Python 3.12. Some places already use `datetime.now(UTC)` creating inconsistent timezone handling.
- **Fix:** Replace all `datetime.utcnow()` with `datetime.now(UTC)`. Ensure model defaults use `lambda: datetime.now(UTC)`.

### W2. Debug `print()` in production code
- **File:** `apps/api/app/main.py:23`
- **Detail:** `print(f"DEBUG: pandas imported as pd: {pd}")` — executes on every server start.
- **Fix:** Delete the line.

### W3. Duplicate `import json`
- **File:** `apps/api/app/main.py:12,98`
- **Detail:** `import json` appears twice.
- **Fix:** Remove the duplicate at line 98.

### W4. CORS wildcard `"*"` alongside specific origins
- **File:** `apps/api/app/main.py:106-112`
- **Detail:** `allow_origins` includes specific localhost origins AND `"*"`. The wildcard makes specific entries redundant.
- **Fix:** Remove `"*"` from the list, keep the specific origins.

### W5. Redundant manual OPTIONS handlers
- **File:** `apps/api/app/main.py:1151-1184`
- **Detail:** Three `@app.options` handlers for `/cash/deposit`, `/cash/withdraw`, `/cash/adjust`. CORSMiddleware already handles OPTIONS preflight automatically.
- **Fix:** Delete the three OPTIONS handlers.

### W6. `strategy_used` (string) vs `strategies` (M2M) dual tracking
- **Files:** `models.py:70`, `main.py:2206,353`
- **Detail:** `Trade.strategy_used` (text field) coexists with `Trade.strategies` (M2M relationship). The `insights()` endpoint groups by the string, while `performance_analytics` groups by the relationship. They can be out of sync.
- **Fix:** Deprecate `strategy_used` string field. Update `insights()` to use the M2M relationship.

### W7. Static file mount exposes entire API directory
- **File:** `apps/api/app/main.py:120`
- **Detail:** `app.mount("/static", StaticFiles(directory=str(_API_DATA_BASE)))` serves everything under `apps/api/`, including `.venv/`, `trading.db`, config files.
- **Fix:** Change the mount path to a subdirectory like `apps/api/data/` or `apps/api/media/`.

### W8. Overview endpoint loads all trades twice
- **File:** `apps/api/app/main.py:800,1047`
- **Detail:** All trades loaded for chart computation (line 800), then ALL converted to `TradeRead` objects (line 1047). Memory pressure for large accounts.
- **Fix:** Reuse the already-loaded trades instead of re-querying.

### W9. Bare `except:` clauses
- **File:** `apps/api/app/main.py:310,503,553,1903`
- **Detail:** Catches `SystemExit`, `KeyboardInterrupt`, `GeneratorExit` which should never be silently swallowed.
- **Fix:** Change bare `except:` to `except Exception:`.

### W10. `portfolio_summary`/`portfolio_holdings` ignore `account_id`
- **File:** `apps/api/app/main.py:2560-2580`
- **Detail:** Queries assets without `account_id` filter, returns data across all accounts.
- **Fix:** Add `account_id` parameter and filter.

### W11. `on_event("startup")` deprecated
- **File:** `apps/api/app/main.py:2157`
- **Detail:** Should use FastAPI lifespan context manager.
- **Fix:** Refactor to use `@asynccontextmanager` lifespan.

### W12. `update_trade` deletes all linked cash transactions
- **File:** `apps/api/app/main.py:1365-1367`
- **Detail:** When updating any trade field (even notes), ALL linked cash transactions are deleted and recreated. Manual adjustments are lost.
- **Fix:** Only delete/recreate cash transactions when trade prices or position_size change.

### W13. CSV import doesn't create cash transactions
- **File:** `apps/api/app/main.py:1711-1774`
- **Detail:** `import_trades_csv` creates `Trade` records but NOT corresponding `CashTransaction` entries. Imported trades won't appear in cash balance.
- **Fix:** Create buy/sell/fee cash transactions during CSV import.

### W14. `scripts/package_app.ps1` outdated
- **File:** `scripts/package_app.ps1`
- **Detail:** Uses `pyinstaller --onedir --console --name "richblue-api"` which is different from `api.spec` (uses `run_api.py`, `--no-console`, includes alembic).
- **Fix:** Delete or mark as deprecated.

### W15. `.vscode/launch.json` targets wrong port
- **File:** `.vscode/launch.json:11`
- **Detail:** `"url": "http://localhost:8080"` — Vite dev server runs on port 5173.
- **Fix:** Change to `http://localhost:5173`.

### W16. `run_api.py` calls `freeze_support()` after importing app
- **File:** `apps/api/run_api.py:14-16`
- **Detail:** `from app.main import app` is called BEFORE `multiprocessing.freeze_support()`. Documentation says it should be first.
- **Fix:** Move `freeze_support()` before the import.

### W17. `run_api.py` crash.log writes to unpredictable CWD
- **File:** `apps/api/run_api.py:24`
- **Detail:** `open("crash.log", "w")` writes to CWD which may be unpredictable when running from PyInstaller.
- **Fix:** Write to a known location (e.g., next to the exe or in user's home directory).

---

## STYLE — 5 issues

### S1. `main.py` is 2753 lines — monolithic
- **File:** `apps/api/app/main.py`
- **Detail:** Entire API in one file. Should be split into FastAPI routers (accounts, trades, cash, overview, reports, analysis, etc.).
- **Fix:** Split into separate router files under `apps/api/app/routers/`.

### S2. Duplicated `_parse_iso`/`_parse_dt` functions
- **File:** `apps/api/app/main.py`
- **Detail:** `parse_iso()` (line 303), `parse_iso_naive()` (line 499), `_parse_dt()` (line 1476) all parse ISO datetime strings.
- **Fix:** Extract to a single shared utility function.

### S3. Duplicated number parsing in data_providers.py
- **File:** `apps/api/app/data_providers.py`
- **Detail:** `_parse_shorthand_number`/`_parse_num` copy-pasted 4 times (lines 334-361, 443-470, 539-566, 672-702).
- **Fix:** Extract to a single shared utility function.

### S4. Unused imports in main.py
- **File:** `apps/api/app/main.py`
- **Detail:** `inch` (line 25), `canvas` (line 26), `jsonable_encoder` (line 13), `StreamingResponse` (line 15) are imported but never used.
- **Fix:** Remove unused imports.

### S5. Empty `packages/shared` workspace
- **File:** `packages/shared/`
- **Detail:** Listed in workspace config but contains nothing.
- **Fix:** Either populate it or remove from workspaces in root package.json.

---

## MISSING — 12 issues

### M1. No CI/CD
- **Detail:** No `.github/workflows/`, no automated testing, linting, or building.
- **Fix:** Add GitHub Actions workflow for lint + typecheck + pytest on PRs.

### M2. No Python linting/formatting
- **Detail:** No ruff, black, flake8, pylint, or mypy configuration.
- **Fix:** Add `ruff` for linting and `black` for formatting. Add to CI.

### M3. No `.env.example`
- **Detail:** API uses env vars (`TRADING_APP_DATABASE_URL`, `PAID_API_URL`, `PAID_API_KEY`) but no documentation.
- **Fix:** Create `.env.example` with all env vars documented.

### M4. No pre-commit hooks
- **Detail:** No `.pre-commit-config.yaml` or Husky setup.
- **Fix:** Add pre-commit hooks for lint and format.

### M5. No LICENSE file
- **Detail:** `package.json` says `"license": "ISC"` but no LICENSE file exists.
- **Fix:** Create LICENSE file.

### M6. No input validation on trade fields
- **File:** `apps/api/app/schemas.py:55-59`
- **Detail:** `entry_price: float` and `position_size: float` have no constraints (can be negative or zero). Division by zero in `calc_return_pct`.
- **Fix:** Add `gt=0` constraints to Pydantic schema.

### M7. No rate limiting/caching on external API calls
- **File:** `apps/api/app/data_providers.py`
- **Detail:** Every `/analysis/fundamentals/{symbol}?refresh=true` triggers live HTTP requests with no rate limiting.
- **Fix:** Add response caching and request throttling.

### M8. No logging configuration
- **File:** `apps/api/app/main.py:102`
- **Detail:** `logger = logging.getLogger(__name__)` created but no logging config. Log messages go to default handler.
- **Fix:** Configure logging with formatting in `main.py` or `run_api.py`.

### M9. No API documentation/OpenAPI tags
- **File:** `apps/api/app/main.py:100`
- **Detail:** FastAPI created with minimal metadata. No tag descriptions, no endpoint docs beyond inline docstrings.
- **Fix:** Add `tags` to route decorators and descriptions to the app.

### M10. Unused dependencies in requirements.txt
- **File:** `apps/api/requirements.txt`
- **Detail:** `apscheduler` and `openpyxl` are listed but never imported.
- **Fix:** Remove unused dependencies.

### M11. Missing Alembic migrations
- **Detail:** `strategies`, `trade_strategy`, `symbol_mappings` tables exist in models but have no Alembic migrations. Created via `Base.metadata.create_all()` at startup.
- **Fix:** Generate proper Alembic migrations for these tables.

### M12. `tsconfig.app.json` missing `strict: true`
- **File:** `apps/desktop/tsconfig.app.json`
- **Detail:** No `strict: true` for better type safety.
- **Fix:** Add `"strict": true` to compilerOptions.

---

## Priority Fix Order

1. **C1+C2**: Remove duplicate routes (`/cash/dividend` and `/health`)
2. **C3**: Fix PDF PnL column index (3, not 4)
3. **C4**: Fix `create_account` to use `req.account_type`
4. **C5**: Add `ta` to requirements.txt
5. **C6**: Add `app.scoring` and `app.simulator` to api.spec
6. **C7**: Fix or delete broken `test_portfolio_math.py`
7. **C8**: Delete dead code at main.py:1675
8. **C9**: Add `selectinload` to `list_trades`
9. **C10**: Fix undefined `filtered` in StrategySelect.tsx
10. **C11**: Add routes/sidebar for orphaned pages or delete them
11. **C12+C13**: Fix package.json dependency issues
12. **W1-W17**: Address warnings in order
13. **S1-S5**: Address style issues
14. **M1-M12**: Address missing items
