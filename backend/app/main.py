from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: int, msg: str, status_code: int = 400):
        self.code = code
        self.msg = msg
        self.status_code = status_code


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        from app.utils.redis import get_redis
        r = await get_redis()
        await r.ping()
        print("[OK] Redis connected")
    except Exception as e:
        print(f"[WARN] Redis not available: {e}")

    try:
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(  # type: ignore
                __import__("sqlalchemy").text("SELECT 1")
            )
        print("[OK] Database connected")
    except Exception as e:
        print(f"[WARN] Database not available: {e}")

    from app.utils.scheduler import start_scheduler
    start_scheduler()

    yield

    from app.utils.scheduler import stop_scheduler
    stop_scheduler()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "msg": exc.msg, "data": None},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled request error: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "msg": "服务异常", "data": None},
    )


@app.get("/health")
async def health_check():
    return {"code": 200, "msg": "success", "data": {"status": "healthy"}}


@app.get("/api/v1/health")
async def api_health_check():
    return {"code": 200, "msg": "success", "data": {"status": "healthy"}}


# Mount static files for uploads
import os
upload_dir = settings.UPLOAD_DIR
if not os.path.isabs(upload_dir):
    upload_dir = os.path.join(os.path.dirname(__file__), "..", upload_dir)
os.makedirs(upload_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=upload_dir), name="static")

# Register API routers
from app.api.v1.router import api_router
app.include_router(api_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
