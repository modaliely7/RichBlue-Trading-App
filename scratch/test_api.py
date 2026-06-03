import requests
import json

BASE_URL = "http://127.0.0.1:8001"

def test_endpoint(path, params=None):
    print(f"Testing {path}...")
    try:
        resp = requests.get(f"{BASE_URL}{path}", params=params)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Keys: {list(data.keys())}")
            return data
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Connection failed: {e}")
    return None

if __name__ == "__main__":
    # 1. Test consolidated technicals
    test_endpoint("/analysis/technical/MBSC")
    
    # 2. Test EGX support
    test_endpoint("/analysis/technical/EGAL")
    
    # 3. Test Stock Potential Simulator
    test_endpoint("/analysis/potential/NIPH", params={"duration": 180})
    
    # 4. Test Stock Score
    test_endpoint("/analysis/stock-score/AMES")
    
    # 5. Test Fundamentals
    test_endpoint("/analysis/fundamentals/MPCI")
