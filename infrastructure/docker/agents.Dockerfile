# Apollo AI Agent Service — Multi-Stage Build
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies Stage
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY services/agents/pyproject.toml ./
RUN pip install -e "."

# Production Stage
FROM base AS runner
RUN groupadd -g 1001 apollo && useradd -u 1001 -g apollo -m apollo
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY services/agents/src ./src
COPY services/agents/pyproject.toml ./
RUN pip install --no-deps -e .
USER apollo
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

