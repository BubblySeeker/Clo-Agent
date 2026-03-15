"""
Database helpers for the AI service.
Uses psycopg2 (sync) wrapped with asyncio.to_thread for use inside async functions.
"""
import asyncio
from contextlib import contextmanager
from typing import Any

import psycopg2
import psycopg2.extras
import psycopg2.pool

from app.config import DATABASE_URL

# Thread-safe connection pool (1-10 connections)
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, DATABASE_URL)
    return _pool


@contextmanager
def get_conn():
    """Sync context manager that borrows a connection from the pool."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


async def run_query(fn) -> Any:
    """Run a sync DB function in a thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(fn)
