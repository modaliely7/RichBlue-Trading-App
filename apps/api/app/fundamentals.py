from __future__ import annotations

from datetime import datetime
import json
from typing import Any

from .data_providers import fetch_price_and_fundamentals_yfinance, fetch_price_history_yfinance, fetch_fallback
from .models import StockRawData, StockMetrics, PriceHistory


def refresh_fundamentals(session, symbol: str) -> dict[str, Any]:
    """Fetch, compute and persist normalized fundamentals for a symbol.

    Raises ValueError for invalid symbol and RuntimeError for provider failures.
    Returns a normalized dict for convenience.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ValueError("Invalid symbol")

    provider_used = None
    payload: dict[str, Any] | None = None
    try:
        payload = fetch_price_and_fundamentals_yfinance(sym)
        provider_used = "yfinance"
    except Exception:
        try:
            payload = fetch_fallback(sym)
            provider_used = "fallback"
        except Exception as e:
            raise RuntimeError(f"Failed to fetch fundamentals for {sym}: {e}") from e

    # Persist raw payload
    # safe-serialize raw payload (convert datetimes to strings)
    raw = StockRawData(symbol=sym, provider=provider_used, raw_payload=json.dumps(payload, default=str), fetched_at=datetime.utcnow())
    session.add(raw)

    m = StockMetrics(
        symbol=sym,
        provider=provider_used,
        fetched_at=datetime.utcnow(),
        company_name=(payload.get("raw", {}) or {}).get("info", {}).get("longName"),
        quote_type=(payload.get("raw", {}) or {}).get("info", {}).get("quoteType"),
        current_price=float(payload.get("current_price") or 0.0),
        market_cap=payload.get("market_cap"),
        eps=payload.get("eps"),
        revenue=payload.get("revenue"),
        net_income=payload.get("net_income"),
        ebitda=payload.get("ebitda"),
        total_debt=payload.get("total_debt"),
        cash=payload.get("cash"),
        shares_outstanding=payload.get("shares_outstanding"),
        shareholder_equity=payload.get("shareholder_equity"),
        free_cash_flow=payload.get("free_cash_flow"),
    )

    # Calculations - best-effort, set None on failures
    try:
        # P/E
        if m.eps and abs(float(m.eps)) > 1e-12:
            m.pe_ratio = float(m.current_price) / float(m.eps)
            m.fair_value_pe = float(m.eps) * 15.0
        else:
            m.pe_ratio = None
            m.fair_value_pe = None

        # PB
        try:
            if m.market_cap and m.shareholder_equity and float(m.shareholder_equity) != 0:
                m.pb_ratio = float(m.market_cap) / float(m.shareholder_equity)
            else:
                m.pb_ratio = None
        except Exception:
            m.pb_ratio = None

        # EV & EV/EBITDA
        try:
            mc = float(m.market_cap or 0.0)
            td = float(m.total_debt or 0.0)
            cash_v = float(m.cash or 0.0)
            m.ev = mc + td - cash_v
            if m.ev is not None and m.ebitda and float(m.ebitda) != 0:
                m.ev_ebitda = float(m.ev) / float(m.ebitda)
            else:
                m.ev_ebitda = None
        except Exception:
            m.ev = None
            m.ev_ebitda = None

        # Profitability
        try:
            if m.shareholder_equity and m.net_income and float(m.shareholder_equity) != 0:
                m.roe = float(m.net_income) / float(m.shareholder_equity) * 100.0
            else:
                m.roe = None
        except Exception:
            m.roe = None

        try:
            if m.revenue and m.net_income and float(m.revenue) != 0:
                m.net_profit_margin = float(m.net_income) / float(m.revenue) * 100.0
            else:
                m.net_profit_margin = None
        except Exception:
            m.net_profit_margin = None

        # Growth rates (CAGR) from payload histories
        def cagr_from_series(series: list[float]) -> float | None:
            try:
                if not series or len(series) < 2:
                    return None
                latest = float(series[0])
                earliest = float(series[-1])
                years = len(series) - 1
                if earliest <= 0 or years <= 0:
                    return None
                return (latest / earliest) ** (1.0 / years) - 1.0
            except Exception:
                return None

        rev_hist = payload.get("revenue_history") or []
        eps_hist = payload.get("eps_history") or []
        rev_cagr = cagr_from_series(rev_hist)
        eps_cagr = cagr_from_series(eps_hist)
        m.revenue_growth = float(rev_cagr * 100.0) if rev_cagr is not None else None
        m.eps_growth = float(eps_cagr * 100.0) if eps_cagr is not None else None

        # Financial health
        try:
            if m.total_debt is not None and m.shareholder_equity and float(m.shareholder_equity) != 0:
                m.debt_to_equity = float(m.total_debt) / float(m.shareholder_equity)
            else:
                m.debt_to_equity = None
        except Exception:
            m.debt_to_equity = None

        # Current ratio
        try:
            raw_balance = (payload.get("raw") or {}).get("balance_sheet") or {}
            cur_assets = None
            cur_liab = None
            if raw_balance:
                for k in ["Total Current Assets", "Current Assets"]:
                    v = raw_balance.get(k)
                    if v:
                        cur_assets = list(v.values())[0]
                        break
                for k in ["Total Current Liabilities", "Current Liabilities"]:
                    v = raw_balance.get(k)
                    if v:
                        cur_liab = list(v.values())[0]
                        break
            if cur_assets and cur_liab and float(cur_liab) != 0:
                m.current_ratio = float(cur_assets) / float(cur_liab)
            else:
                m.current_ratio = payload.get("current_ratio")
        except Exception:
            m.current_ratio = payload.get("current_ratio")

        # Cash flow yield
        try:
            if m.free_cash_flow is not None and m.market_cap and float(m.market_cap) != 0:
                m.fcf_yield = float(m.free_cash_flow) / float(m.market_cap) * 100.0
            else:
                m.fcf_yield = None
        except Exception:
            m.fcf_yield = None

        # Fair value PEG heuristic
        try:
            expected_growth_pct = m.revenue_growth if m.revenue_growth is not None else m.eps_growth
            if m.eps and expected_growth_pct and abs(expected_growth_pct) > 1e-9:
                m.fair_value_peg = float(m.eps) * float(expected_growth_pct)
            else:
                m.fair_value_peg = None
        except Exception:
            m.fair_value_peg = None
    except Exception:
        # set optionals to None on broad failure
        m.pe_ratio = None
        m.pb_ratio = None
        m.ev = None
        m.ev_ebitda = None
        m.roe = None
        m.net_profit_margin = None
        m.revenue_growth = None
        m.eps_growth = None
        m.debt_to_equity = None
        m.current_ratio = None
        m.fcf_yield = None
        m.fair_value_peg = None

    # Fundamental scoring: 5 categories 0-20
    try:
        growth_pct_candidates = [x for x in ([m.revenue_growth, m.eps_growth]) if x is not None]
        growth_score = 0
        if growth_pct_candidates:
            avg_growth = sum(growth_pct_candidates) / len(growth_pct_candidates)
            growth_score = max(0, min(20, avg_growth))

        prof_candidates = [x for x in ([m.roe, m.net_profit_margin]) if x is not None]
        prof_score = 0
        if prof_candidates:
            avg_prof = sum(prof_candidates) / len(prof_candidates)
            prof_score = max(0, min(20, avg_prof))

        if m.debt_to_equity is None:
            debt_score = 5
        else:
            if m.debt_to_equity <= 0.5:
                debt_score = 10
            elif m.debt_to_equity <= 1.0:
                debt_score = 8
            elif m.debt_to_equity <= 2.0:
                debt_score = 5
            elif m.debt_to_equity <= 4.0:
                debt_score = 2
            else:
                debt_score = 0
        if m.current_ratio is None:
            cur_score = 5
        else:
            if m.current_ratio >= 2.0:
                cur_score = 10
            elif m.current_ratio >= 1.5:
                cur_score = 8
            elif m.current_ratio >= 1.0:
                cur_score = 6
            elif m.current_ratio >= 0.8:
                cur_score = 3
            else:
                cur_score = 0
        stab_score = debt_score + cur_score

        # Valuation
        val_score = 0
        try:
            pe_s = 0
            if m.pe_ratio is None:
                pe_s = 5
            else:
                if m.pe_ratio > 0 and m.pe_ratio <= 12:
                    pe_s = 10
                elif m.pe_ratio <= 20:
                    pe_s = 6
                else:
                    pe_s = 2
            peg_s = 0
            try:
                if m.fair_value_peg is None or m.pe_ratio is None:
                    peg_s = 5
                else:
                    peg_s = 10 if (m.fair_value_peg and m.fair_value_peg > 0 and (m.fair_value_peg / (m.current_price or 1)) > 0.0) else 5
            except Exception:
                peg_s = 5
            val_score = min(20, pe_s + peg_s)
        except Exception:
            val_score = 5

        # Cash flow score
        cf_score = 0
        try:
            if m.free_cash_flow is None:
                cf_score = 5
            else:
                fcy = float(m.fcf_yield or 0.0)
                if fcy >= 5.0:
                    cf_score = 20
                elif fcy >= 3.0:
                    cf_score = 15
                elif fcy >= 1.0:
                    cf_score = 8
                elif fcy > 0:
                    cf_score = 4
                else:
                    cf_score = 0
        except Exception:
            cf_score = 5

        total_score = int(max(0, min(100, (growth_score + prof_score + stab_score + val_score + cf_score))))
        m.fundamental_score = total_score
    except Exception:
        m.fundamental_score = None

    session.add(m)
    session.flush()

    # Persist price history best-effort
    try:
        hist = fetch_price_history_yfinance(sym, period="1y", interval="1d")
        for row in hist[-365:]:
            ph = PriceHistory(
                symbol=sym,
                provider=provider_used,
                at=row.get("at"),
                open=row.get("open") or 0.0,
                high=row.get("high") or 0.0,
                low=row.get("low") or 0.0,
                close=row.get("close") or 0.0,
                volume=row.get("volume") or 0.0,
            )
            session.add(ph)
    except Exception:
        pass

    return {
        "symbol": sym,
        "provider": provider_used,
        "fetched_at": m.fetched_at,
        "company_name": m.company_name,
        "quote_type": m.quote_type,
        "current_price": m.current_price,
        "market_cap": m.market_cap,
        "eps": m.eps,
        "pe_ratio": m.pe_ratio,
        "ev_ebitda": m.ev_ebitda,
        "roe": m.roe,
        "net_profit_margin": m.net_profit_margin,
        "revenue_growth": m.revenue_growth,
        "eps_growth": m.eps_growth,
        "debt_to_equity": m.debt_to_equity,
        "current_ratio": m.current_ratio,
        "free_cash_flow": m.free_cash_flow,
        "fcf_yield": m.fcf_yield,
        "fundamental_score": m.fundamental_score,
        "fair_value_pe": m.fair_value_pe,
        "fair_value_peg": m.fair_value_peg,
    }
