from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    b2b_url: str
    payment_url: str
    service_key: str
    poll_seconds: float = 15
