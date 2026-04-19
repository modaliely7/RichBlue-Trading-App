import sqlite3
import os

db_path = 'data/trading.db'
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    # 1. Add is_main to accounts
    cur.execute("PRAGMA table_info(accounts)")
    cols = [c[1] for c in cur.fetchall()]
    if 'is_main' not in cols:
        print("Adding is_main to accounts...")
        cur.execute("ALTER TABLE accounts ADD COLUMN is_main BOOLEAN DEFAULT 0")
        # Set the first account as main if any exist
        cur.execute("UPDATE accounts SET is_main = 1 WHERE id = (SELECT MIN(id) FROM accounts)")
    
    # 2. Add account_id to lessons
    cur.execute("PRAGMA table_info(lessons)")
    cols = [c[1] for c in cur.fetchall()]
    if 'account_id' not in cols:
        print("Adding account_id to lessons...")
        cur.execute("ALTER TABLE lessons ADD COLUMN account_id INTEGER DEFAULT 1 REFERENCES accounts(id)")

    conn.commit()
    print("Migration successful.")
except Exception as e:
    print(f"Migration failed: {e}")
    conn.rollback()
finally:
    conn.close()
