"""Async Supabase client wrapper."""

from __future__ import annotations

from supabase import AsyncClient, acreate_client

from src.config import settings

_client: AsyncClient | None = None


async def get_client() -> AsyncClient:
    global _client
    if _client is None:
        _client = await acreate_client(settings.supabase_url, settings.supabase_service_key)
    return _client


async def fetch_submission(submission_id: str) -> dict:
    sb = await get_client()
    resp = (
        await sb.from_("submissions")
        .select("*, assignments(description, target_venue, submission_type), rubrics(name, description)")
        .eq("id", submission_id)
        .single()
        .execute()
    )
    return resp.data


async def fetch_criteria(rubric_id: str) -> list[dict]:
    sb = await get_client()
    resp = (
        await sb.from_("criteria")
        .select("*")
        .eq("rubric_id", rubric_id)
        .order("sort_order")
        .execute()
    )
    return resp.data or []


async def update_submission_status(submission_id: str, status: str) -> None:
    sb = await get_client()
    await sb.from_("submissions").update({"status": status}).eq("id", submission_id).execute()


async def update_submission_content(submission_id: str, content: str) -> None:
    sb = await get_client()
    await sb.from_("submissions").update({"content": content}).eq("id", submission_id).execute()



async def insert_evaluation(payload: dict) -> str:
    sb = await get_client()
    resp = await sb.from_("evaluations").insert(payload).select("id").execute()
    return resp.data[0]["id"]



async def update_evaluation(evaluation_id: str, payload: dict) -> None:
    sb = await get_client()
    await sb.from_("evaluations").update(payload).eq("id", evaluation_id).execute()


async def insert_criteria_scores(rows: list[dict]) -> None:
    sb = await get_client()
    await sb.from_("criteria_scores").insert(rows).execute()


async def insert_evaluation_details(payload: dict) -> None:
    sb = await get_client()
    await sb.from_("evaluation_details").insert(payload).execute()


async def delete_evaluation(evaluation_id: str) -> None:
    """Delete an evaluation and its related rows (criteria_scores, evaluation_details).

    Used for rollback when a partial write fails after the evaluation row was created.
    """
    sb = await get_client()
    await sb.from_("criteria_scores").delete().eq("evaluation_id", evaluation_id).execute()
    await sb.from_("evaluation_details").delete().eq("evaluation_id", evaluation_id).execute()
    await sb.from_("evaluations").delete().eq("id", evaluation_id).execute()
