import json
from datetime import datetime
from typing import Any
import pandas as pd
import ta

from .data_providers import fetch_price_history_yfinance
from .models import QuantitativeMetrics

def refresh_quant(session, symbol: str) -> dict[str, Any]:
    """Fetch price history, calculate quantitative indicators, and save to DB."""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ValueError("Invalid symbol")

    try:
        hist = fetch_price_history_yfinance(sym, period="6m", interval="1d")
        if not hist or len(hist) < 30:
            raise ValueError("Not enough historical data")
    except Exception as e:
        raise RuntimeError(f"Failed to fetch history for {sym}: {e}") from e

    df = pd.DataFrame(hist)
    df.set_index("at", inplace=True)
    df.sort_index(inplace=True)

    # Calculate typical price for VWAP
    df['typical_price'] = (df['high'] + df['low'] + df['close']) / 3
    df['cum_vol'] = df['volume'].cumsum()
    df['cum_pv'] = (df['typical_price'] * df['volume']).cumsum()
    df['vwap'] = df['cum_pv'] / df['cum_vol']

    # Relative Volume (RVOL)
    # Average volume over the last 20 days
    df['vol_sma'] = df['volume'].rolling(window=20).mean()
    df['rvol'] = df['volume'] / df['vol_sma']

    # Accumulation / Distribution (A/D)
    df['ad'] = ta.volume.acc_dist_index(df['high'], df['low'], df['close'], df['volume'])
    
    # Chaikin Money Flow (CMF)
    df['cmf'] = ta.volume.chaikin_money_flow(df['high'], df['low'], df['close'], df['volume'], window=20)

    # Volatility Contraction
    df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
    df['atr_sma'] = df['atr'].rolling(window=20).mean()
    
    latest = df.iloc[-1].to_dict()
    prev = df.iloc[-2].to_dict() if len(df) > 1 else latest

    # 1. Unusual Volume Detection
    rvol = latest.get('rvol', 0)
    if pd.isna(rvol): rvol = 0
    
    unusual_volume = "Normal"
    if rvol > 3: unusual_volume = "Strong Institutional Activity"
    elif rvol > 2: unusual_volume = "Unusual Activity"

    # 2. Accumulation vs Distribution
    cmf = latest.get('cmf', 0)
    if pd.isna(cmf): cmf = 0
    ad_status = "Neutral"
    if cmf > 0.1: ad_status = "Accumulation"
    elif cmf < -0.1: ad_status = "Distribution"

    # 3. Breakout Probability
    # Breakout depends on volume expansion and volatility contraction
    volat_contraction = False
    if pd.notna(latest.get('atr')) and pd.notna(latest.get('atr_sma')):
        if latest['atr'] < latest['atr_sma']:
            volat_contraction = True
            
    breakout_prob = 40.0
    if volat_contraction: breakout_prob += 20
    if rvol > 1.5: breakout_prob += 20
    if latest['close'] > latest['vwap']: breakout_prob += 10
    
    breakout_prob = min(99.0, breakout_prob)

    # 4. Quantitative Score
    score = 50
    # Volume Strength
    if rvol > 1.5: score += 12.5
    elif rvol < 0.5: score -= 12.5
    # Accumulation
    if cmf > 0.1: score += 12.5
    elif cmf < -0.1: score -= 12.5
    # Breakout
    if breakout_prob > 60: score += 12.5
    # Price vs VWAP
    if latest['close'] > latest['vwap']: score += 12.5
    else: score -= 12.5

    total_score = int(max(0, min(100, score)))

    if total_score >= 80: rating = "Strong Institutional Buying"
    elif total_score >= 60: rating = "Accumulation"
    elif total_score >= 40: rating = "Neutral"
    elif total_score >= 20: rating = "Distribution"
    else: rating = "Heavy Selling"

    payload = {
        "rvol": float(rvol) if pd.notna(rvol) else 0.0,
        "unusual_volume": unusual_volume,
        "cmf": float(cmf) if pd.notna(cmf) else 0.0,
        "ad_status": ad_status,
        "vwap": float(latest.get('vwap', 0)) if pd.notna(latest.get('vwap')) else 0.0,
        "breakout_probability": float(breakout_prob) if pd.notna(breakout_prob) else 0.0
    }

    qm = QuantitativeMetrics(
        symbol=sym,
        provider="yfinance",
        fetched_at=datetime.utcnow(),
        payload=json.dumps(payload),
        score=total_score,
        signal=rating
    )
    session.add(qm)
    session.flush()

    return {
        "symbol": sym,
        "score": total_score,
        "signal": rating,
        "payload": payload,
        "fetched_at": qm.fetched_at
    }
