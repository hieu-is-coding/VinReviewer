# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# Minimal system deps — curl for healthchecks, build-essential for any C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binaries from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# ── 1. GradingSystem deps ────────────────────────────────────────────────────
COPY GradingSystem/pyproject.toml /app/GradingSystem/

# Dummy package so uv pip install -e works
RUN mkdir -p /app/GradingSystem/grading_system_src && \
    touch /app/GradingSystem/grading_system_src/__init__.py

RUN uv pip install --system -e /app/GradingSystem

# ── 2. BackEnd deps ──────────────────────────────────────────────────────────
COPY BackEnd/pyproject.toml /app/backend/

# Dummy package so uv pip install -e works
RUN mkdir -p /app/backend/src && \
    touch /app/backend/src/__init__.py

RUN uv pip install --system -e /app/backend

# ── 3. Copy source (invalidates cache only for final layers) ─────────────────
COPY GradingSystem/ /app/GradingSystem/
COPY BackEnd/       /app/backend/

WORKDIR /app/backend

EXPOSE 8000

# GROBID_URL is injected at runtime via Railway env var pointing to the GROBID service
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
