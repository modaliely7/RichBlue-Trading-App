"""Lightweight symbol lookup for the trading journal.

Used by the Add Trade form to auto-detect the company name and
quote type (Stocks / Funds / Crypto / Forex) when a user types a ticker.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def lookup_symbol(symbol: str) -> dict:
    """Look up a symbol and return ``company_name`` and ``quote_type``.

    Uses yfinance when available. Falls back to a best-effort guess
    based on the ticker format (crypto, forex) so the UI can still
    pre-select the market category.

    Returns ``{}`` if nothing could be determined — callers should
    treat this as a non-fatal "we don't know" signal.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        return {}

    try:
        import yfinance as yf
    except Exception:
        yf = None

    company_name: str | None = None
    quote_type: str | None = None

    if yf is not None:
        try:
            tk = yf.Ticker(sym)
            info = {}
            try:
                info = tk.get_info() if hasattr(tk, "get_info") else getattr(tk, "info", {}) or {}
            except Exception:
                info = getattr(tk, "info", {}) or {}

            if not info and not sym.endswith(".CA"):
                tk_eg = yf.Ticker(sym + ".CA")
                try:
                    info = tk_eg.get_info() if hasattr(tk_eg, "get_info") else getattr(tk_eg, "info", {}) or {}
                except Exception:
                    info = {}

            if info:
                company_name = info.get("longName") or info.get("shortName")
                quote_type = info.get("quoteType")
        except Exception as e:
            logger.debug("yfinance lookup failed for %s: %s", sym, e)

    if not quote_type:
        if sym.endswith("-USD") or sym.endswith("USDT") or sym.endswith("USDC"):
            quote_type = "CRYPTOCURRENCY"
        elif sym.endswith("=X"):
            quote_type = "CURRENCY"
        elif sym.endswith(".CA"):
            quote_type = "EQUITY"
        elif len(sym) <= 5 and sym.isalpha() and sym.isupper():
            quote_type = "EQUITY"

    return {
        "symbol": sym,
        "company_name": company_name,
        "quote_type": quote_type,
    }
