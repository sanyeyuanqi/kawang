from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)

_VERIFICATION_CODE_TEMPLATE = """\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td align="center" style="padding:40px 0;">
      <table border="0" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="background-color:#2562EB;padding:30px 0;border-radius:8px 8px 0 0;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">Kawang Shop</h1>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:40px 30px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <p style="font-size:16px;color:#333333;margin:0 0 24px 0;">Hello,</p>
            <p style="font-size:15px;color:#555555;margin:0 0 28px 0;line-height:1.6;">
              Your verification code is:
            </p>
            <div style="text-align:center;margin:30px 0;">
              <span style="display:inline-block;font-size:42px;font-weight:700;letter-spacing:8px;color:#2562EB;background-color:#f0f4ff;padding:16px 32px;border-radius:8px;font-family:monospace;">{code}</span>
            </div>
            <p style="font-size:14px;color:#999999;margin:28px 0 0 0;line-height:1.5;">
              This code is valid for 5 minutes. If you did not request this code, please ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 0 0 0;">
            <p style="font-size:12px;color:#aaaaaa;margin:0;">Kawang Shop &copy; 2026. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


class EmailDeliveryError(Exception):
    """User-facing email delivery failure."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _normalize_email_error(exc: Exception) -> EmailDeliveryError:
    error_text = str(exc).lower()
    if (
        "recipient may contain a non-existent account" in error_text
        or "recipient" in error_text
        or "550" in error_text
    ):
        return EmailDeliveryError("邮箱不存在或无法接收验证码，请检查邮箱地址", status_code=400)
    if "wrong_version_number" in error_text or "ssl" in error_text:
        return EmailDeliveryError("邮件服务连接失败，请联系管理员检查邮箱配置", status_code=502)
    return EmailDeliveryError("验证码邮件发送失败，请稍后重试", status_code=502)


class EmailService:
    """Asynchronous email service using QQ SMTP.

    Port 465 uses implicit TLS. Port 587/25 uses STARTTLS after connecting.
    """

    def __init__(self) -> None:
        self.host: str = settings.SMTP_HOST
        self.port: int = settings.SMTP_PORT
        self.user: str = settings.SMTP_USER
        self.password: str = settings.SMTP_PASSWORD
        self.use_tls: bool = settings.SMTP_USE_TLS

    async def send(self, to_email: str, subject: str, html_body: str) -> None:
        """Send an HTML email."""
        if settings.DEBUG and (not self.user or not self.password):
            logger.warning("SMTP credentials missing; debug mode skips email send to %s", to_email)
            return
        message = MIMEMultipart("alternative")
        message["From"] = self.user
        message["To"] = to_email
        message["Subject"] = subject
        message.attach(MIMEText(html_body, "html", "utf-8"))

        use_implicit_tls = self.use_tls and self.port == 465
        use_start_tls = self.use_tls and not use_implicit_tls

        try:
            await aiosmtplib.send(
                message,
                hostname=self.host,
                port=self.port,
                username=self.user,
                password=self.password,
                use_tls=use_implicit_tls,
                start_tls=use_start_tls,
            )
        except Exception as exc:
            logger.warning("SMTP send failed to %s: %s", to_email, exc)
            raise _normalize_email_error(exc) from exc

    async def send_verification_code(self, email: str, code: str) -> None:
        """Send a 6-digit verification code email using the branded HTML template."""
        subject = "Kawang Shop - Email Verification Code"
        html_body = _VERIFICATION_CODE_TEMPLATE.format(code=code)
        await self.send(email, subject, html_body)


email_service: EmailService = EmailService()
