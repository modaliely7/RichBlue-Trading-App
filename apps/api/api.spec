# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the RichBlue FastAPI backend.
# Produces:  apps/api/dist/api/   (--onedir bundle)
# Run with:  pyinstaller api.spec   (from apps/api/)
#

import sys
from pathlib import Path

block_cipher = None

# ── Hidden imports needed by FastAPI / SQLAlchemy / yfinance ──────────────────
hidden_imports = [
    # SQLAlchemy dialects
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.pool",
    # Uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    # FastAPI / Starlette
    "fastapi",
    "starlette.routing",
    "starlette.staticfiles",
    "starlette.middleware.cors",
    # Pydantic v2
    "pydantic",
    "pydantic.deprecated.class_validators",
    # Data
    "pandas",
    "numpy",
    "yfinance",
    "requests",
    "bs4",
    "lxml",
    "openpyxl",
    "xlsxwriter",
    "apscheduler",
    "apscheduler.schedulers.background",
    # Reportlab
    "reportlab",
    "reportlab.pdfgen",
    "reportlab.platypus",
    "reportlab.lib",
    # Alembic
    "alembic",
    "alembic.runtime.migration",
    "alembic.operations",
    # App modules
    "app.main",
    "app.utils",
    "app.db",
    "app.models",
    "app.schemas",
    "app.analytics",
    "app.portfolio_math",
    "app.symbol_lookup",
    "app.report_builders",
    # Market data (Phase 6)
    "app.market_data",
    "app.market_data.egx_stocks",
    "app.market_data.models",
    "app.market_data.cache",
    "app.market_data.service",
    "app.market_data.scheduler",
    "app.market_data.providers",
    "app.market_data.providers.yahoo",
    # Routers (S1 split)
    "app.routes",
    "app.routes.health_accounts",
    "app.routes.strategies",
    "app.routes.assets",
    "app.routes.symbols",
    "app.routes.trades",
    "app.routes.cash",
    "app.routes.portfolio",
    "app.routes.overview",
    "app.routes.psychology",
    "app.routes.lessons",
    "app.routes.analytics",
    "app.routes.reports",
    "app.routes.settings",
    "app.routes.market_data",
]

# ── Data files to bundle alongside the exe ────────────────────────────────────
# (source_path, dest_folder_inside_bundle)
datas = [
    # Alembic migrations
    ("alembic", "alembic"),
    ("alembic.ini", "."),
]

a = Analysis(
    ["run_api.py"],          # entry-point (created below)
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "PyQt5"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,   # no console window in production
    icon=None,       # no icon for the invisible server process
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="api",
)
