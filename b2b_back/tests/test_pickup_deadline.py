from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from marketplace.b2b.schemas.store import Delivery, DeliveryPatch, StoredDelivery
from marketplace.goods.schemas.products import (
    ProductCreate,
    ProductPatch,
    ProductRead,
    ProductStored,
)
from marketplace.shared.schemas import PickupPoint, PickupPointInput

POINT = {"city": "Москва", "address": "Улица 1"}
WITH_DAYS = {**POINT, "maxDays": 5}

PRODUCT = {
    "title": "Чашка",
    "price": 100,
    "dealContacts": "тел",
    "image": "https://example.com/a.png",
    "images": ["https://example.com/a.png", "https://example.com/b.png"],
    "availableDeliveries": ["pickup"],
    "pickupPoints": [POINT],
}


def test_read_accepts_pickup_point_without_max_days():
    parsed = PickupPoint.model_validate(POINT)
    assert parsed.max_days is None
    stored = StoredDelivery.model_validate(
        {"pickupEnabled": True, "pickupPoints": [POINT], "cdekEnabled": False}
    )
    assert stored.pickup_points[0].max_days is None
    product = ProductStored.model_validate(PRODUCT)
    assert product.pickup_points[0].max_days is None
    read = ProductRead.model_validate(
        {
            **PRODUCT,
            "id": uuid4(),
            "sellerId": uuid4(),
            "createdAt": datetime.now(UTC),
            "updatedAt": datetime.now(UTC),
        }
    )
    assert read.pickup_points[0].max_days is None
    assert read.model_dump(by_alias=True)["pickupPoints"][0]["maxDays"] is None


def test_write_requires_max_days():
    with pytest.raises(ValidationError):
        PickupPointInput.model_validate(POINT)
    with pytest.raises(ValidationError):
        Delivery.model_validate({"pickupEnabled": True, "pickupPoints": [POINT]})
    with pytest.raises(ValidationError):
        DeliveryPatch.model_validate({"pickupPoints": [POINT]})
    with pytest.raises(ValidationError):
        ProductPatch.model_validate({"pickupPoints": [POINT]})
    with pytest.raises(ValidationError):
        ProductCreate.model_validate(PRODUCT)

    created = ProductCreate.model_validate({**PRODUCT, "pickupPoints": [WITH_DAYS]})
    assert created.pickup_points[0].max_days == 5
    patched = ProductPatch.model_validate({"pickupPoints": [WITH_DAYS]})
    assert patched.pickup_points[0].max_days == 5
    saved = Delivery.model_validate(
        {"pickupEnabled": True, "pickupPoints": [WITH_DAYS], "cdekEnabled": False}
    )
    assert saved.model_dump(by_alias=True)["pickupPoints"] == [WITH_DAYS]
    DeliveryPatch.model_validate({"pickupPoints": [WITH_DAYS]})


@pytest.mark.parametrize("max_days", [0, 365])
def test_max_days_bounds_accept_inclusive_range(max_days):
    parsed = PickupPointInput.model_validate({**POINT, "maxDays": max_days})
    assert parsed.max_days == max_days


@pytest.mark.parametrize("max_days", [-1, 366, 1.5, True, "5"])
def test_max_days_rejects_out_of_range_and_non_integers(max_days):
    with pytest.raises(ValidationError):
        PickupPointInput.model_validate({**POINT, "maxDays": max_days})
    with pytest.raises(ValidationError):
        PickupPoint.model_validate({**POINT, "maxDays": max_days})
