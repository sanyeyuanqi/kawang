#!/bin/sh
set -e

python - <<'PY'
import asyncio
from sqlalchemy import text
from app.database import engine

async def wait_for_database():
    last_error = None
    for _ in range(60):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(2)
    raise SystemExit(f"Database is not ready: {last_error}")

asyncio.run(wait_for_database())
PY

alembic upgrade head
python -m app.seed

: "${UVICORN_WORKERS:=4}"

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "$UVICORN_WORKERS"
