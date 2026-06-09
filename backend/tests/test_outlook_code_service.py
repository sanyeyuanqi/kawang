import pytest

from app.services.outlook_code_service import (
    extract_code,
    find_latest_code,
    parse_outlook_combo,
)

pytestmark = pytest.mark.anyio


async def test_parse_outlook_combo_keeps_refresh_token_with_delimiters():
    account = parse_outlook_combo("user@outlook.com----pass----client-id----part1----part2")

    assert account["email"] == "user@outlook.com"
    assert account["password"] == "pass"
    assert account["client_id"] == "client-id"
    assert account["refresh_token"] == "part1----part2"


async def test_extract_code_prefers_labeled_verification_code():
    text = "Your verification code is 493812. The order number is 100200."

    assert extract_code(text) == "493812"


async def test_extract_code_ignores_unlabeled_numbers_in_regular_notifications():
    text = (
        "Access everything all in one place. View as a webpage "
        "https://notificationemails.microsoft.com/r/?id=he5ec6119,660ee888,66374b7 "
        "Microsoft Corporation, One Microsoft Way, Redmond, WA 98052."
    )

    assert extract_code(text) == ""


async def test_find_latest_code_skips_regular_notification_before_code_email():
    result = find_latest_code(
        [
            {
                "subject": "Microsoft Log",
                "bodyPreview": "Access everything all in one place. Redmond, WA 98052.",
                "body": {"contentType": "text", "content": "Access everything all in one place. Redmond, WA 98052."},
                "from": {"emailAddress": {"address": "notice@microsoft.com"}},
                "receivedDateTime": "2026-06-08T08:10:00Z",
            },
            {
                "subject": "Security code",
                "bodyPreview": "Your single-use code is 742918.",
                "body": {"contentType": "text", "content": "Your single-use code is 742918."},
                "from": {"emailAddress": {"address": "account-security-noreply@accountprotection.microsoft.com"}},
                "receivedDateTime": "2026-06-08T08:00:00Z",
            },
        ]
    )

    assert result is not None
    assert result["code"] == "742918"


async def test_find_latest_code_returns_message_metadata():
    result = find_latest_code(
        [
            {
                "subject": "登录验证码",
                "bodyPreview": "验证码：AB12CD",
                "body": {"contentType": "text", "content": "验证码：AB12CD"},
                "from": {"emailAddress": {"address": "notice@example.com"}},
                "receivedDateTime": "2026-06-08T08:00:00Z",
            }
        ]
    )

    assert result == {
        "code": "AB12CD",
        "from": "notice@example.com",
        "subject": "登录验证码",
        "received_at": "2026-06-08T08:00:00Z",
        "body_preview": "验证码：AB12CD",
        "body_text": "验证码：AB12CD",
    }
