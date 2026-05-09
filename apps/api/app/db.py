from __future__ import annotations

import os
import sys
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


def _default_db_url() -> str:
    # When frozen by PyInstaller, store the DB next to the .exe (persistent user data).
    # In dev, store it in apps/api/data/ as before.
    if getattr(sys, 'frozen', False):
        # sys.executable → path/to/api.exe
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    return f"sqlite:///{os.path.join(data_dir, 'trading.db')}"


DATABASE_URL = os.environ.get("TRADING_APP_DATABASE_URL", _default_db_url())

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@contextmanager
def session_scope() -> Session:
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

