"""
run_api.py — PyInstaller entry-point for the RichBlue FastAPI backend.

This file is referenced in api.spec as the Analysis target.
It runs uvicorn programmatically so the frozen exe has no shell dependency.
"""
import multiprocessing
import uvicorn
import sys
import traceback

def main():
    try:
        from app.main import app
        # multiprocessing.freeze_support() is required for PyInstaller on Windows
        multiprocessing.freeze_support()
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8001,
            log_level="warning",   # quiet in production
        )
    except Exception as e:
        with open("crash.log", "w") as f:
            f.write(traceback.format_exc())

if __name__ == "__main__":
    main()
