"""
run_api.py — PyInstaller entry-point for the RichBlue FastAPI backend.

This file is referenced in api.spec as the Analysis target.
It runs uvicorn programmatically so the frozen exe has no shell dependency.
"""
from pathlib import Path
import multiprocessing
import sys
import traceback

# multiprocessing.freeze_support() MUST run before any other imports on Windows
# when packaged with PyInstaller. Otherwise multiprocessing workers can't bootstrap.
multiprocessing.freeze_support()

import uvicorn


_CRASH_LOG = Path(__file__).resolve().parent / "crash.log"


def main():
    try:
        from app.main import app
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8001,
            log_level="warning",   # quiet in production
        )
    except Exception:
        with open(_CRASH_LOG, "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        raise

if __name__ == "__main__":
    main()
