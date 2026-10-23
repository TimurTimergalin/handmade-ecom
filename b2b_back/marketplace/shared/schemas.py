from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic.alias_generators import to_camel


class DTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", from_attributes=True
    )


T = TypeVar("T")
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Money = Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)]
Stock = Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)]
MaxDays = Annotated[int, Field(strict=True, ge=0, le=365)]


class APIError(DTO):
    code: str
    message: str
    details: dict | None = None
    request_id: str | None = None


class Envelope[T](DTO):
    data: T | None = None
    error: APIError | None = None


class Page[T](DTO):
    items: list[T]
    total: int
    page: int
    page_size: int


class SaleMode(StrEnum):
    ONLINE = "online"
    OUT_OF_STOCK = "out_of_stock"
    DEAL_ONLY = "deal_only"


class DeliveryMethod(StrEnum):
    PICKUP = "pickup"
    CDEK = "cdek"


class PostStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class Tier(StrEnum):
    FREE = "free"
    PREMIUM = "premium"


class OrderStatus(StrEnum):
    CREATED = "created"
    PAID = "paid"
    SHIPPED = "shipped"
    DELIVERING = "delivering"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PickupPoint(DTO):
    """Пункт самовывоза при чтении. У старых записей maxDays может отсутствовать."""

    city: Text
    address: Text
    max_days: MaxDays | None = None


class PickupPointInput(PickupPoint):
    """Пункт самовывоза при записи. Срок доставки обязателен."""

    max_days: MaxDays


class Identity(DTO):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    roles: set[str]
    display_name: str = ""
    username: str = ""
    avatar: str = ""
    email: str = ""
    bio: str = ""
    created_at: datetime | None = None

    @field_validator("bio", "avatar", "display_name", "username", "email", mode="before")
    @classmethod
    def null_to_empty(cls, value):
        return "" if value is None else value


class Entitlements(DTO):
    seller_id: UUID
    tier: Tier
    product_limit: int | None
    post_limit: int | None
    online_payments: bool = False
    valid_until: datetime | None = None
    auto_renew: bool = False


class TimestampDTO(DTO):
    id: UUID
    created_at: datetime
    updated_at: datetime
