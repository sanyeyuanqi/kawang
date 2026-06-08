from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.outlook_code_service import OutlookCodeError, fetch_outlook_code

router = APIRouter()


class OutlookCodeRequest(BaseModel):
    combo: str


def _error(status_code: int, code: int, msg: str) -> None:
    from app.main import AppError

    raise AppError(code=code, msg=msg, status_code=status_code)


@router.post("/outlook-code/fetch")
async def outlook_code_fetch(req: OutlookCodeRequest) -> dict[str, Any]:
    try:
        result = await fetch_outlook_code(req.combo)
    except OutlookCodeError as exc:
        _error(400, 400, str(exc))

    return {
        "code": 200,
        "msg": "success",
        "data": result,
    }
