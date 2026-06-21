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


import os

settings = Settings()  # type: ignore[call-arg]

# Propagate settings to OS environment variables for the GradingSystem package and LangChain
os.environ["OPENAI_API_KEY"] = settings.openai_api_key
os.environ["GROBID_URL"] = settings.grobid_url
os.environ["S2_API_KEY"] = settings.semantic_scholar_api_key

