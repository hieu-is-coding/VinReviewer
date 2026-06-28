"""Health check route — verifies PDF parser and Supabase connectivity."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from src.models.responses import HealthResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    pdf_ok = _check_pdf_parser()
    supabase_ok = await _check_supabase()
    models_loaded = getattr(request.app.state, "encoder", None) is not None

    overall = "ok" if (supabase_ok and pdf_ok) else "degraded"
    return HealthResponse(
        status=overall,
        grobid=pdf_ok,
        supabase=supabase_ok,
        models_loaded=models_loaded,
    )


def _check_pdf_parser() -> bool:
    """Verify pypdf is importable (used for PDF text extraction)."""
    try:
        import pypdf  # noqa: F401
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
