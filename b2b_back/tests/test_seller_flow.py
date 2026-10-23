from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from marketplace.b2b.models.entities import Store
from marketplace.goods.models.entities import Product
from tests.conftest import USER_B, onboard, product, upload


async def test_complete_flow(cluster, seller):
    client = cluster.client
    store, media = seller
    response = await product(client, media["url"])
    assert response.status_code == 201, response.text
    item = response.json()["data"]
    assert item["sellerId"] == store["id"]
    assert item["seller"]["username"] == "shop_a"
    assert item["currency"] == "RUB" and item["price"] == 1800
    item_id = item["id"]
    updated = await client.patch(f"/api/products/{item_id}", json={"price": 2000, "inStock": 1})
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["price"] == 2000
    assert (await client.get(f"/api/seller/products/{item_id}")).json()["data"]["inStock"] == 1
    post = await client.post(
        "/api/posts",
        json={
            "title": "Процесс",
            "body": '<h2 onclick="x()">Лепка</h2><script>alert(1)</script>',
            "productIds": [item_id],
        },
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["data"]["id"]
    assert post.json()["data"]["status"] == "draft"
    assert "<script" not in post.json()["data"]["body"]
    assert "onclick" not in post.json()["data"]["body"]
    published = await client.post(f"/api/seller/posts/{post_id}/publish")
    assert published.status_code == 200, published.text
    assert published.json()["data"]["status"] == "draft"
    assert published.json()["data"]["moderationStatus"] == "pending"
    assert published.json()["data"]["publishedAt"] is None
    assert published.json()["data"]["products"][0]["id"] == item_id
    assert (await client.delete(f"/api/products/{item_id}")).status_code == 200
    historical = (await client.get(f"/api/seller/posts/{post_id}")).json()["data"]
    assert historical["productIds"] == [item_id]
    assert historical["products"][0]["deletedAt"] is not None
    assert historical["products"][0]["saleMode"] == "out_of_stock"
    assert historical["products"][0]["purchasable"] is False
    assert (await client.get(f"/api/seller/products/{item_id}")).status_code == 404
    assert (await client.delete(f"/api/posts/{post_id}")).status_code == 200
    assert (await client.get(f"/api/seller/posts/{post_id}")).status_code == 404
    assert any(
        host == "goods" and method == "POST" for method, host, path in cluster.transport.calls
    )
    assert any(
        host == "publications" and method == "POST"
        for method, host, path in cluster.transport.calls
    )


async def test_onboarding_idempotent_and_unique(cluster):
    client = cluster.client
    first = await onboard(client)
    repeated = await onboard(client, "different_name")
    assert first["id"] == repeated["id"]
    assert repeated["username"] == "shop_a"
    async with cluster.apps["b2b"].state.sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Store)) == 1
    client.headers["X-User-Id"] = str(USER_B)
    duplicate = await client.post(
        "/api/users/me/become-seller", json={"username": "shop_a", "displayName": "Другой"}
    )
    assert duplicate.status_code == 409, duplicate.text
    assert (
        await client.post(
            "/api/users/me/become-seller", json={"username": "../BAD", "displayName": "Другой"}
        )
    ).status_code == 400
    await onboard(client, "shop_b")


@pytest.mark.parametrize(
    "payload",
    [
        {"ownerUserId": str(uuid4())},
        {"planTier": "premium"},
        {"username": "new_name"},
        {"displayName": " "},
        {"displayName": None},
    ],
)
async def test_profile_mass_assignment_and_validation(cluster, seller, payload):
    client = cluster.client
    before = (await client.get("/api/seller/profile")).json()["data"]
    response = await client.patch("/api/seller/profile", json=payload)
    assert response.status_code == 400, response.text
    after = (await client.get("/api/seller/profile")).json()["data"]
    assert after == before


async def test_profile_delivery_and_checklist(cluster, seller):
    client = cluster.client
    _, media = seller
    response = await client.patch(
        "/api/seller/profile", json={"avatar": media["url"], "displayName": "Обновлено"}
    )
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["displayName"] == "Мастерская"
    assert body["profileStatus"] == "pending"
    assert body["profileDraft"]["displayName"] == "Обновлено"
    assert body["publicUrl"] == "/shops/shop_a"
    approved = await client.post(f"/api/moderation/profiles/{body['id']}/accept")
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["displayName"] == "Обновлено"
    incomplete = {
        "pickupEnabled": True,
        "pickupPoints": [{"city": "Москва", "address": "Улица 1", "maxDays": 3}],
        "cdekEnabled": True,
    }
    assert (await client.patch("/api/seller/delivery", json=incomplete)).status_code == 400
    no_days = {
        **incomplete,
        "cdekOfficeCode": "MSK1",
        "cdekOfficeAddress": "ул. Пример, 1",
    }
    assert (await client.patch("/api/seller/delivery", json=no_days)).status_code == 400
    good = {**no_days, "cdekShipDays": [0, 2, 4]}
    assert (await client.patch("/api/seller/delivery", json=good)).json()["data"] == good
    missing_days = await client.patch(
        "/api/seller/delivery",
        json={"pickupPoints": [{"city": "Москва", "address": "Улица 1"}]},
    )
    assert missing_days.status_code == 400
    invalid = await client.patch("/api/seller/delivery", json={"pickupPoints": []})
    assert invalid.status_code == 400
    assert (await client.get("/api/seller/delivery")).json()["data"] == good
    first = (await client.get("/api/seller/onboarding")).json()["data"]
    assert first == (await client.get("/api/seller/onboarding")).json()["data"]
    assert first["items"][0]["completed"] is True


@pytest.mark.parametrize(
    "changes",
    [
        {"price": -1},
        {"price": 1.1},
        {"price": "10"},
        {"price": True},
        {"inStock": -1},
        {"saleMode": "invalid"},
        {"availableDeliveries": ["pickup"]},
        {"dealContacts": ""},
        {"sellerId": str(uuid4())},
        {
            "images": [
                "https://example.com/not-uploaded.png",
                "https://example.com/not-uploaded.png",
            ]
        },
    ],
)
async def test_product_validation(cluster, seller, changes):
    _, media = seller
    response = await product(cluster.client, media["url"], **changes)
    assert response.status_code == 400, response.text
    assert (await cluster.client.get("/api/seller/products")).json()["data"]["total"] == 0


async def test_product_gallery_requires_two_urls_on_write(cluster, seller):
    client = cluster.client
    _, media = seller
    first = media["url"]
    second = (await upload(client))["url"]
    base = {
        "title": "Керамическая чашка",
        "price": 1800,
        "saleMode": "deal_only",
        "dealContacts": "Телефон +7 999 000 00 00",
        "inStock": 3,
    }
    only_cover = await client.post("/api/products", json={**base, "image": first})
    assert only_cover.status_code == 400, only_cover.text
    assert "Нужно минимум 2 картинки" in only_cover.text
    one = await product(client, first, images=[first])
    assert one.status_code == 400, one.text
    assert "Нужно минимум 2 картинки" in one.text
    blanks = await product(client, first, images=[first, "  "])
    assert blanks.status_code == 400, blanks.text
    created = await product(client, first, images=[second, first])
    assert created.status_code == 201, created.text
    body = created.json()["data"]
    assert body["images"] == [second, first]
    assert body["image"] == second
    product_id = body["id"]
    rejected = await client.patch(f"/api/products/{product_id}", json={"images": [first]})
    assert rejected.status_code == 400, rejected.text
    assert "Нужно минимум 2 картинки" in rejected.text
    updated = await client.patch(
        f"/api/products/{product_id}", json={"images": [first, second]}
    )
    assert updated.status_code == 200, updated.text
    updated_body = updated.json()["data"]
    assert updated_body["images"] == [first, second]
    assert updated_body["image"] == first
    async with cluster.apps["goods"].state.sessions() as db:
        stored = await db.get(Product, UUID(product_id))
        stored.images = [first]
        stored.image = first
        await db.commit()
    kept = (await client.get(f"/api/seller/products/{product_id}")).json()["data"]
    assert kept["images"] == [first]
    assert kept["image"] == first
    priced = await client.patch(f"/api/products/{product_id}", json={"price": 1900})
    assert priced.status_code == 200, priced.text
    priced_body = priced.json()["data"]
    assert priced_body["price"] == 1900
    assert priced_body["images"] == [first]
    assert priced_body["image"] == first
    async with cluster.apps["goods"].state.sessions() as db:
        stored = await db.get(Product, UUID(product_id))
        assert stored.images == [first]
        assert stored.image == first


async def test_product_quota_and_reclaimed_slot(cluster, seller):
    _, media = seller
    ids = []
    for n in range(10):
        response = await product(cluster.client, media["url"], title=f"Чашка {n}")
        assert response.status_code == 201, response.text
        ids.append(response.json()["data"]["id"])
    denied = await product(cluster.client, media["url"])
    assert denied.status_code == 403
    assert (await cluster.client.get("/api/seller/products")).json()["data"]["total"] == 10
    await cluster.client.delete(f"/api/products/{ids[0]}")
    assert (await product(cluster.client, media["url"])).status_code == 201


async def test_search_pagination_filters_and_rollback(cluster, seller):
    _, media = seller
    for title in ("Чашка", "Ваза", "Чашка с узором"):
        assert (await product(cluster.client, media["url"], title=title)).status_code == 201
    response = await cluster.client.get(
        "/api/seller/products",
        params={"q": "Чашка", "saleMode": "deal_only", "page": 2, "pageSize": 1},
    )
    data = response.json()["data"]
    assert data["total"] == 2 and len(data["items"]) == 1 and data["pageSize"] == 1
    pid = data["items"][0]["id"]
    assert (
        await cluster.client.patch(
            f"/api/products/{pid}", json={"title": "Изменено", "availableDeliveries": ["pickup"]}
        )
    ).status_code == 400
    assert (await cluster.client.get(f"/api/seller/products/{pid}")).json()["data"][
        "title"
    ] != "Изменено"
    assert (
        await cluster.client.get("/api/seller/products", params={"pageSize": 101})
    ).status_code == 400
