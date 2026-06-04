from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.seed import seed


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
async def seeded_data() -> None:
    await seed()


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver/api/v1") as test_client:
        yield test_client


@pytest.fixture
async def admin_token(client: AsyncClient) -> str:
    response = await client.post(
        "/auth/login",
        json={"account": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["user"]["role"] == "admin"
    return payload["data"]["access_token"]
