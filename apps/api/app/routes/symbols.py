"""Symbol lookup router (used by the Add Trade form)."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from ..symbol_lookup import lookup_symbol


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/symbols/lookup/{symbol}")
def symbol_lookup(symbol: str) -> dict:
    """Lightweight symbol lookup used by the Add Trade form.

    Returns ``company_name`` and ``quote_type`` so the UI can
    auto-detect a name and pre-select the market category.
    """
    try:
        return lookup_symbol(symbol)
    except Exception as e:
        logger.debug("Symbol lookup failed for %s: %s", symbol, e)
        return {"symbol": symbol.strip().upper(), "company_name": None, "quote_type": None}
