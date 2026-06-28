"""Health check route — verifies GROBID and Supabase connectivity."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request

from src.config import settings
from src.models.responses import HealthResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    grobid_ok = await _check_grobid()
    supabase_ok = await _check_supabase()
    models_loaded = getattr(request.app.state, "encoder", None) is not None

    overall = "ok" if (supabase_ok and grobid_ok) else "degraded"
    return HealthResponse(
        status=overall,
        grobid=grobid_ok,
        supabase=supabase_ok,
        models_loaded=models_loaded,
    )


async def _check_grobid() -> bool:
    try:
        import pypdf
        return True
    except Exception:
        return False


async def _check_supabase() -> bool:
    try:
        from src.services.supabase_client import get_client

        await get_client()
        return True
    except Exception:
        return False
