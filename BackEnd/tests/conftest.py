"""Pytest fixtures shared across BackEnd tests."""

import os

import pytest
from fastapi.testclient import TestClient

# Provide minimal env vars so config loads without a .env file
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("API_KEY", "test-api-key")


@pytest.fixture
def client():
    from src.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers():
    return {"X-API-Key": "test-api-key"}
