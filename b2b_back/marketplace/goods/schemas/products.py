from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from marketplace.shared.schemas import (
    DTO,
    DeliveryMethod,
    Money,
    PickupPoint,
    PickupPointInput,
    SaleMode,
    Stock,
    Text,
    TimestampDTO,
)

GALLERY_MIN = "Нужно минимум 2 картинки"


def clean_urls(values: list[str] | None) -> list[str]:
    urls: list[str] = []
    for raw in values or []:
        url = raw.strip()
        if not url:
            continue
        if len(url) > 2000:
            raise PydanticCustomError("image_url_length", "Слишком длинный URL картинки")
        urls.append(url)
    return urls


def require_gallery(values: list[str] | None) -> list[str]:
    urls = clean_urls(values)
    if len(urls) < 2:
        raise PydanticCustomError("images_min", GALLERY_MIN)
    return urls


class ProductCore(DTO):
    title: Text
    description: str = Field(default="", max_length=10000)
    price: Money
    sale_mode: SaleMode = SaleMode.DEAL_ONLY
    available_deliveries: list[DeliveryMethod] = Field(default_factory=list, max_length=2)
    pickup_points: list[PickupPoint] = Field(default_factory=list, max_length=30)
    deal_contacts: str | None = Field(default=None, max_length=2000)
    in_stock: Stock = 0

    @model_validator(mode="after")
    def consistency(self):
        if DeliveryMethod.PICKUP in self.available_deliveries and not self.pickup_points:
            raise ValueError("pickupPoints обязательны для pickup")
        if self.sale_mode == SaleMode.DEAL_ONLY and not (self.deal_contacts or "").strip():
            raise ValueError("dealContacts обязательны для deal_only")
        if len(set(self.available_deliveries)) != len(self.available_deliveries):
            raise ValueError("Способы доставки не должны повторяться")
        if self.sale_mode == SaleMode.ONLINE and not self.available_deliveries:
            raise ValueError("online требует способ доставки")
        return self


class ProductCreate(ProductCore):
    pickup_points: list[PickupPointInput] = Field(default_factory=list, max_length=30)
    images: list[str] | None = Field(default=None, max_length=30)
    image: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def gallery(self):
        urls = require_gallery(self.images)
        self.images = urls
        self.image = urls[0]
        return self


class ProductStored(ProductCore):
    """Persisted product. A single saved URL stays valid until the gallery is rewritten."""

    image: str = Field(min_length=1, max_length=2000)
    images: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def sync_cover(self):
        urls = clean_urls(self.images)
        if not urls and self.image:
            urls = [self.image]
        if not urls:
            raise PydanticCustomError("images_min", GALLERY_MIN)
        self.images = urls
        self.image = urls[0]
        return self


class ProductPatch(DTO):
    title: Text | None = None
    description: str | None = Field(default=None, max_length=10000)
    images: list[str] | None = Field(default=None, max_length=30)
    image: str | None = Field(default=None, max_length=2000)
    price: Money | None = None
    sale_mode: SaleMode | None = None
    available_deliveries: list[DeliveryMethod] | None = Field(default=None, max_length=2)
    pickup_points: list[PickupPointInput] | None = Field(default=None, max_length=30)
    deal_contacts: str | None = Field(default=None, max_length=2000)
    in_stock: Stock | None = None

    @model_validator(mode="after")
    def gallery(self):
        if "images" not in self.model_fields_set:
            if self.image:
                raise PydanticCustomError("images_min", GALLERY_MIN)
            return self
        self.images = require_gallery(self.images)
        self.image = self.images[0]
        return self


class ProductRead(TimestampDTO, ProductCore):
    seller_id: UUID
    image: str
    images: list[str]
    currency: Literal["RUB"] = "RUB"
    deleted_at: str | None = None
    purchasable: bool = False
    cdek_ship_days: list[int] = Field(default_factory=list)
    moderation_status: Literal["pending", "active", "rejected"] = "active"
    draft_status: Literal["pending", "rejected"] | None = None
    rejection_reason: str | None = None
    draft: dict | None = None


class RejectReason(DTO):
    reason: str = Field(min_length=1, max_length=500)


class StockAdjust(DTO):
    delta: int = Field(ge=-1_000_000, le=1_000_000)


class ShipmentDays(DTO):
    ship_days: list[Annotated[int, Field(strict=True, ge=0, le=6)]] = Field(
        default_factory=list, max_length=7
    )


class Batch(DTO):
    ids: Annotated[list[UUID], Field(max_length=100)]
    include_deleted: bool = False
