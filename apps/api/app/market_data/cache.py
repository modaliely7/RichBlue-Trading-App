"""Thread-safe TTL cache for in-process market data.

A simple dict + threading.Lock keeps the surface area minimal. The TTL is
expressed in seconds; entries past their expiry are treated as misses and
lazily re-fetched on next read.
"""
from __future__ import annotations

import threading
import time
from typing import Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    def __init__(self, default_ttl: int = 900) -> None:
        self._ttl = default_ttl
        self._data: dict[str, tuple[float, T]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> T | None:
        now = time.monotonic()
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at <= now:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: T, ttl: int | None = None) -> None:
        expires_at = time.monotonic() + (ttl if ttl is not None else self._ttl)
        with self._lock:
            self._data[key] = (expires_at, value)

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._data)
