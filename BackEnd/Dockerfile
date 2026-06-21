# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# System deps for sentence-transformers, spacy, language-tool-python
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binaries from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 1. Copy pyproject.toml of GradingSystem first to cache dependencies
COPY GradingSystem/pyproject.toml /app/GradingSystem/

# Create a dummy package structure so uv pip install -e works
RUN mkdir -p /app/GradingSystem/grading_system_src && \
    touch /app/GradingSystem/grading_system_src/__init__.py

# Install GradingSystem dependencies (heavier ML deps) with uv caching
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -e /app/GradingSystem

# 2. Pre-download sentence-transformers and spaCy models
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-mpnet-base-v2')"
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1.tar.gz

# 3. Copy pyproject.toml of BackEnd to cache dependencies
COPY BackEnd/pyproject.toml /app/backend/

# Create a dummy package structure so uv pip install -e works
RUN mkdir -p /app/backend/src && \
    touch /app/backend/src/__init__.py

# Install BackEnd dependencies with uv caching
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -e /app/backend

# 4. Copy the actual source codes (this will invalidate cache only for these final layers)
COPY GradingSystem/ /app/GradingSystem/
COPY BackEnd/ /app/backend/

WORKDIR /app/backend

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

