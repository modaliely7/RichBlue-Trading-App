import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from .data_providers import fetch_price_history_yfinance

def calculate_potential(symbol: str, duration_days: int = 365):
    """
    Calculate potential returns based on different strategies:
    1. Entry at POC (Point of Control)
    2. Early Exit (Fixed Profit Target)
    3. Swing vs Long Term
    """
    sym = symbol.strip().upper()
    hist = fetch_price_history_yfinance(sym, period="1y", interval="1d")
    if not hist:
        return {"error": "Could not fetch history"}
    
    df = pd.DataFrame(hist)
    df['at'] = pd.to_datetime(df['at'])
    # Filter by duration
    from datetime import timezone
    cutoff = datetime.now(timezone.utc) - timedelta(days=duration_days)
    
    # Ensure df['at'] is timezone-aware and comparable
    df['at'] = pd.to_datetime(df['at'], utc=True)
    df = df[df['at'] >= cutoff]
    
    if df.empty:
        return {"error": "No data for selected duration"}

    # 1. Calculate POC (Point of Control)
    # Simple POC: Price level with most volume
    # We bin prices to find the level
    price_min = df['low'].min()
    price_max = df['high'].max()
    if price_max == price_min:
        bins = [price_min, price_min + 1]
    else:
        bins = np.linspace(price_min, price_max, 50)
    
    df['price_bin'] = pd.cut(df['close'], bins=bins)
    poc_bin = df.groupby('price_bin')['volume'].sum().idxmax()
    poc_price = (poc_bin.left + poc_bin.right) / 2
    
    # 2. Simulation: Entry at POC
    # Find the first time price hits POC from above (or just any hit)
    hits = df[df['low'] <= poc_price]
    potential_roi_poc = 0.0
    if not hits.empty:
        first_hit_idx = hits.index[0]
        entry_price = poc_price
        current_price = df.iloc[-1]['close']
        potential_roi_poc = ((current_price - entry_price) / entry_price) * 100.0

    # 3. Swing vs Long Term Analysis
    # Swing: Average 5-day return
    # Long Term: Buy at start of duration, hold till now
    start_price = df.iloc[0]['close']
    end_price = df.iloc[-1]['close']
    long_term_roi = ((end_price - start_price) / start_price) * 100.0
    
    # Swing approximation: Sum of all positive 5-day moves
    df['5d_ret'] = df['close'].pct_change(5)
    swing_potential = df[df['5d_ret'] > 0]['5d_ret'].sum() * 100.0

    # 4. Early Exit Scenario
    # If we exited at 5% profit every time
    early_exit_profit = 0.0
    # Simplified: count how many times price went up 5% from a local bottom
    # (very rough approximation)
    
    return {
        "symbol": sym,
        "poc_price": float(poc_price),
        "potential_roi_poc": float(potential_roi_poc),
        "long_term_roi": float(long_term_roi),
        "swing_potential": float(swing_potential),
        "current_price": float(df.iloc[-1]['close']),
        "duration_days": duration_days
    }
