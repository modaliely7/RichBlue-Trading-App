import sys
from pathlib import Path

import os
import tempfile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Setup temp DB for testing
fd, temp_db_path = tempfile.mkstemp(suffix=".db")
os.close(fd)
TEST_DATABASE_URL = f"sqlite:///{temp_db_path}"

# Override engine and session in the app's db module
from apps.api.app import db
db.engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
db.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db.engine)

# Create tables
from apps.api.app.models import Base
Base.metadata.create_all(bind=db.engine)

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
    print(f"DEBUG: deposit balance={data['balance']}, overview cash_balance={overview_data['kpis']['cash_balance']}")
    assert overview_data['kpis']['cash_balance'] == data['balance']
    # If no trades exist, portfolio value should be just cash
    # However we don't know the exact starting state in tests unless we mock the DB
    assert isinstance(overview_data['kpis']['net_deposited'], float)

def test_cash_transaction_update_and_delete():
    client = TestClient(app)
    
    # 1. Create a deposit
    deposit_resp = client.post('/cash/deposit', json={'amount': 250.0, 'note': 'To be edited'})
    assert deposit_resp.status_code == 200
    tx_id = deposit_resp.json()['tx_id']
    
    # 2. Update it
    update_resp = client.put(f'/cash/transactions/{tx_id}', json={'amount': 300.0, 'note': 'Edited note'})
    assert update_resp.status_code == 200
    update_data = update_resp.json()
    assert update_data['amount'] == 300.0
    assert update_data['note'] == 'Edited note'
    
    # 3. Delete it
    del_resp = client.delete(f'/cash/transactions/{tx_id}')
    assert del_resp.status_code == 200
    assert del_resp.json()['deleted'] is True
