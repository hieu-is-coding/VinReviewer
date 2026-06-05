from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str
    supabase_service_key: str

    # GradingSystem
    openai_api_key: str
    grobid_url: str = "http://localhost:8070"
    semantic_scholar_api_key: str = ""

    # Server
    api_key: str
    max_concurrent_jobs: int = 5
    job_timeout_seconds: int = 600

    # Redis (optional)
    redis_url: str | None = None


settings = Settings()  # type: ignore[call-arg]
