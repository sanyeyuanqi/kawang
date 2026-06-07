from __future__ import annotations

import base64
import json
import logging
import re
from decimal import Decimal
from hashlib import sha256
from typing import Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

_PRIVATE_KEY_CACHE: Optional[rsa.RSAPrivateKey] = None
_PUBLIC_KEY_CACHE: Optional[rsa.RSAPublicKey] = None
_LAST_PRIVATE_PEM: str = ""
_LAST_PUBLIC_PEM: str = ""


def load_private_key(pem_str: str) -> rsa.RSAPrivateKey:
    global _PRIVATE_KEY_CACHE, _LAST_PRIVATE_PEM
    pem_str = normalize_key(pem_str, "PRIVATE KEY")
    if pem_str != _LAST_PRIVATE_PEM or _PRIVATE_KEY_CACHE is None:
        _PRIVATE_KEY_CACHE = serialization.load_pem_private_key(
            pem_str.encode("utf-8"), password=None, backend=default_backend()
        )
        _LAST_PRIVATE_PEM = pem_str
    return _PRIVATE_KEY_CACHE


def load_public_key(pem_str: str) -> rsa.RSAPublicKey:
    global _PUBLIC_KEY_CACHE, _LAST_PUBLIC_PEM
    pem_str = normalize_key(pem_str, "PUBLIC KEY")
    if pem_str != _LAST_PUBLIC_PEM or _PUBLIC_KEY_CACHE is None:
        _PUBLIC_KEY_CACHE = serialization.load_pem_public_key(
            pem_str.encode("utf-8"), backend=default_backend()
        )
        _LAST_PUBLIC_PEM = pem_str
    return _PUBLIC_KEY_CACHE


def normalize_key(key: str, label: str) -> str:
    key = key.strip().strip('"').strip("'")
    if "BEGIN" in key:
        return key
    compact = re.sub(r"\s+", "", key)
    body = "\n".join(compact[i : i + 64] for i in range(0, len(compact), 64))
    return f"-----BEGIN {label}-----\n{body}\n-----END {label}-----\n"


def build_sign_string(params: dict) -> str:
    sorted_keys = sorted(params.keys())
    parts = []
    for k in sorted_keys:
        if k == "sign":
            continue
        v = params[k]
        if v is None or v == "":
            continue
        parts.append(f"{k}={v}")
    return "&".join(parts)


def _rsa_key_size_bytes(key: rsa.RSAPrivateKey | rsa.RSAPublicKey) -> int:
    return (key.key_size + 7) // 8


def _rsa_private_encrypt_pkcs1_v15(message: bytes, private_key: rsa.RSAPrivateKey) -> bytes:
    key_size = _rsa_key_size_bytes(private_key)
    if len(message) > key_size - 11:
        raise ValueError("message too long for RSA private key")
    padding_len = key_size - len(message) - 3
    encoded = b"\x00\x01" + (b"\xff" * padding_len) + b"\x00" + message
    numbers = private_key.private_numbers()
    cipher_int = pow(int.from_bytes(encoded, "big"), numbers.d, numbers.public_numbers.n)
    return cipher_int.to_bytes(key_size, "big")


def _rsa_public_decrypt_pkcs1_v15(ciphertext: bytes, public_key: rsa.RSAPublicKey) -> bytes:
    key_size = _rsa_key_size_bytes(public_key)
    if len(ciphertext) != key_size:
        raise ValueError("invalid RSA ciphertext length")
    numbers = public_key.public_numbers()
    plain = pow(int.from_bytes(ciphertext, "big"), numbers.e, numbers.n).to_bytes(key_size, "big")
    if not plain.startswith(b"\x00\x01"):
        raise ValueError("invalid RSA block")
    sep = plain.find(b"\x00", 2)
    if sep < 0:
        raise ValueError("invalid RSA padding")
    return plain[sep + 1 :]


def sign(params: dict, private_key_pem: str) -> str:
    if not private_key_pem:
        raise PaymentException("缺少 HAOZPAY_PRIVATE_KEY")
    sign_str = build_sign_string(params)
    private_key = load_private_key(private_key_pem)
    digest_hex = sha256(sign_str.encode("utf-8")).hexdigest().encode("utf-8")
    signature = _rsa_private_encrypt_pkcs1_v15(digest_hex, private_key)
    return base64.b64encode(signature).decode("utf-8")


def verify(params: dict, signature: str, platform_public_key_pem: str) -> bool:
    if not platform_public_key_pem:
        logger.warning("[haozpay] platform public key missing")
        return False
    sign_str = build_sign_string(params)
    public_key = load_public_key(platform_public_key_pem)
    try:
        decrypted = _rsa_public_decrypt_pkcs1_v15(base64.b64decode(signature), public_key)
        expected = sha256(sign_str.encode("utf-8")).hexdigest().encode("utf-8")
        return decrypted == expected
    except Exception:
        return False


import httpx
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from app.config import settings

REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_DELAYS = [2, 4, 8]


class PaymentException(Exception):
    def __init__(self, message: str, code: str = "PAYMENT_FAILED"):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")


@dataclass
class PayInfo:
    pay_type: int = 0
    html_form: Optional[str] = None
    qr_url: Optional[str] = None
    qr_content: Optional[str] = None
    haozpay_seq_id: Optional[str] = None


@dataclass
class RefundResult:
    refund_seq_id: str = ""
    refund_amount: str = ""


@dataclass
class PaymentStatus:
    order_no: str = ""
    merchant_no: str = ""
    order_amount: str = ""
    pay_amount: str = ""
    pay_type: str = ""
    pay_channel: str = ""
    pay_status: str = ""
    pay_time: Optional[str] = None
    create_time: Optional[str] = None


class HaoZPayClient:
    def __init__(
        self,
        merchant_no: str = "",
        private_key: str = "",
        platform_public_key: str = "",
        base_url: str = "https://gate.haozpay.com",
        debug: bool = False,
    ):
        self.merchant_no = merchant_no or settings.HAOZPAY_MERCHANT_NO
        self.private_key = private_key or settings.HAOZPAY_PRIVATE_KEY
        self.platform_public_key = platform_public_key or settings.HAOZPAY_PLATFORM_PUBLIC_KEY
        self.base_url = base_url.rstrip("/")
        self.debug = debug or settings.HAOZPAY_DEBUG

    async def _request(self, method: str, path: str, params: dict) -> dict:
        if not self.merchant_no:
            raise PaymentException("缺少 HAOZPAY_MERCHANT_NO")
        url = f"{self.base_url}{path}"
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        public_fields = {"merchantNo": self.merchant_no, "timestamp": timestamp}
        request_body = {
            **public_fields,
            "bizBody": json.dumps(params, ensure_ascii=False, separators=(",", ":")),
        }
        request_body["sign"] = sign({**params, **public_fields}, self.private_key)

        if self.debug:
            logger.debug(f"[haozpay] {method} {url} body={request_body}")

        last_exc = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, trust_env=False) as client:
                    if method.upper() == "POST":
                        resp = await client.post(url, json=request_body)
                    else:
                        resp = await client.get(url, params=request_body)

                if resp.status_code != 200:
                    raise PaymentException(f"haozpay returned {resp.status_code}: {resp.text[:200]}")

                resp_data = resp.json()
                if resp_data.get("code") != 0:
                    raise PaymentException(resp_data.get("msg") or "haozpay order failed")

                if self.debug:
                    logger.debug(f"[haozpay] Response: {resp_data}")
                return resp_data

            except PaymentException:
                raise
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                last_exc = e
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAYS[attempt]
                    logger.warning(f"[haozpay] Retry {attempt+1}/{MAX_RETRIES} in {delay}s: {e}")
                    await asyncio.sleep(delay)
                else:
                    raise PaymentException(f"Request exhausted after {MAX_RETRIES} retries: {last_exc}")

        raise PaymentException(f"Request failed: {last_exc}")

    async def create_order(
        self, order_title: str, amount: int, pay_type: int,
        notify_url: str, return_url: Optional[str] = None,
        out_trade_no: Optional[str] = None,
    ) -> PayInfo:
        order_amount = (Decimal(amount) / Decimal("100")).quantize(Decimal("0.01"))
        params = {
            "orderNo": out_trade_no,
            "orderAmount": str(order_amount),
            "orderTitle": order_title,
            "notifyUrl": notify_url,
            "useHaozPayCashier": "true",
        }
        if return_url:
            params["returnUrl"] = return_url

        resp_data = await self._request("POST", "/pay-core/payment/order", params)
        data = resp_data.get("data") or {}
        pay_info = data.get("payInfo")
        merchant_order_no = data.get("merchantOrderNo")
        return PayInfo(
            pay_type=pay_type,
            qr_url=pay_info,
            qr_content=pay_info,
            haozpay_seq_id=merchant_order_no,
        )

    async def verify_callback(self, params: dict) -> bool:
        if self.debug:
            logger.debug(f"[haozpay] Callback: {params}")
        if self.debug and not self.platform_public_key:
            logger.warning("[haozpay] Debug callback accepted without platform public key")
            return True
        signature = params.get("sign", "")
        if not signature:
            logger.warning("[haozpay] Callback missing sign")
            return False
        return verify(params, signature, self.platform_public_key)

    async def query_order(self, gateway_order_no: str) -> PaymentStatus:
        params = {"orderNo": gateway_order_no}
        resp_data = await self._request("POST", "/pay-core/payment/query", params)
        data = resp_data.get("data") or {}
        return PaymentStatus(
            order_no=str(data.get("orderNo") or ""),
            merchant_no=str(data.get("merchantNo") or ""),
            order_amount=str(data.get("orderAmount") or ""),
            pay_amount=str(data.get("payAmount") or ""),
            pay_type=str(data.get("payType") or ""),
            pay_channel=str(data.get("payChannel") or ""),
            pay_status=str(data.get("payStatus") or ""),
            pay_time=data.get("payTime"),
            create_time=data.get("createTime"),
        )

    async def create_refund(
        self, order_no: str, refund_amount: int, refund_reason: str = ""
    ) -> RefundResult:
        amount = (Decimal(refund_amount) / Decimal("100")).quantize(Decimal("0.01"))
        params = {
            "orderNo": order_no,
            "refundAmount": str(amount),
            "notifyUrl": f"{settings.SITE_URL}/api/v1/orders/refund-callback",
        }
        if refund_reason:
            params["refundReason"] = refund_reason
        resp_data = await self._request("POST", "/pay-core/payment/refund", params)
        return RefundResult(
            refund_seq_id=order_no,
            refund_amount=str(amount),
        )

    async def cancel_order(self, order_no: str) -> bool:
        params = {"orderNo": order_no}
        resp_data = await self._request("POST", "/pay-core/payment/cancel", params)
        return resp_data.get("code") == 0


# Global client instance
haozpay_client = HaoZPayClient()
