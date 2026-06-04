from pydantic import BaseModel, Field

class OrderCreateRequest(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=100, default=1)
    contact_info: str = Field(min_length=6, max_length=32)
    pay_type: int = Field(ge=0, le=1, default=0)
