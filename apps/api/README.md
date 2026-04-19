API Backend (apps/api)
======================

Quick notes for developers:

- Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

- Run migrations:

```powershell
alembic upgrade head
```

- Start the API locally:

```powershell
uvicorn app.main:app --reload --port 8001 --host 127.0.0.1
```

- Refresh fundamentals for a symbol via CLI:

```powershell
# from repo root
$env:PYTHONPATH = '.'
python -m apps.api.app.cli --symbol AAPL
```

- Refresh all known symbols:

```powershell
$env:PYTHONPATH = '.'
python -m apps.api.app.cli --all
```

- Running tests (ensure `PYTHONPATH` points to repo root):

```powershell
$env:PYTHONPATH = '.'
pytest -q apps/api/tests
```

Notes:
- The CLI uses the same persistence helpers as the API and is best run after migrations.
- A background scheduler (APScheduler) can optionally run inside the API to refresh fundamentals every 24h when `apscheduler` is installed.

Fallback scrapers and paid APIs
------------------------------

- The backend implements a fallback scraper that tries a configured paid API (`PAID_API_URL` + optional `PAID_API_KEY`) and then attempts to scrape Yahoo Finance HTML if `yfinance` data is missing. Set `PAID_API_URL` to a JSON-returning endpoint that accepts `symbol` and returns `current_price`, `market_cap`, `eps` when possible.

Environment variables:
- `PAID_API_URL` — optional URL of a paid data provider that accepts `symbol` and `apikey` query params.
- `PAID_API_KEY` — optional API key to send to the paid API as `apikey`.

Notes:
- Scraping is best-effort and may be brittle for some exchanges (EGX). Consider using a paid provider for production coverage.