import yfinance as yf
import pandas as pd

symbols = ["EGAL.CA", "MBSC.CA", "NIPH.CA"]

for sym in symbols:
    print(f"--- Fetching {sym} ---")
    tk = yf.Ticker(sym)
    try:
        info = tk.info
        print(f"Price: {info.get('regularMarketPrice') or info.get('currentPrice')}")
        print(f"Name: {info.get('longName')}")
        
        hist = tk.history(period="1mo")
        print(f"History rows: {len(hist)}")
    except Exception as e:
        print(f"Error fetching {sym}: {e}")
