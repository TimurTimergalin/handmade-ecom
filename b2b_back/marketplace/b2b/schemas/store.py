from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from marketplace.shared.schemas import DTO, OrderStatus, PickupPoint, PickupPointInput, Text, Tier

ShipDay = Annotated[int, Field(strict=True, ge=0, le=6)]


class StoreCreate(DTO):
    username: str = Field(pattern=r"^[a-z][a-z0-9_]{2,31}$")
    display_name: Text
    bio: str = Field(default="", max_length=2000)
    legal_type: Literal["person", "company"] | None = None
    last_name: str = Field(default="", max_length=100)
    first_name: str = Field(default="", max_length=100)
    patronymic: str = Field(default="", max_length=100)
    legal_name: str = Field(default="", max_length=300)
    inn: str = Field(default="", max_length=12)
    ogrn: str = Field(default="", max_length=15)
    legal_address: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def legal_details(self):
        import re

        if self.legal_type is None:
            return self
        inn = self.inn.strip()
        ogrn = self.ogrn.strip()
        if self.legal_type == "person":
            if not self.last_name.strip() or not self.first_name.strip():
                raise ValueError("Укажите фамилию и имя")
            if not re.fullmatch(r"\d{12}", inn):
                raise ValueError("ИНН физического лица — 12 цифр")
            if ogrn and not re.fullmatch(r"\d{15}", ogrn):
                raise ValueError("ОГРНИП — 15 цифр")
            return self
        if not self.legal_name.strip():
            raise ValueError("Укажите полное наименование")
        if not re.fullmatch(r"\d{10}", inn):
            raise ValueError("ИНН юридического лица — 10 цифр")
        if not re.fullmatch(r"\d{13}", ogrn):
            raise ValueError("ОГРН — 13 цифр")
        if not self.legal_address.strip():
            raise ValueError("Укажите адрес места нахождения")
        return self


class StorePatch(DTO):
    display_name: Text | None = None
    bio: str | None = Field(default=None, max_length=2000)
    avatar: str | None = Field(default=None, max_length=2000)


class StoredDelivery(DTO):
    """Сохранённые настройки. Пункты без maxDays остаются валидными."""

    pickup_enabled: bool = False
    pickup_points: list[PickupPoint] = Field(default_factory=list, max_length=30)
    cdek_enabled: bool = False
    cdek_office_code: str = ""
    cdek_office_address: str = ""
    cdek_ship_days: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def valid_pickup(self):
        if self.pickup_enabled and not self.pickup_points:
            raise ValueError("pickupPoints обязательны при включенном самовывозе")
        return self


class Delivery(StoredDelivery):
    pickup_points: list[PickupPointInput] = Field(default_factory=list, max_length=30)
    cdek_office_code: str = Field(default="", max_length=32)
    cdek_office_address: str = Field(default="", max_length=1000)
    cdek_ship_days: list[ShipDay] = Field(default_factory=list, max_length=7)

    @model_validator(mode="after")
    def valid_cdek(self):
        self.cdek_office_code = self.cdek_office_code.strip()
        self.cdek_office_address = self.cdek_office_address.strip()
        if not self.cdek_enabled:
            return self
        if not self.cdek_office_code:
            raise ValueError("Укажите пункт отгрузки СДЭК")
        if not self.cdek_office_address:
            raise ValueError("Укажите адрес пункта отгрузки СДЭК")
        if not self.cdek_ship_days:
            raise ValueError("Выберите хотя бы один день отгрузки СДЭК")
        if len(set(self.cdek_ship_days)) != len(self.cdek_ship_days):
            raise ValueError("Дни отгрузки СДЭК не должны повторяться")
        return self


class DeliveryPatch(DTO):
    pickup_enabled: bool | None = None
    pickup_points: list[PickupPointInput] | None = Field(default=None, max_length=30)
    cdek_enabled: bool | None = None
    cdek_office_code: str | None = Field(default=None, max_length=32)
    cdek_office_address: str | None = Field(default=None, max_length=1000)
    cdek_ship_days: list[ShipDay] | None = Field(default=None, max_length=7)

    @model_validator(mode="after")
    def unique_ship_days(self):
        if self.cdek_ship_days is not None and len(set(self.cdek_ship_days)) != len(
            self.cdek_ship_days
        ):
            raise ValueError("Дни отгрузки СДЭК не должны повторяться")
        return self


class PayoutCard(DTO):
    last4: str = Field(default="", max_length=8)
    card_type: str = Field(default="", max_length=40)
    issuer_name: str = Field(default="", max_length=120)


class PayoutToken(DTO):
    payout_token: str = Field(default="", max_length=512)
    card: PayoutCard | None = None


class Subscribe(DTO):
    tier: Literal[Tier.PREMIUM]


class AutoRenew(DTO):
    enabled: bool


class StatusChange(DTO):
    status: OrderStatus
    tracking_number: str | None = Field(default=None, max_length=200)
