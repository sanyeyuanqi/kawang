from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class PaymentEventManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, order_no: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[order_no].add(websocket)

    async def disconnect(self, order_no: str, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._connections.get(order_no)
            if not connections:
                return
            connections.discard(websocket)
            if not connections:
                self._connections.pop(order_no, None)

    async def publish(self, order_no: str, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections.get(order_no, ()))

        stale: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)

        for websocket in stale:
            await self.disconnect(order_no, websocket)

        if connections:
            logger.info("[payment-ws] order_no=%s delivered=%s stale=%s", order_no, len(connections) - len(stale), len(stale))


payment_events = PaymentEventManager()
