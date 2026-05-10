import yfinance as yf
import json

def test(symbol):
    print(f"Testing {symbol}...")
    tk = yf.Ticker(symbol)
    try:
        info = tk.info
        print(f"longName: {info.get('longName')}")
        print(f"quoteType: {info.get('quoteType')}")
    except Exception as e:
        print(f"Error: {e}")

test("AAPL")
test("BTC-USD")
