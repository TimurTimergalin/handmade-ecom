from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.support.paths import service_import

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _fresh_order_metadata() -> None:
    from common.db import Base

    Base.metadata.clear()
    Base.registry.dispose()


def _order(
    routes_models: tuple,
    *,
    method: str,
    comment: str,
    office: str | None,
    uuid_value: str | None = None,
):
    models_order, models_item, delivery, status = routes_models
    seller_id = uuid.uuid4()
    buyer_id = uuid.uuid4()
    order = models_order(
        id=uuid.uuid4(),
        number="HM-TEST",
        user_id=buyer_id,
        status=status.CREATED,
        currency="RUB",
        items_amount=Decimal("15.00"),
        delivery_amount=Decimal("100.00"),
        discount_amount=Decimal("0"),
        total_amount=Decimal("115.00"),
        delivery_method=delivery(method),
        recipient_name="Анна",
        recipient_phone="+70000000000",
        comment=comment,
        cdek_office_code=office,
        cdek_order_uuid=uuid_value,
    )
    order.items = [
        models_item(
            product_id=uuid.uuid4(),
            offer_id=uuid.uuid4(),
            seller_id=seller_id,
            title="Кружка",
            quantity=2,
            price_amount=Decimal("10.00"),
        ),
        models_item(
            product_id=uuid.uuid4(),
            offer_id=uuid.uuid4(),
            seller_id=seller_id,
            title="Блюдце",
            quantity=1,
            price_amount=Decimal("5.00"),
        ),
    ]
    return order, seller_id


def _session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_paid_cdek_calls_create_order_and_stores_number(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with service_import("orders"):
        import routes
        from models import DeliveryMethod, Order, OrderItem, OrderStatus

        order, seller_id = _order(
            (Order, OrderItem, DeliveryMethod, OrderStatus),
            method="cdek",
            comment="anna@example.com",
            office="MSK10",
        )
        seen: dict[str, object] = {}

        async def office(seller: uuid.UUID) -> str:
            assert seller == seller_id
            return "FROM1"

        async def create(
            from_office_code: str,
            to_office_code: str,
            recipient_name: str,
            recipient_email: str,
            item_count: int,
            number: str,
            recipient_phone: str = "",
        ) -> dict[str, str]:
            seen.update(
                {
                    "from_office_code": from_office_code,
                    "to_office_code": to_office_code,
                    "recipient_name": recipient_name,
                    "recipient_email": recipient_email,
                    "item_count": item_count,
                    "number": number,
                }
            )
            return {"uuid": "uuid-1", "cdek_number": "1100285492"}

        monkeypatch.setattr(routes, "_seller_cdek_office", office)
        monkeypatch.setattr(routes, "_create_cdek_order", create)
        routes._producer = None
        updated = await routes.change_status(
            _session(),
            order.id,
            OrderStatus.PAID,
            "Оплата подтверждена",
            order=order,
        )

        assert updated.status is OrderStatus.PAID
        assert updated.paid_at is not None
        assert updated.cdek_order_uuid == "uuid-1"
        assert updated.tracking_number == "1100285492"
        assert seen == {
            "from_office_code": "FROM1",
            "to_office_code": "MSK10",
            "recipient_name": "Анна",
            "recipient_email": "anna@example.com",
            "item_count": 3,
            "number": str(order.id),
        }


@pytest.mark.asyncio
async def test_cdek_client_error_keeps_order_paid_without_track(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with service_import("orders"):
        import routes
        from models import DeliveryMethod, Order, OrderItem, OrderStatus

        order, _seller_id = _order(
            (Order, OrderItem, DeliveryMethod, OrderStatus),
            method="cdek",
            comment="anna@example.com",
            office="MSK10",
        )

        async def office(_seller: uuid.UUID) -> str:
            return "FROM1"

        async def create(*_args: object, **_kwargs: object) -> dict[str, str]:
            raise RuntimeError("cdek unavailable")

        monkeypatch.setattr(routes, "_seller_cdek_office", office)
        monkeypatch.setattr(routes, "_create_cdek_order", create)
        routes._producer = None
        updated = await routes.change_status(
            _session(),
            order.id,
            OrderStatus.PAID,
            "Оплата подтверждена",
            order=order,
        )

        assert updated.status is OrderStatus.PAID
        assert updated.paid_at is not None
        assert updated.cdek_order_uuid is None
        assert updated.tracking_number is None


@pytest.mark.asyncio
async def test_missing_cdek_number_does_not_clear_tracking(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with service_import("orders"):
        import routes
        from models import DeliveryMethod, Order, OrderItem, OrderStatus

        order, _seller_id = _order(
            (Order, OrderItem, DeliveryMethod, OrderStatus),
            method="cdek",
            comment="не email",
            office="MSK10",
        )
        order.tracking_number = "keep-me"
        session = _session()

        async def office(_seller: uuid.UUID) -> str:
            return "FROM1"

        async def create(
            _from_office_code: str,
            _to_office_code: str,
            _recipient_name: str,
            recipient_email: str,
            _item_count: int,
            _number: str,
            _recipient_phone: str = "",
        ) -> dict[str, str | None]:
            assert recipient_email == f"{order.user_id}@example.com"
            return {"uuid": "uuid-2", "cdek_number": None}

        monkeypatch.setattr(routes, "_seller_cdek_office", office)
        monkeypatch.setattr(routes, "_create_cdek_order", create)
        routes._producer = None
        updated = await routes.change_status(
            session,
            order.id,
            OrderStatus.PAID,
            "Оплата подтверждена",
            order=order,
        )
        history = session.add.call_args.args[0]

        assert updated.status is OrderStatus.PAID
        assert updated.cdek_order_uuid == "uuid-2"
        assert updated.tracking_number == "keep-me"
        assert routes.CDEK_EMAIL_FALLBACK_NOTE in history.comment


@pytest.mark.asyncio
async def test_order_details_refresh_cdek_number_and_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with service_import("orders"):
        import routes
        from models import DeliveryMethod, Order, OrderItem, OrderStatus

        order, _seller_id = _order(
            (Order, OrderItem, DeliveryMethod, OrderStatus),
            method="cdek",
            comment="anna@example.com",
            office="MSK10",
            uuid_value="shipment-1",
        )
        order.status = OrderStatus.PAID
        seen: dict[str, str] = {"status": "ACCEPTED"}

        async def fetch(_shipment_id: str) -> dict[str, str]:
            return {"cdek_number": "1110046624", "status": seen["status"]}

        import cdek.client as cdek_client

        monkeypatch.setattr(cdek_client, "fetch_shipment", fetch)
        routes._producer = None
        session = _session()
        refreshed = await routes.sync_cdek_progress(session, order)
        assert refreshed.status is OrderStatus.PAID
        assert refreshed.tracking_number == "1110046624"

        seen["status"] = "SENT_TO_RECIPIENT_CITY"
        refreshed = await routes.sync_cdek_progress(session, order)
        assert refreshed.status is OrderStatus.DELIVERING
        assert refreshed.tracking_number == "1110046624"
