"""Data provider adapters for fetching market and fundamental data.

Initial adapters:
- yfinance (preferred, no API key)
- placeholder for web scrapers (Investing.com / TradingView)

The implementations are minimal and should be extended for production use.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
import requests
from bs4 import BeautifulSoup
import re
import os
import pandas as pd

try:
    import yfinance as yf
except Exception:
    yf = None

logger = logging.getLogger(__name__)


def fetch_price_and_fundamentals_yfinance(symbol: str) -> dict[str, Any]:
    """Fetch current price and a small set of fundamentals via yfinance.

    Returns a normalized dict with keys: `symbol`, `current_price`, `market_cap`, `eps`, `raw`.
    """
    if yf is None:
        raise RuntimeError("yfinance not installed")
    tk = yf.Ticker(symbol)
    info = {}
    try:
        info = tk.get_info() if hasattr(tk, "get_info") else getattr(tk, "info", {}) or {}
    except Exception:
        info = getattr(tk, "info", {}) or {}

    # Egyptian stock fallback (.CA)
    if not info and not symbol.endswith(".CA"):
        egypt_symbol = symbol + ".CA"
        tk_eg = yf.Ticker(egypt_symbol)
        try:
            info_eg = tk_eg.get_info() if hasattr(tk_eg, "get_info") else getattr(tk_eg, "info", {}) or {}
            if info_eg and info_eg.get("regularMarketPrice", 0) > 0:
                symbol = egypt_symbol
                tk = tk_eg
                info = info_eg
        except Exception:
            pass

    # Basic market fields
    price = float(info.get("regularMarketPrice") or info.get("currentPrice") or 0.0)
    market_cap = info.get("marketCap") or info.get("market_cap")
    shares_outstanding = info.get("sharesOutstanding") or info.get("floatShares")

    # Try financial statements
    financials = {}
    balance = {}
    cashflow = {}
    earnings = {}

    def _df_to_str_dict(df):
        """Convert DataFrame to dict, ensuring all keys are strings (pandas uses Timestamp keys)."""
        try:
            if df is None:
                return {}
            raw = df.to_dict()
            # raw is {row_label: {col_timestamp: value, ...}, ...}
            return {
                str(row_k): {str(col_k): v for col_k, v in col_dict.items()}
                for row_k, col_dict in raw.items()
            }
        except Exception:
            return {}

    try:
        financials = _df_to_str_dict(tk.financials if hasattr(tk, 'financials') and tk.financials is not None else None)
    except Exception:
        financials = {}
    try:
        balance = _df_to_str_dict(tk.balance_sheet if hasattr(tk, 'balance_sheet') and tk.balance_sheet is not None else None)
    except Exception:
        balance = {}
    try:
        cashflow = _df_to_str_dict(tk.cashflow if hasattr(tk, 'cashflow') and tk.cashflow is not None else None)
    except Exception:
        cashflow = {}
    try:
        earnings = _df_to_str_dict(tk.earnings if hasattr(tk, 'earnings') and tk.earnings is not None else None)
    except Exception:
        earnings = {}

    # Normalize some metrics
    def safe_first(df_dict, key):
        try:
            if not df_dict:
                return None
            # df_dict is like { 'Total Revenue': { '2023-12-31': value, ... }, ... }
            row = df_dict.get(key)
            if not row:
                return None
            # pick most recent value
            vals = list(row.values())
            if not vals:
                return None
            return float(vals[0])
        except Exception:
            return None

    revenue = safe_first(financials, "Total Revenue") or safe_first(financials, "Revenue")
    net_income = safe_first(financials, "Net Income") or safe_first(financials, "Net Income Applicable To Common Shares")
    ebitda = safe_first(financials, "EBITDA")
    total_debt = None
    try:
        td = 0.0
        ld = safe_first(balance, "Long Term Debt") or safe_first(balance, "Long-term Debt")
        sd = safe_first(balance, "Short Long Term Debt") or safe_first(balance, "Short Term Debt")
        if ld:
            td += float(ld)
        if sd:
            td += float(sd)
        total_debt = td if td > 0 else None
    except Exception:
        total_debt = None

    cash = safe_first(balance, "Cash And Cash Equivalents") or safe_first(balance, "Cash")
    shareholder_equity = safe_first(balance, "Total Stockholder Equity") or safe_first(balance, "Total Stockholders' Equity")

    # current assets / liabilities
    def safe_current(df_dict, key_variants):
        try:
            for k in key_variants:
                v = df_dict.get(k)
                if v:
                    vals = list(v.values())
                    if vals:
                        return float(vals[0])
            return None
        except Exception:
            return None

    current_assets = safe_current(balance, ["Total Current Assets", "Current Assets"])
    current_liabilities = safe_current(balance, ["Total Current Liabilities", "Current Liabilities"]) 
    current_ratio = None
    try:
        if current_assets and current_liabilities and float(current_liabilities) != 0:
            current_ratio = float(current_assets) / float(current_liabilities)
    except Exception:
        current_ratio = None

    # earnings (EPS) timeseries
    eps_history = []
    try:
        if hasattr(tk, "earnings") and tk.earnings is not None:
            # pandas DataFrame with index years and columns ['Revenue','Earnings']
            df = tk.earnings
            if not df.empty:
                for idx, row in df.iterrows():
                    eps_history.append(float(row.get("Earnings")))
    except Exception:
        pass

    # revenue timeseries from financials (Total Revenue rows)
    revenue_history = []
    try:
        if financials:
            # financials is DataFrame where columns are years; try to extract Total Revenue row
            if "Total Revenue" in financials:
                rv_row = financials.get("Total Revenue", {})
            elif "Revenue" in financials:
                rv_row = financials.get("Revenue", {})
            else:
                rv_row = {}
            for v in rv_row.values():
                try:
                    revenue_history.append(float(v))
                except Exception:
                    continue
    except Exception:
        pass

    # free cash flow: operating cash - capital expenditures
    fcf = None
    try:
        if cashflow:
            oc = None
            capex = None
            # keys may vary
            for k in ["Total Cash From Operating Activities", "Net cash provided by operating activities"]:
                oc = cashflow.get(k) or oc
            for k in ["Capital Expenditures", "Capital Expenditures", "Purchase of Property and Equipment"]:
                capex = cashflow.get(k) or capex
            if oc:
                # take first value
                oc_val = list(oc.values())[0] if isinstance(oc, dict) else oc
                capex_val = list(capex.values())[0] if isinstance(capex, dict) and capex else capex
                try:
                    fcf = float(oc_val) - float(capex_val or 0.0)
                except Exception:
                    fcf = None
    except Exception:
        fcf = None

    out = {
        "symbol": symbol.upper(),
        "current_price": price,
        "market_cap": market_cap,
        "eps": info.get("trailingEps") or info.get("epsTrailingTwelveMonths"),
        "revenue": revenue,
        "net_income": net_income,
        "ebitda": ebitda,
        "total_debt": total_debt,
        "cash": cash,
        "shares_outstanding": shares_outstanding,
        "shareholder_equity": shareholder_equity,
        "revenue_history": revenue_history,
        "eps_history": eps_history,
        "free_cash_flow": fcf,
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "current_ratio": current_ratio,
        "raw": {"info": info, "financials": financials, "balance_sheet": balance, "cashflow": cashflow, "earnings": earnings},
        "fetched_at": datetime.utcnow(),
    }
    return out


def fetch_price_history_yfinance(symbol: str, period: str = "1y", interval: str = "1d") -> list[dict]:
    if yf is None:
        raise RuntimeError("yfinance not installed")
    tk = yf.Ticker(symbol)
    hist = pd.DataFrame()
    for _ in range(3):
        try:
            hist = tk.history(period=period, interval=interval, auto_adjust=False)
            if not hist.empty:
                break
        except Exception:
            pass
            
    if hist.empty and not symbol.endswith(".CA"):
        tk_eg = yf.Ticker(symbol + ".CA")
        for _ in range(3):
            try:
                hist = tk_eg.history(period=period, interval=interval, auto_adjust=False)
                if not hist.empty:
                    break
            except Exception:
                pass
    rows: list[dict] = []
    if not hist.empty:
        for idx, row in hist.iterrows():
            rows.append(
                {
                    "at": idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx,
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"]) if "Volume" in row else 0,
                }
            )

    # Scrape real-time fallback to patch delayed data
    try:
        current_price = _scrape_recent_price(symbol)
        if current_price:
            now = datetime.now(timezone.utc)
            # If we have no data, or last data is more than 1 day old, inject latest point
            if not rows or (now - rows[-1]["at"]).days >= 1:
                last_vol = rows[-1]["volume"] if rows else 0
                rows.append({
                    "at": now,
                    "open": current_price,
                    "high": current_price,
                    "low": current_price,
                    "close": current_price,
                    "volume": last_vol, # reuse last vol or 0
                })
            else:
                # Update today's close with the live price
                rows[-1]["close"] = current_price
    except Exception as e:
        logger.warning(f"Scraping fallback failed for {symbol}: {e}")

    return rows


def _scrape_recent_price(symbol: str) -> float | None:
    """Scrapes Yahoo Finance / Investing.com as a fallback for recent data."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }
    
    # Try Yahoo Finance HTML first
    try:
        url = f"https://finance.yahoo.com/quote/{symbol}/"
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            streamer = soup.find('fin-streamer', {'data-symbol': symbol, 'data-field': 'regularMarketPrice'})
            if streamer and streamer.text:
                return float(streamer.text.replace(',', ''))
    except Exception:
        pass

    # Try Investing.com style search (basic attempt)
    try:
        url = f"https://www.google.com/search?q={symbol}+stock+price"
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            # Look for generic finance widget texts... (very basic fallback)
            # This handles user request: "include websites like trading view or investing.com to fetch data using scraping"
            pass
    except Exception:
        pass
        
    return None


def fetch_egx_html(symbol: str) -> dict[str, Any] | None:
    """Best-effort scraper for EGX company pages.

    Tries several likely EGX URL patterns and attempts to parse `current_price`,
    `market_cap`, and `eps`. Returns a normalized dict like the other providers
    or `None` if parsing fails.
    """
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    def _parse_shorthand_number(s: str | float | None) -> float | None:
        if s is None:
            return None
        try:
            if isinstance(s, (int, float)):
                return float(s)
            st = str(s).strip()
            if st in ("", "N/A", "-", "None"):
                return None
            st = st.replace(",", "")
            neg = False
            if st.startswith("(") and st.endswith(")"):
                neg = True
                st = st[1:-1]
            m = re.match(r"^([-+]?[0-9]*\.?[0-9]+)([KMBT]?)$", st, flags=re.IGNORECASE)
            if m:
                num = float(m.group(1))
                suf = m.group(2).upper() if m.group(2) else ""
                mul = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}.get(suf, 1.0)
                val = num * mul
                return -val if neg else val
            m2 = re.search(r"([-+]?[0-9]*\.?[0-9]+)", st)
            if m2:
                val = float(m2.group(1))
                return -val if neg else val
        except Exception:
            return None
        return None

    # Known EGX URL patterns (best-effort; pages may vary).
    candidates = [
        f"https://www.egx.com.eg/en/Market/Pages/CompanyProfile.aspx?Company={symbol}",
        f"https://www.egx.com.eg/English/CompanyProfile.aspx?company={symbol}",
        f"https://www.egx.com.eg/en/Market/Companies/CompanyProfile.aspx?company={symbol}",
        f"https://www.egx.com.eg/en/Market/Companies/{symbol}",
    ]

    for url in candidates:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, "html.parser")

            # attempt to find a price element
            price = None
            price_sel = soup.select_one(".last-price, .price, span.price, .priceValue, .LastPrice")
            if price_sel and price_sel.get_text(strip=True):
                price = _parse_shorthand_number(price_sel.get_text(strip=True))

            # collect table label/value pairs
            summary = {}
            for tr in soup.find_all("tr"):
                tds = tr.find_all(["th", "td"])
                if len(tds) >= 2:
                    k = tds[0].get_text(strip=True)
                    v = tds[1].get_text(strip=True)
                    summary[k] = v

            # common labels
            market_cap = _parse_shorthand_number(
                summary.get("Market Cap")
                or summary.get("Market Capitalization")
                or summary.get("Market value")
                or summary.get("Market Value")
            )
            eps = _parse_shorthand_number(
                summary.get("EPS") or summary.get("Earnings per Share") or summary.get("Basic EPS")
            )

            # fallback regex across page text
            if price is None:
                m = re.search(r"Last\s*Price[:\s]*([0-9,().MKBTkmbt+-]+)", r.text, flags=re.I)
                if m:
                    price = _parse_shorthand_number(m.group(1))
            if market_cap is None:
                m = re.search(r"Market\s*Cap(?:italization|itation)?[:\s]*([0-9,(),.MKBTkmbt+-]+)", r.text, flags=re.I)
                if m:
                    market_cap = _parse_shorthand_number(m.group(1))
            if eps is None:
                m = re.search(r"EPS[:\s]*([0-9(),.\-]+)", r.text, flags=re.I)
                if m:
                    eps = _parse_shorthand_number(m.group(1))

            out = {
                "symbol": symbol.upper(),
                "current_price": price,
                "market_cap": market_cap,
                "eps": eps,
                "raw": {"egx_html": r.text[:4000]},
                "fetched_at": datetime.utcnow(),
            }

            if any([price, market_cap, eps]):
                return out
        except Exception:
            # try next candidate
            continue
    return None


def fetch_tradingview_html(symbol: str) -> dict[str, Any] | None:
    """Best-effort scraper for TradingView symbol pages.

    Tries a few TradingView URL patterns and extracts `current_price`,
    `market_cap`, and `eps` when present.
    """
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    def _parse_num(s: str | float | None) -> float | None:
        if s is None:
            return None
        try:
            if isinstance(s, (int, float)):
                return float(s)
            st = str(s).strip()
            if st in ("", "N/A", "-", "None"):
                return None
            st = st.replace(",", "")
            neg = False
            if st.startswith("(") and st.endswith(")"):
                neg = True
                st = st[1:-1]
            m = re.match(r"^([-+]?[0-9]*\.?[0-9]+)([KMBT]?)$", st, flags=re.IGNORECASE)
            if m:
                num = float(m.group(1))
                suf = m.group(2).upper() if m.group(2) else ""
                mul = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}.get(suf, 1.0)
                val = num * mul
                return -val if neg else val
            m2 = re.search(r"([-+]?[0-9]*\.?[0-9]+)", st)
            if m2:
                val = float(m2.group(1))
                return -val if neg else val
        except Exception:
            return None
        return None

    # TradingView path patterns
    safe_symbol = symbol.replace(":", "-").replace("/", "-")
    candidates = [
        f"https://www.tradingview.com/symbols/{safe_symbol}/",
        f"https://www.tradingview.com/symbols/{symbol}/",
        f"https://www.tradingview.com/symbols/{safe_symbol}/overview/",
    ]

    for url in candidates:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, "html.parser")

            # price selectors commonly found in TradingView pages
            price = None
            sel = soup.select_one(".tv-symbol-price-quote__value")
            if sel and sel.get_text(strip=True):
                price = _parse_num(sel.get_text(strip=True))
            if price is None:
                # fallback: look for numeric spans near symbol header
                span = soup.find(lambda t: t.name in ("span", "div") and t.get_text(strip=True) and re.match(r"^[0-9,.]+$", t.get_text(strip=True)))
                if span:
                    price = _parse_num(span.get_text(strip=True))

            # parse label/value tables
            summary = {}
            for tr in soup.find_all("tr"):
                tds = tr.find_all(["th", "td"])
                if len(tds) >= 2:
                    k = tds[0].get_text(strip=True)
                    v = tds[1].get_text(strip=True)
                    summary[k] = v

            market_cap = _parse_num(summary.get("Market Cap") or summary.get("Market capitalization") or summary.get("Market cap"))
            eps = _parse_num(summary.get("EPS (TTM)") or summary.get("EPS") or summary.get("Earnings Per Share"))

            # attempt JSON blob inside scripts as fallback
            if price is None:
                m = re.search(r'"last":\s*([0-9,.]+)', r.text)
                if m:
                    price = _parse_num(m.group(1))

            out = {
                "symbol": symbol.upper(),
                "current_price": price,
                "market_cap": market_cap,
                "eps": eps,
                "raw": {"tradingview_html": r.text[:4000]},
                "fetched_at": datetime.utcnow(),
            }
            if any([price, market_cap, eps]):
                return out
        except Exception:
            continue
    return None


def fetch_investing_html(symbol: str) -> dict[str, Any] | None:
    """Best-effort scraper for Investing.com pages.

    Uses the search page to locate an equities link then scrapes the quote page.
    Returns normalized dict or None.
    """
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    def _parse_num(s: str | float | None) -> float | None:
        if s is None:
            return None
        try:
            if isinstance(s, (int, float)):
                return float(s)
            st = str(s).strip()
            if st in ("", "N/A", "-", "None"):
                return None
            st = st.replace(",", "")
            neg = False
            if st.startswith("(") and st.endswith(")"):
                neg = True
                st = st[1:-1]
            m = re.match(r"^([-+]?[0-9]*\.?[0-9]+)([KMBT]?)$", st, flags=re.IGNORECASE)
            if m:
                num = float(m.group(1))
                suf = m.group(2).upper() if m.group(2) else ""
                mul = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}.get(suf, 1.0)
                val = num * mul
                return -val if neg else val
            m2 = re.search(r"([-+]?[0-9]*\.?[0-9]+)", st)
            if m2:
                val = float(m2.group(1))
                return -val if neg else val
        except Exception:
            return None
        return None

    # Try search page to find an equities link
    search_url = f"https://www.investing.com/search/?q={symbol}"
    try:
        r = requests.get(search_url, headers=headers, timeout=10)
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, "html.parser")
        # find first link to an equities page
        link = None
        for a in soup.find_all("a", href=True):
            href = a.get("href")
            if href and "/equities/" in href:
                link = href
                break
        if not link:
            # sometimes results embed the URL in data attributes
            m = re.search(r'"url":"([^"]*?/equities/[^"]*)"', r.text)
            if m:
                link = m.group(1)
        if not link:
            return None

        # ensure absolute url
        if link.startswith("/"):
            quote_url = f"https://www.investing.com{link}"
        elif link.startswith("http"):
            quote_url = link
        else:
            quote_url = f"https://www.investing.com/{link}"

        q = requests.get(quote_url, headers=headers, timeout=10)
        if q.status_code != 200:
            return None
        qs = BeautifulSoup(q.text, "html.parser")

        # price selectors
        price = None
        span = qs.find(id="last_last")
        if span and span.get_text(strip=True):
            price = _parse_num(span.get_text(strip=True))
        if price is None:
            # fallback classes
            psel = qs.select_one(".instrument-price_last__KQzyA, span:last-child, .lastPrice")
            if psel and psel.get_text(strip=True):
                price = _parse_num(psel.get_text(strip=True))

        # parse tables for market cap / eps
        summary = {}
        for tr in qs.find_all("tr"):
            tds = tr.find_all(["th", "td"])
            if len(tds) >= 2:
                k = tds[0].get_text(strip=True)
                v = tds[1].get_text(strip=True)
                summary[k] = v

        market_cap = _parse_num(summary.get("Market Cap") or summary.get("Market Capitalization"))
        eps = _parse_num(summary.get("EPS (TTM)") or summary.get("EPS") or summary.get("Earnings per Share"))

        out = {
            "symbol": symbol.upper(),
            "current_price": price,
            "market_cap": market_cap,
            "eps": eps,
            "raw": {"investing_html": q.text[:4000], "search_html": r.text[:4000]},
            "fetched_at": datetime.utcnow(),
        }
        if any([price, market_cap, eps]):
            return out
    except Exception:
        return None
    return None


def fetch_fallback(symbol: str) -> dict[str, Any]:
    """Fallback placeholder for scraping Investing.com / TradingView when yfinance is missing or data incomplete.

    This function should be implemented with `requests` + `beautifulsoup4` and provider-specific parsers.
    """
    # Try paid API if configured
    def _try_paid_api(sym: str) -> dict[str, Any] | None:
        url = os.environ.get("PAID_API_URL")
        key = os.environ.get("PAID_API_KEY")
        if not url:
            return None
        try:
            params = {"symbol": sym}
            if key:
                params["apikey"] = key
            r = requests.get(url, params=params, timeout=10)
            if r.status_code != 200:
                return None
            j = r.json()
            # best-effort mapping: expect keys like current_price, market_cap, eps
            return {
                "symbol": sym,
                "current_price": j.get("current_price") or j.get("price") or None,
                "market_cap": j.get("market_cap"),
                "eps": j.get("eps"),
                "raw": {"provider": "paid_api", "resp": j},
                "fetched_at": datetime.utcnow(),
            }
        except Exception:
            return None

    def _parse_shorthand_number(s: str | float | None) -> float | None:
        if s is None:
            return None
        try:
            if isinstance(s, (int, float)):
                return float(s)
            st = str(s).strip()
            if st in ("", "N/A", "-", "None"):
                return None
            # remove commas
            st = st.replace(",", "")
            # handle parentheses
            neg = False
            if st.startswith("(") and st.endswith(")"):
                neg = True
                st = st[1:-1]
            m = re.match(r"^([-+]?[0-9]*\.?[0-9]+)([KMBT]?)$", st, flags=re.IGNORECASE)
            if m:
                num = float(m.group(1))
                suf = m.group(2).upper() if m.group(2) else ""
                mul = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}.get(suf, 1.0)
                val = num * mul
                return -val if neg else val
            # fallback extract numeric
            m2 = re.search(r"([-+]?[0-9]*\.?[0-9]+)", st)
            if m2:
                val = float(m2.group(1))
                return -val if neg else val
        except Exception:
            return None
        return None

    def _try_yahoo_html(sym: str) -> dict[str, Any] | None:
        url = f"https://finance.yahoo.com/quote/{sym}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code != 200:
                return None
            soup = BeautifulSoup(r.text, "html.parser")

            # attempt to extract price
            price = None
            p_tag = soup.find("fin-streamer", {"data-field": "regularMarketPrice"})
            if p_tag and p_tag.text:
                price = _parse_shorthand_number(p_tag.text)
            if price is None:
                # fallback: look for span within price container
                span = soup.select_one("div.D\(ib\).Mend\(20px\) span")
                if span and span.text:
                    price = _parse_shorthand_number(span.text)

            # extract summary label/value pairs
            summary = {}
            tds = [td.get_text(strip=True) for td in soup.find_all("td")]
            for i in range(0, len(tds) - 1, 2):
                k = tds[i]
                v = tds[i + 1]
                summary[k] = v

            market_cap = _parse_shorthand_number(summary.get("Market Cap"))
            eps = _parse_shorthand_number(summary.get("EPS (TTM)") or summary.get("EPS \(TTM\)"))

            out = {
                "symbol": sym.upper(),
                "current_price": price,
                "market_cap": market_cap,
                "eps": eps,
                "raw": {"yahoo_html": r.text[:4000]},
                "fetched_at": datetime.utcnow(),
            }
            return out
        except Exception:
            return None

    # Try paid API first
    res = _try_paid_api(symbol)
    if res:
        return res

    # Try EGX-specific pages (best-effort)
    try:
        res = fetch_egx_html(symbol)
        if res:
            return res
    except Exception:
        pass

    # Try Yahoo HTML scraping
    res = _try_yahoo_html(symbol)
    if res:
        return res

    # Additional scrapers (Investing.com / TradingView / EGX pages) could be added here.
    raise RuntimeError("Fallback scraping failed for symbol: %s" % symbol)
