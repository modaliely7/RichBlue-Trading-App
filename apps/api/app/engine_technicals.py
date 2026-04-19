import json
from datetime import datetime
from typing import Any
import pandas as pd
import ta

from .data_providers import fetch_price_history_yfinance
from .models import TechnicalMetrics

def refresh_technicals(session, symbol: str) -> dict[str, Any]:
    """Fetch price history, calculate technical indicators, and save to DB."""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ValueError("Invalid symbol")

    # Fetch 1 year of daily data for robust indicator calculation
    try:
        hist = fetch_price_history_yfinance(sym, period="1y", interval="1d")
        if not hist or len(hist) < 50:
            raise ValueError("Not enough historical data")
    except Exception as e:
        raise RuntimeError(f"Failed to fetch history for {sym}: {e}") from e

    df = pd.DataFrame(hist)
    df.set_index("at", inplace=True)
    df.sort_index(inplace=True)

    # 1. Trend Indicators
    df['ma20'] = ta.trend.sma_indicator(df['close'], window=20)
    df['ma50'] = ta.trend.sma_indicator(df['close'], window=50)
    df['ma200'] = ta.trend.sma_indicator(df['close'], window=200)
    df['ema20'] = ta.trend.ema_indicator(df['close'], window=20)

    # 2. Momentum Indicators
    df['rsi'] = ta.momentum.rsi(df['close'], window=14)
    df['macd'] = ta.trend.macd(df['close'])
    df['macd_signal'] = ta.trend.macd_signal(df['close'])
    df['macd_hist'] = ta.trend.macd_diff(df['close'])
    df['stoch'] = ta.momentum.stoch(df['high'], df['low'], df['close'], window=14, smooth_window=3)

    # 3. Volatility Indicators
    df['bb_high'] = ta.volatility.bollinger_hband(df['close'], window=20, window_dev=2)
    df['bb_low'] = ta.volatility.bollinger_lband(df['close'], window=20, window_dev=2)
    df['bb_mid'] = ta.volatility.bollinger_mavg(df['close'], window=20)
    df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)

    # 4. Volume Indicators
    df['obv'] = ta.volume.on_balance_volume(df['close'], df['volume'])
    df['vol_ma'] = ta.trend.sma_indicator(df['volume'], window=20)

    # Get latest row
    latest = df.iloc[-1].to_dict()
    prev = df.iloc[-2].to_dict() if len(df) > 1 else latest

    # Signal Logic
    bullish_signals = []
    bearish_signals = []

    price = latest['close']

    # Trend checks
    if pd.notna(latest['ma50']) and pd.notna(latest['ma200']):
        if price > latest['ma50'] and price > latest['ma200']:
            bullish_signals.append("Price > MA50 & MA200")
        elif price < latest['ma50'] and price < latest['ma200']:
            bearish_signals.append("Price < MA50 & MA200")

    # RSI
    rsi_val = latest.get('rsi')
    if pd.notna(rsi_val):
        if 50 <= rsi_val <= 70:
            bullish_signals.append(f"RSI Bullish ({rsi_val:.1f})")
        elif rsi_val < 40:
            bearish_signals.append(f"RSI Bearish ({rsi_val:.1f})")
        elif rsi_val > 70:
            bearish_signals.append(f"RSI Overbought ({rsi_val:.1f})")
        elif rsi_val < 30:
            bullish_signals.append(f"RSI Oversold ({rsi_val:.1f})")

    # MACD
    macd_val = latest.get('macd')
    macd_sig = latest.get('macd_signal')
    macd_hist = latest.get('macd_hist')
    if pd.notna(macd_hist) and pd.notna(prev.get('macd_hist')):
        if macd_hist > 0 and prev['macd_hist'] <= 0:
            bullish_signals.append("MACD Bullish Crossover")
        elif macd_hist < 0 and prev['macd_hist'] >= 0:
            bearish_signals.append("MACD Bearish Crossover")

    # Score Engine (0 - 100)
    score = 50 # Start neutral
    
    # Trend Strength (0-25)
    trend_score = 12.5
    if pd.notna(latest['ma50']) and pd.notna(latest['ma20']):
        if latest['ma20'] > latest['ma50']: trend_score += 6.25
        else: trend_score -= 6.25
    if pd.notna(latest['ma200']):
        if price > latest['ma200']: trend_score += 6.25
        else: trend_score -= 6.25

    # Momentum (0-25)
    mom_score = 12.5
    if pd.notna(rsi_val):
        if rsi_val > 50: mom_score += 6.25
        else: mom_score -= 6.25
    if pd.notna(macd_hist):
        if macd_hist > 0: mom_score += 6.25
        else: mom_score -= 6.25

    # Volume (0-25)
    vol_score = 12.5
    if pd.notna(latest['vol_ma']):
        if latest['volume'] > latest['vol_ma']: vol_score += 6.25
    if pd.notna(latest['obv']) and pd.notna(prev.get('obv')):
        if latest['obv'] > prev['obv']: vol_score += 6.25
        else: vol_score -= 6.25

    # Volatility / Breakouts (0-25)
    volat_score = 12.5
    if pd.notna(latest['bb_high']):
        if price > latest['bb_high']: volat_score += 6.25  # breakout
        elif price < latest['bb_low']: volat_score -= 6.25 # breakdown

    total_score = int(max(0, min(100, trend_score + mom_score + vol_score + volat_score)))

    # Determine Rating
    if total_score >= 80: rating = "Strong Bullish"
    elif total_score >= 60: rating = "Bullish"
    elif total_score >= 40: rating = "Neutral"
    elif total_score >= 20: rating = "Bearish"
    else: rating = "Strong Bearish"

    payload = {
        "price": float(price) if pd.notna(price) else 0.0,
        "indicators": {k: float(v) if pd.notna(v) else None for k, v in latest.items() if k not in ["open", "high", "low", "close", "volume", "at"]},
        "bullish_signals": bullish_signals,
        "bearish_signals": bearish_signals
    }

    # Save to DB
    tm = TechnicalMetrics(
        symbol=sym,
        provider="yfinance",
        fetched_at=datetime.utcnow(),
        payload=json.dumps(payload),
        score=total_score,
        signal=rating
    )
    session.add(tm)
    session.flush()

    return {
        "symbol": sym,
        "score": total_score,
        "signal": rating,
        "payload": payload,
        "fetched_at": tm.fetched_at
    }
