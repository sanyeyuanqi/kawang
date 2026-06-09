from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any

import httpx

TOKEN_ENDPOINTS = (
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
)
GRAPH_MESSAGES_ENDPOINT = (
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"
    "?$top=15&$orderby=receivedDateTime%20desc"
    "&$select=id,subject,bodyPreview,body,from,receivedDateTime"
)


class OutlookCodeError(Exception):
    pass


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return " ".join(self.parts)


def parse_outlook_combo(raw: str) -> dict[str, str]:
    parts = raw.strip().split("----")
    if len(parts) < 4:
        raise OutlookCodeError("格式不正确，需要：邮箱----密码----client_id----refresh_token")

    email, password, client_id, *token_parts = parts
    refresh_token = re.sub(r"\s+", "", "----".join(token_parts))
    if not email.strip() or not client_id.strip() or not refresh_token:
        raise OutlookCodeError("邮箱、client_id 或 refresh_token 不能为空")

    return {
        "email": email.strip(),
        "password": password.strip(),
        "client_id": client_id.strip(),
        "refresh_token": refresh_token,
    }


def html_to_text(html: str) -> str:
    parser = TextExtractor()
    parser.feed(html or "")
    return parser.text()


def extract_code(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text)
    keyword_pattern = re.compile(
        r"验证码|校验码|安全代码|动态码|一次性代码|"
        r"verification code|security code|single[-\s]?use code|"
        r"one[-\s]?time code|passcode|your code|code is",
        re.IGNORECASE,
    )
    code_patterns = (
        re.compile(
            r"(?:验证码|校验码|安全代码|动态码|一次性代码|verification code|security code|single[-\s]?use code|one[-\s]?time code|passcode|your code|code is)"
            r"[^A-Z0-9]{0,80}([A-Z0-9]{4,8})",
            re.IGNORECASE,
        ),
        re.compile(
            r"([A-Z0-9]{4,8})[^A-Z0-9]{0,40}(?:验证码|校验码|安全代码|动态码|一次性代码|verification code|security code|passcode)",
            re.IGNORECASE,
        ),
    )

    def clean_candidate(value: str) -> str:
        candidate = value.upper()
        if len(candidate) < 4 or len(candidate) > 8:
            return ""
        if not re.search(r"\d", candidate):
            return ""
        return candidate

    for pattern in code_patterns:
        match = pattern.search(normalized)
        if match:
            candidate = clean_candidate(match.group(1))
            if candidate:
                return candidate

    for keyword_match in keyword_pattern.finditer(normalized):
        window_start = max(0, keyword_match.start() - 60)
        window_end = min(len(normalized), keyword_match.end() + 120)
        window = normalized[window_start:window_end]
        for match in re.finditer(r"\b([A-Z0-9]{4,8})\b", window, re.IGNORECASE):
            candidate = clean_candidate(match.group(1))
            if candidate:
                return candidate

    return ""


def _message_body_text(message: dict[str, Any]) -> str:
    body = message.get("body") or {}
    content = body.get("content") or ""
    if (body.get("contentType") or "").lower() == "html":
        content = html_to_text(content)
    return content or message.get("bodyPreview") or ""


def _message_text(message: dict[str, Any]) -> str:
    content = _message_body_text(message)
    return "\n".join(
        [
            message.get("subject") or "",
            message.get("bodyPreview") or "",
            content,
        ]
    )


def find_latest_code(messages: list[dict[str, Any]]) -> dict[str, str] | None:
    for message in messages:
        text = _message_text(message)
        code = extract_code(text)
        if not code:
            continue

        sender = ((message.get("from") or {}).get("emailAddress") or {})
        return {
            "code": code,
            "from": sender.get("address") or sender.get("name") or "",
            "subject": message.get("subject") or "",
            "received_at": message.get("receivedDateTime") or "",
            "body_preview": message.get("bodyPreview") or "",
            "body_text": _message_body_text(message),
        }
    return None


def _normalize_http_error(exc: httpx.HTTPStatusError) -> str:
    try:
        payload = exc.response.json()
    except ValueError:
        return exc.response.text or f"HTTP {exc.response.status_code}"

    error = payload.get("error")
    if isinstance(error, dict):
        return error.get("message") or str(error)
    return payload.get("error_description") or error or f"HTTP {exc.response.status_code}"


async def _post_form(client: httpx.AsyncClient, url: str, data: dict[str, str]) -> dict[str, Any]:
    response = await client.post(
        url,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "KawangOutlookCodeReader/1.0",
        },
    )
    response.raise_for_status()
    return response.json()


async def refresh_access_token(account: dict[str, str]) -> tuple[str, str | None]:
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        for endpoint in TOKEN_ENDPOINTS:
            try:
                data = await _post_form(
                    client,
                    endpoint,
                    {
                        "client_id": account["client_id"],
                        "refresh_token": account["refresh_token"],
                        "grant_type": "refresh_token",
                        "scope": "offline_access https://graph.microsoft.com/Mail.Read",
                    },
                )
                access_token = data.get("access_token")
                if access_token:
                    return access_token, data.get("refresh_token")
                errors.append(f"{endpoint}: no access_token")
            except httpx.HTTPStatusError as exc:
                errors.append(f"{endpoint}: {_normalize_http_error(exc)}")
            except Exception as exc:  # noqa: BLE001 - returned as a user-facing diagnostic
                errors.append(f"{endpoint}: {exc}")

    raise OutlookCodeError("令牌刷新失败：" + "\n".join(errors))


async def fetch_messages(access_token: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        response = await client.get(
            GRAPH_MESSAGES_ENDPOINT,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Prefer": 'outlook.body-content-type="text"',
                "User-Agent": "KawangOutlookCodeReader/1.0",
            },
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise OutlookCodeError(_normalize_http_error(exc)) from exc
        data = response.json()
        return data.get("value") or []


async def fetch_outlook_code(combo: str) -> dict[str, Any]:
    account = parse_outlook_combo(combo)
    access_token, new_refresh_token = await refresh_access_token(account)
    messages = await fetch_messages(access_token)
    result = find_latest_code(messages)
    if not result:
        raise OutlookCodeError("最新 15 封邮件里没有识别到验证码")

    result["email"] = account["email"]
    if new_refresh_token and new_refresh_token != account["refresh_token"]:
        result["refresh_token"] = new_refresh_token
    return result
