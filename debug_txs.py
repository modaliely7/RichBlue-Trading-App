
from apps.api.app.db import session_scope
from apps.api.app.models import CashTransaction
from datetime import datetime

with session_scope() as s:
    txs = s.query(CashTransaction).all()
    print(f"Total transactions: {len(txs)}")
    for tx in txs:
        print(f"ID: {tx.id}, Amount: {tx.amount}, Date: {tx.at}")
    
    now = datetime.utcnow().date()
    print(f"Current UTC date: {now}")
