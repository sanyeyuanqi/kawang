from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Kawang Shop"
    DEBUG: bool = False
    SITE_URL: str = "http://localhost:8000"

    # Database
    DATABASE_URL: str = "mysql+asyncmy://root:root@localhost:3306/shop"
    DATABASE_URL_SYNC: str = "mysql+pymysql://root:root@localhost:3306/shop"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50

    # JWT
    JWT_SECRET: str = "change-me-to-a-random-string-min-32-chars-long"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Haozpay
    HAOZPAY_MERCHANT_NO: str = ""
    HAOZPAY_PRIVATE_KEY: str = ""
    HAOZPAY_PLATFORM_PUBLIC_KEY: str = ""
    HAOZPAY_API_BASE_URL: str = "https://gate.haozpay.com"
    HAOZPAY_DEBUG: bool = False

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:80",
    ]

    # Upload
    UPLOAD_DIR: str = str(Path(__file__).resolve().parent.parent / "static" / "uploads")
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # 5MB
    ALLOWED_EXTENSIONS: set[str] = {"jpg", "jpeg", "png", "webp", "gif"}

    # SMTP
    SMTP_HOST: str = "smtp.qq.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True

    # Admin seed
    ADMIN_USERNAME: str = "sanye"
    ADMIN_PASSWORD: str = "change-me-admin-password"

    # Limits
    EMAIL_CODE_EXPIRE_SECONDS: int = 300
    LOGIN_ATTEMPT_LIMIT: int = 5
    LOGIN_ATTEMPT_WINDOW_SECONDS: int = 300
    ORDER_EXPIRE_MINUTES: int = 15

    # Pagination
    PAGE_DEFAULT_SIZE: int = 20
    PAGE_MAX_SIZE: int = 100

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env.example", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

UPLOAD_PATH = Path(settings.UPLOAD_DIR)
UPLOAD_PATH.mkdir(parents=True, exist_ok=True)
