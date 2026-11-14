"""LLM provider abstraction — supports Ollama, OpenAI, and Gemini.

Ensures clean separation of LLM connectivity from the core orchestration engine,
with controlled error handling when providers are unconfigured or unavailable.
"""

from typing import Any

from langchain_core.language_models import BaseChatModel

from src.config import settings


class LLMUnavailableError(Exception):
    """Raised when an LLM provider is requested but is unconfigured or unreachable."""

    def __init__(self, provider: str, reason: str) -> None:
        self.provider = provider
        self.reason = reason
        super().__init__(f"LLM provider '{provider}' is currently unavailable: {reason}")


def check_llm_provider_health() -> dict[str, Any]:
    """Check configuration and availability of the default LLM provider."""
    provider = settings.DEFAULT_LLM_PROVIDER
    model = settings.DEFAULT_LLM_MODEL

    if provider == "openai":
        has_key = bool(settings.OPENAI_API_KEY)
        return {
            "provider": provider,
            "model": model,
            "configured": has_key,
            "status": "ready" if has_key else "missing_api_key",
        }
    elif provider == "gemini":
        has_key = bool(settings.GEMINI_API_KEY)
        return {
            "provider": provider,
            "model": model,
            "configured": has_key,
            "status": "ready" if has_key else "missing_api_key",
        }
    elif provider == "ollama":
        base_url = settings.OLLAMA_BASE_URL
        return {
            "provider": provider,
            "model": model,
            "configured": bool(base_url),
            "endpoint": base_url,
            "status": "configured",
        }
    else:
        return {
            "provider": provider,
            "model": model,
            "configured": False,
            "status": "unsupported_provider",
        }


def get_llm(
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.0,
    timeout: float = 15.0,
) -> BaseChatModel:
    """Get a configured LangChain chat model.

    Raises LLMUnavailableError if the provider lacks required configuration
    or is unsupported. Never crashes unhandled.
    """
    provider = provider or settings.DEFAULT_LLM_PROVIDER
    model = model or settings.DEFAULT_LLM_MODEL

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise LLMUnavailableError("openai", "OPENAI_API_KEY is not configured")
        try:
            from langchain_openai import ChatOpenAI
            from pydantic import SecretStr

            return ChatOpenAI(
                model=model,
                temperature=temperature,
                api_key=SecretStr(settings.OPENAI_API_KEY),
                timeout=timeout,
            )
        except Exception as err:
            raise LLMUnavailableError("openai", str(err)) from err

    elif provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise LLMUnavailableError("gemini", "GEMINI_API_KEY is not configured")
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(
                model=model,
                temperature=temperature,
                google_api_key=settings.GEMINI_API_KEY,
                timeout=timeout,
            )
        except Exception as err:
            raise LLMUnavailableError("gemini", str(err)) from err

    elif provider == "ollama":
        if not settings.OLLAMA_BASE_URL:
            raise LLMUnavailableError("ollama", "OLLAMA_BASE_URL is not configured")
        try:
            from langchain_community.chat_models import ChatOllama  # type: ignore[import-not-found]

            return ChatOllama(
                model=model,
                temperature=temperature,
                base_url=settings.OLLAMA_BASE_URL,
                timeout=timeout,
            )
        except Exception as err:
            raise LLMUnavailableError("ollama", str(err)) from err

    else:
        raise LLMUnavailableError(provider, f"Unsupported provider '{provider}'")
