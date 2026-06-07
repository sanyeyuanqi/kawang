import logging
from app.config import settings
from app.utils.haozpay_client import HaoZPayClient, PayInfo, PaymentStatus, RefundResult, PaymentException

logger = logging.getLogger(__name__)


class PaymentService:
    def __init__(self, client: HaoZPayClient | None = None):
        if client:
            self.client = client
        else:
            self.client = HaoZPayClient(
                merchant_no=settings.HAOZPAY_MERCHANT_NO,
                private_key=settings.HAOZPAY_PRIVATE_KEY,
                platform_public_key=settings.HAOZPAY_PLATFORM_PUBLIC_KEY,
                base_url=settings.HAOZPAY_API_BASE_URL,
                debug=settings.HAOZPAY_DEBUG,
            )

    async def create_payment(
        self, order_no: str, order_title: str, amount: int,
        pay_type: int, notify_url: str, return_url: str | None = None,
    ) -> PayInfo:
        if settings.HAOZPAY_DEBUG and (
            not settings.HAOZPAY_MERCHANT_NO
            or not settings.HAOZPAY_PRIVATE_KEY
            or not settings.HAOZPAY_PLATFORM_PUBLIC_KEY
        ):
            logger.warning("Using mock haozpay payment because debug mode is enabled and keys are missing")
            return PayInfo(
                pay_type=pay_type,
                html_form=f"<form method='post' action='/mock-pay'><input name='order_no' value='{order_no}' /></form>",
                qr_content=f"mock-pay://{order_no}",
                haozpay_seq_id=f"MOCK-{order_no}",
            )
        try:
            return await self.client.create_order(
                order_title=order_title, amount=amount, pay_type=pay_type,
                notify_url=notify_url, return_url=return_url, out_trade_no=order_no,
            )
        except PaymentException:
            raise
        except Exception as e:
            logger.exception("create_payment error")
            raise PaymentException(f"创建支付失败: {e}")

    async def process_refund(self, order_no: str, refund_amount: int, reason: str = "") -> RefundResult:
        if settings.HAOZPAY_DEBUG and (
            not settings.HAOZPAY_MERCHANT_NO
            or not settings.HAOZPAY_PRIVATE_KEY
            or not settings.HAOZPAY_PLATFORM_PUBLIC_KEY
        ):
            logger.warning("Using mock haozpay refund because debug mode is enabled and keys are missing")
            return RefundResult(refund_seq_id=f"MOCK-REFUND-{order_no}", refund_amount=str(refund_amount))
        return await self.client.create_refund(order_no, refund_amount, reason)

    async def query_payment(self, gateway_order_no: str) -> PaymentStatus:
        return await self.client.query_order(gateway_order_no)
