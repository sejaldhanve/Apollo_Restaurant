"""LLM provider factory — supports OpenAI, Gemini, and Ollama."""

from langchain_core.language_models import BaseChatModel

from src.config import settings


def get_llm(
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.0,
) -> BaseChatModel:
    """Get a configured LLM instance based on provider setting.

    Args:
        provider: LLM provider name. Defaults to settings.DEFAULT_LLM_PROVIDER.
        model: Model name. Defaults to settings.DEFAULT_LLM_MODEL.
        temperature: Sampling temperature.

    Returns:
        A configured LangChain chat model.

    Raises:
        ValueError: If the provider is not supported or not configured.
    """
    provider = provider or settings.DEFAULT_LLM_PROVIDER
    model = model or settings.DEFAULT_LLM_MODEL

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is not configured")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model,
            temperature=temperature,
            api_key=settings.OPENAI_API_KEY,
        )
    elif provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=settings.GEMINI_API_KEY,
        )
    elif provider == "ollama":
        from langchain_community.chat_models import ChatOllama

        return ChatOllama(
            model=model,
            temperature=temperature,
            base_url=settings.OLLAMA_BASE_URL,
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
