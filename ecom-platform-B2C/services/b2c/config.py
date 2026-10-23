from __future__ import annotations

from common.app import BaseServiceSettings


class B2CSettings(BaseServiceSettings):
    service_name: str = "b2c"
    service_title: str = "B2C API (BFF + frontend contract)"
    cors_origin: str = "http://localhost:3000"
    auth_jwt_secret: str = "changeme"
    auth_jwt_algorithm: str = "HS256"
    auth_access_ttl_seconds: int = 15 * 60
    auth_refresh_ttl_seconds: int = 30 * 24 * 3600
    auth_cookie_name: str = "auth-token"
    auth_refresh_cookie_name: str = "refresh-token"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    auth_dev_mode: bool = True
    payment_stub_url: str = "https://yoomoney.ru/checkout/demo"
    b2b_url: str = ""
    b2b_goods_url: str = "http://b2b-goods:8000/api"
    service_key: str = ""
    yookassa_account_id: str = ""
    order_processor_url: str = ""
    yandex_client_id: str = ""
    yandex_client_secret: str = ""
    yandex_redirect_uri: str = "http://localhost:3000/auth/yandex/callback"
    cdek_api_url: str = "https://api.edu.cdek.ru/v2"
    cdek_client_id: str = ""
    cdek_client_secret: str = ""
    users_url: str = "http://users:8000"
    publications_url: str = "http://publications:8000"
    cart_url: str = "http://cart:8000"
    orders_url: str = "http://orders:8000"
    goods_url: str = "http://goods:8000"
    search_url: str = "http://search:8000"
    eventer_url: str = "http://eventer:8000"
    gorse_url: str = "http://gorse:8088"
    gorse_api_key: str = "gorseApiKeyForLocalDevOnly"
    upstream_timeout_seconds: float = 2.0
    upstream_retries: int = 2
