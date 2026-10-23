from __future__ import annotations

from types import SimpleNamespace

import pytest

from tests.support.paths import service_import

pytestmark = pytest.mark.unit


def _item(seller_id: str, sku: str) -> SimpleNamespace:
    return SimpleNamespace(
        product_id=sku,
        seller_id=seller_id,
        title="Кружка",
        image_url="https://cdn.example/mug.jpg",
        price_amount="1500",
        quantity=1,
    )


def _order(order_id: str, seller_id: str, delivery: str, shop: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=order_id,
        user_id="user-1",
        delivery_method=delivery,
        delivery_address="Москва, Арбат",
        yookassa_account_id=shop,
        items=[_item(seller_id, f"sku-{seller_id}")],
        payment_url=None,
        external_order_id=None,
        multi_order_id=None,
    )


def test_checkout_request_is_one_payment_for_every_seller() -> None:
    with service_import("orders"):
        import processor

        pickup = _order("local-1", "seller-a", "pickup", "shop-a")
        cdek = _order("local-2", "seller-b", "cdek", "shop-b")
        body = processor.checkout_request([pickup, cdek])

    assert body is not None
    assert body["user_id"] == "user-1"
    assert body["idempotency_key"] == "local-1"
    assert "payout_token" not in body
    assert [group["delivery_type"] for group in body["groups"]] == ["pickup", "cdek"]
    assert [group["yookassa_account_id"] for group in body["groups"]] == ["shop-a", "shop-b"]
    assert body["groups"][0]["items"][0]["price"] == "1500.00"
    assert body["groups"][0]["items"][0]["sku_id"] == "sku-seller-a"


def test_checkout_group_adds_cdek_delivery_as_its_own_line() -> None:
    with service_import("orders"):
        import processor

        order = _order("local-1", "seller-a", "cdek", "shop-a")
        order.delivery_amount = "390.50"
        group = processor.checkout_group(order)

    assert group is not None
    assert group["items"][1] == {
        "sku_id": "cdek-delivery",
        "name": "Доставка СДЭК",
        "image": "https://example.invalid/item",
        "price": "390.50",
        "quantity": 1,
    }


def test_checkout_group_skips_zero_delivery_amount() -> None:
    with service_import("orders"):
        import processor

        order = _order("local-1", "seller-a", "cdek", "shop-a")
        order.delivery_amount = "0"
        group = processor.checkout_group(order)

    assert group is not None
    assert [item["sku_id"] for item in group["items"]] == ["sku-seller-a"]


def test_checkout_request_refuses_partial_payment_without_shop() -> None:
    with service_import("orders"):
        import processor

        ready = _order("local-1", "seller-a", "pickup", "shop-a")
        missing = _order("local-2", "seller-b", "cdek", "")
        assert processor.checkout_request([ready, missing]) is None


def test_apply_shares_payment_url_and_keeps_per_seller_ids() -> None:
    with service_import("orders"):
        import processor

        pickup = _order("local-1", "seller-a", "pickup", "shop-a")
        cdek = _order("local-2", "seller-b", "cdek", "shop-b")
        processor.apply_processor_checkout(
            [pickup, cdek],
            {
                "order_id": "remote-a",
                "confirmation_url": "https://pay.example/multi",
                "multi_order_id": "multi-1",
                "orders": [
                    {"order_id": "remote-a", "seller_id": "seller-a", "status": "CREATED"},
                    {"order_id": "remote-b", "seller_id": "seller-b", "status": "CREATED"},
                ],
            },
        )

    assert pickup.payment_url == cdek.payment_url == "https://pay.example/multi"
    assert pickup.multi_order_id == cdek.multi_order_id == "multi-1"
    assert pickup.external_order_id == "remote-a"
    assert cdek.external_order_id == "remote-b"
