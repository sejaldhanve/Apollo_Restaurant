"""Environment-based configuration with Pydantic Settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Service
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"
    CORS_ORIGIN: str = "http://localhost:5173"

    # API backend
    API_BASE_URL: str = "http://localhost:3001/api/v1"

    # LLM Providers (all optional — configure at least one)
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # Default LLM
    DEFAULT_LLM_PROVIDER: str = "openai"  # openai | gemini | ollama
    DEFAULT_LLM_MODEL: str = "gpt-4o-mini"

    model_config = {"env_file": "../../.env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
