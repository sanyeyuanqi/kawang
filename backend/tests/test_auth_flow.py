from __future__ import annotations

import time

import pytest
from httpx import AsyncClient

from app.api.v1 import auth as auth_module
from app.config import settings
from app.services.email_service import EmailDeliveryError, EmailService
from app.services import email_service as email_service_module
from app.utils.redis import RedisKeys, redis_set


pytestmark = pytest.mark.anyio


async def test_admin_login_refresh_me_and_logout(client: AsyncClient) -> None:
    login_response = await client.post(
        "/auth/login",
        json={"account": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()
    access_token = login_payload["data"]["access_token"]
    refresh_token = login_payload["data"]["refresh_token"]
    assert login_payload["data"]["user"]["role"] == "admin"

    headers = {"Authorization": f"Bearer {access_token}"}
    me_response = await client.get("/users/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["data"]["username"] == settings.ADMIN_USERNAME

    refresh_response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200
    refreshed_token = refresh_response.json()["data"]["access_token"]
    refreshed_headers = {"Authorization": f"Bearer {refreshed_token}"}
    assert (await client.get("/users/me", headers=refreshed_headers)).status_code == 200

    logout_response = await client.post("/auth/logout", headers=refreshed_headers)
    assert logout_response.status_code == 200
    assert (await client.get("/users/me", headers=refreshed_headers)).status_code == 401


async def test_invalid_login_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/login",
        json={"account": f"missing-{time.time_ns()}", "password": "WrongPassword123"},
    )

    assert response.status_code == 401
    assert response.json()["msg"] == "账号或密码错误"


async def test_register_login_and_reset_password_with_redis_code(client: AsyncClient) -> None:
    suffix = time.time_ns()
    email = f"buyer-{suffix}@example.com"
    username = f"buyer_{suffix}"
    register_code = "123456"
    reset_code = "654321"

    await redis_set(RedisKeys.email_code(email), register_code, ttl=300)
    register_response = await client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "Buyer123A",
            "code": register_code,
        },
    )
    assert register_response.status_code == 200
    assert register_response.json()["data"]["user"]["role"] == "buyer"

    login_response = await client.post(
        "/auth/login",
        json={"account": email, "password": "Buyer123A"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["data"]["user"]["username"] == username

    await redis_set(RedisKeys.email_code(email), reset_code, ttl=300)
    reset_response = await client.post(
        "/auth/reset-password",
        json={"email": email, "code": reset_code, "new_password": "Buyer456A"},
    )
    assert reset_response.status_code == 200

    old_login_response = await client.post(
        "/auth/login",
        json={"account": email, "password": "Buyer123A"},
    )
    assert old_login_response.status_code == 401

    new_login_response = await client.post(
        "/auth/login",
        json={"account": email, "password": "Buyer456A"},
    )
    assert new_login_response.status_code == 200
    buyer_token = new_login_response.json()["data"]["access_token"]
    admin_response = await client.get("/admin/dashboard", headers={"Authorization": f"Bearer {buyer_token}"})
    assert admin_response.status_code == 403

    await redis_set(RedisKeys.email_code(email), "000000", ttl=300)
    duplicate_response = await client.post(
        "/auth/register",
        json={
            "username": f"{username}_copy",
            "email": email,
            "password": "Buyer789A",
            "code": "000000",
        },
    )
    assert duplicate_response.status_code == 409


async def test_send_code_uses_email_service_and_rate_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    email = f"code-{time.time_ns()}@example.com"
    sent: dict[str, str] = {}

    async def fake_send_verification_code(target_email: str, code: str) -> None:
        sent["email"] = target_email
        sent["code"] = code

    monkeypatch.setattr(auth_module.email_service, "send_verification_code", fake_send_verification_code)

    response = await client.post("/auth/send-code", json={"email": email, "purpose": "register"})
    assert response.status_code == 200
    assert sent["email"] == email
    assert len(sent["code"]) == 6

    limited_response = await client.post("/auth/send-code", json={"email": email, "purpose": "register"})
    assert limited_response.status_code == 429


async def test_send_code_returns_friendly_message_for_rejected_recipient(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    email = f"missing-{time.time_ns()}@example.com"

    async def fake_send_verification_code(target_email: str, code: str) -> None:
        raise EmailDeliveryError("邮箱不存在或无法接收验证码，请检查邮箱地址", status_code=400)

    monkeypatch.setattr(auth_module.email_service, "send_verification_code", fake_send_verification_code)

    response = await client.post("/auth/send-code", json={"email": email, "purpose": "register"})

    assert response.status_code == 400
    assert response.json()["msg"] == "邮箱不存在或无法接收验证码，请检查邮箱地址"


async def test_email_service_uses_starttls_for_587(monkeypatch: pytest.MonkeyPatch) -> None:
    sent_kwargs: dict[str, object] = {}

    async def fake_send(message: object, **kwargs: object) -> None:
        sent_kwargs.update(kwargs)

    service = EmailService()
    service.host = "smtp.qq.com"
    service.port = 587
    service.user = "sender@example.com"
    service.password = "secret"
    service.use_tls = True
    monkeypatch.setattr(email_service_module.aiosmtplib, "send", fake_send)

    await service.send("buyer@example.com", "Subject", "<p>hello</p>")

    assert sent_kwargs["use_tls"] is False
    assert sent_kwargs["start_tls"] is True


async def test_email_service_masks_raw_recipient_rejection(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_send(message: object, **kwargs: object) -> None:
        raise Exception("(550, 'The recipient may contain a non-existent account, please check the recipient address.')")

    service = EmailService()
    service.host = "smtp.qq.com"
    service.port = 587
    service.user = "sender@example.com"
    service.password = "secret"
    service.use_tls = True
    monkeypatch.setattr(email_service_module.aiosmtplib, "send", fake_send)

    with pytest.raises(EmailDeliveryError) as exc_info:
        await service.send("missing@example.com", "Subject", "<p>hello</p>")

    assert exc_info.value.status_code == 400
    assert str(exc_info.value) == "邮箱不存在或无法接收验证码，请检查邮箱地址"


async def test_email_service_uses_implicit_tls_for_465(monkeypatch: pytest.MonkeyPatch) -> None:
    sent_kwargs: dict[str, object] = {}

    async def fake_send(message: object, **kwargs: object) -> None:
        sent_kwargs.update(kwargs)

    service = EmailService()
    service.host = "smtp.qq.com"
    service.port = 465
    service.user = "sender@example.com"
    service.password = "secret"
    service.use_tls = True
    monkeypatch.setattr(email_service_module.aiosmtplib, "send", fake_send)

    await service.send("buyer@example.com", "Subject", "<p>hello</p>")

    assert sent_kwargs["use_tls"] is True
    assert sent_kwargs["start_tls"] is False


async def test_admin_role_can_access_admin_api(client: AsyncClient, admin_token: str) -> None:
    response = await client.get("/admin/dashboard", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["code"] == 200
