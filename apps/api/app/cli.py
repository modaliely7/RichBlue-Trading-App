"""Command-line utilities for the API (refresh fundamentals, inspect signals).

Usage examples:
  python -m apps.api.app.cli --symbol AAPL
  python -m apps.api.app.cli --all
"""
from __future__ import annotations

import argparse
import sys
from sqlalchemy import select

from .db import session_scope
from .models import Trade, Asset
from .fundamentals import refresh_fundamentals


def main(argv=None):
    p = argparse.ArgumentParser(prog="api-cli")
    p.add_argument("--symbol", "-s", action="append", help="Ticker symbol to refresh (can be used multiple times)")
    p.add_argument("--all", action="store_true", help="Refresh fundamentals for all known symbols from trades/assets/metrics")
    args = p.parse_args(argv)

    if not args.all and not args.symbol:
        p.error("Provide --symbol or --all")

    symbols = set()
    with session_scope() as s:
        if args.all:
            try:
                symbols.update([x for x in s.execute(select(Trade.symbol)).scalars().all() if x])
            except Exception:
                pass
            try:
                symbols.update([x for x in s.execute(select(Asset.symbol)).scalars().all() if x])
            except Exception:
                pass
        if args.symbol:
            for v in args.symbol:
                symbols.add((v or "").strip().upper())

        for sym in sorted(symbols):
            if not sym:
                continue
            print(f"Refreshing fundamentals for {sym}...")
            try:
                res = refresh_fundamentals(s, sym)
                print(f"OK: {sym} -> fetched_at={res.get('fetched_at')}")
            except Exception as e:
                print(f"Failed: {sym}: {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
