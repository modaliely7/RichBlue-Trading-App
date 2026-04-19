import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.app.main import app


def test_cash_deposit_updates_balance_and_overview():
    client = TestClient(app)

    # deposit 100 units into the cash ledger
    deposit_resp = client.post('/cash/deposit', json={'amount': 100.0, 'note': 'Test deposit'})
    assert deposit_resp.status_code == 200
    data = deposit_resp.json()
    assert 'balance' in data
    assert data['balance'] >= 100.0
    assert 'tx_id' in data

    # overview should load successfully and reflect the cash balance
    overview_resp = client.get('/overview')
    assert overview_resp.status_code == 200
    overview_data = overview_resp.json()
    assert overview_data['kpis']['cash_balance'] == data['balance']
    assert overview_data['kpis']['portfolio_value'] == overview_data['kpis']['cash_balance']
    assert isinstance(overview_data['kpis']['net_deposited'], float)
