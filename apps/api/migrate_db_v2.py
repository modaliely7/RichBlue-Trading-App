import sqlite3
import os

db_path = 'data/trading.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    # Set the first active account as main if no active account is main
    cur.execute("SELECT id FROM accounts WHERE is_active = 1 AND is_main = 1")
    if not cur.fetchone():
        print("No active main account found. Setting the first active account as main...")
        cur.execute("UPDATE accounts SET is_main = 1 WHERE id = (SELECT MIN(id) FROM accounts WHERE is_active = 1)")
    
    conn.commit()
    print("Migration adjustment successful.")
except Exception as e:
    print(f"Migration adjustment failed: {e}")
    conn.rollback()
finally:
    conn.close()
