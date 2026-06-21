"""Retrieval agent — LitLLMs-style keyword extraction → Semantic Scholar → SPECTER2 rerank."""

from __future__ import annotations

import json
import os
import logging
from typing import Any

import numpy as np
import requests
from langchain_core.messages import HumanMessage, SystemMessage

from grading_system_src.llm import get_llm, invoke_llm
from grading_system_src.model_cache import get_encoder_with_fallbacks
from grading_system_src.models import LitPool, LitPoolEntry
from grading_system_src.prompts import load_prompt


S2_API_URL = "https://api.semanticscholar.org/graph/v1"
S2_API_KEY = os.getenv("S2_API_KEY", "")


def retrieve_literature(
    title: str,
    abstract: str,
    assignment_prompt: str,
    *,
    max_results_per_query: int = 20,
    top_k: int = 30,
    model_name: str | None = None,
) -> LitPool:
    """Run the full retrieval pipeline: keyword gen → S2 search → SPECTER2 rerank."""
    keywords = _extract_keywords(title, abstract, assignment_prompt, model_name=model_name)
    raw_papers = _search_semantic_scholar(keywords, limit=max_results_per_query)

    if not raw_papers:
        return LitPool(query_keywords=keywords)

    reranked = _rerank_specter2(
        query_text=f"{title}. {abstract}",
        papers=raw_papers,
        top_k=top_k,
    )

    entries = [
        LitPoolEntry(
            paper_id=p["paperId"],
            title=p.get("title", ""),
            authors=[a.get("name", "") for a in p.get("authors", [])],
            year=p.get("year"),
            abstract=p.get("abstract") or "",
            doi=p.get("externalIds", {}).get("DOI"),
            relevance_score=float(p.get("_score", 0.0)),
        )
        for p in reranked
    ]

    return LitPool(entries=entries, query_keywords=keywords)


# ---------------------------------------------------------------------------
# Keyword extraction
# ---------------------------------------------------------------------------

def _extract_keywords(
    title: str,
    abstract: str,
    assignment_prompt: str,
    *,
    model_name: str | None = None,
) -> list[str]:
    llm = get_llm(model=model_name, temperature=0.0, json_mode=True)
    user_msg = (
        f"Title: {title}\n"
        f"Abstract: {abstract}\n"
        f"Assignment prompt: {assignment_prompt}\n\n"
        "Return keyword queries as a JSON array."
    )
    resp = invoke_llm(llm, [
        SystemMessage(content=load_prompt("keyword_extraction")),
        HumanMessage(content=user_msg),
    ])
    try:
        keywords = json.loads(resp.content)
        if isinstance(keywords, list):
            return [str(k) for k in keywords]
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Failed to parse keyword extraction: %s — raw: %.200s", exc, resp.content)
    return [title]


# ---------------------------------------------------------------------------
# Semantic Scholar search
# ---------------------------------------------------------------------------

def _search_semantic_scholar(
    keywords: list[str],
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Query Semantic Scholar for each keyword and deduplicate."""
    headers: dict[str, str] = {}
    if S2_API_KEY:
        headers["x-api-key"] = S2_API_KEY

    fields = "paperId,title,abstract,year,authors,externalIds"
    seen_ids: set[str] = set()
    papers: list[dict[str, Any]] = []

    for kw in keywords:
        try:
            resp = requests.get(
                f"{S2_API_URL}/paper/search",
                params={"query": kw, "limit": limit, "fields": fields},
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json().get("data", [])
        except (requests.RequestException, ValueError):
            continue

        for p in data:
            pid = p.get("paperId", "")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                papers.append(p)

    return papers


# ---------------------------------------------------------------------------
# SPECTER2 reranking
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)


def _rerank_specter2(
    query_text: str,
    papers: list[dict[str, Any]],
    *,
    top_k: int = 30,
) -> list[dict[str, Any]]:
    """Rerank papers by cosine similarity to query_text using SPECTER2 proximity adapter."""
    model = get_encoder_with_fallbacks(
        "allenai/specter2_proximity",
        "allenai/specter2",
        "all-MiniLM-L6-v2",
    )
    query_emb = model.encode([query_text], convert_to_numpy=True)
    paper_texts = [
        f"{p.get('title', '')}. {p.get('abstract', '') or ''}" for p in papers
    ]
    paper_embs = model.encode(paper_texts, convert_to_numpy=True, batch_size=32)

    sims = np.dot(paper_embs, query_emb.T).flatten()
    ranked_indices = np.argsort(-sims)[:top_k]

    for idx in ranked_indices:
        papers[int(idx)]["_score"] = float(sims[int(idx)])

    return [papers[int(i)] for i in ranked_indices]
