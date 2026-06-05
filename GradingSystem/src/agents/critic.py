"""AgentCritic — claim↔evidence verification (Phase 3).

3.1: Segment manuscript into claim spans → encode with sentence-transformers →
     cosine vs. cited references and lit_pool. Flag low-similarity / uncited claims.
3.2: Classify each cited claim as SYNTHESIS / SUMMARY / UNSUPPORTED.
"""

from __future__ import annotations

import json
import logging
import re

import numpy as np
from langchain_core.messages import HumanMessage, SystemMessage

from src.exceptions import LLMParseError
from src.llm import get_llm, invoke_llm
from src.model_cache import get_encoder
from src.prompts import load_prompt
from src.models import (
    ClaimSpan,
    ClaimType,
    EvidenceAudit,
    LitPool,
    Manuscript,
)


# ---------------------------------------------------------------------------
# Phase 3.1 — Claim ↔ Evidence similarity
# ---------------------------------------------------------------------------

_CITE_PATTERN = re.compile(r"\([^)]*\d{4}[^)]*\)")


def _segment_claims(manuscript: Manuscript) -> list[ClaimSpan]:
    """Split full text into sentence-level claim spans, noting cited ref IDs."""
    sentences = re.split(r"(?<=[.!?])\s+", manuscript.full_text)
    claims: list[ClaimSpan] = []
    offset = 0

    for sent in sentences:
        sent = sent.strip()
        if len(sent) < 20:
            offset += len(sent) + 1
            continue

        # Find inline citation references in this sentence
        cited_ids: list[str] = []
        for m in _CITE_PATTERN.finditer(sent):
            cited_ids.append(m.group(0))

        claims.append(ClaimSpan(
            text=sent,
            start_char=offset,
            end_char=offset + len(sent),
            cited_ref_ids=cited_ids,
        ))
        offset += len(sent) + 1

    return claims


def _compute_similarities(
    claims: list[ClaimSpan],
    reference_texts: list[str],
) -> list[float]:
    """Compute max-cosine similarity of each claim against reference texts."""
    if not reference_texts or not claims:
        return [0.0] * len(claims)

    encoder = get_encoder()
    claim_texts = [c.text for c in claims]
    claim_embs = encoder.encode(claim_texts, convert_to_numpy=True, batch_size=64)
    ref_embs = encoder.encode(reference_texts, convert_to_numpy=True, batch_size=32)

    # Normalize
    claim_norms = np.linalg.norm(claim_embs, axis=1, keepdims=True)
    claim_norms = np.where(claim_norms == 0, 1, claim_norms)
    ref_norms = np.linalg.norm(ref_embs, axis=1, keepdims=True)
    ref_norms = np.where(ref_norms == 0, 1, ref_norms)

    sim_matrix = (claim_embs / claim_norms) @ (ref_embs / ref_norms).T
    max_sims = sim_matrix.max(axis=1)
    return max_sims.tolist()


# ---------------------------------------------------------------------------
# Phase 3.2 — AgentCritic claim classification
# ---------------------------------------------------------------------------



def run_evidence_audit(
    manuscript: Manuscript,
    lit_pool: LitPool,
    *,
    similarity_threshold: float = 0.3,
    model_name: str | None = None,
) -> EvidenceAudit:
    """Run the full Phase 3 evidence audit."""
    # Segment claims
    claims = _segment_claims(manuscript)

    # Build reference text corpus from bibliography + lit_pool
    ref_texts: list[str] = []
    for ref in manuscript.references:
        ref_texts.append(f"{ref.title}. {ref.raw[:200]}")
    for entry in lit_pool.entries:
        ref_texts.append(f"{entry.title}. {entry.abstract[:300]}")

    # Compute similarities
    sims = _compute_similarities(claims, ref_texts)
    for claim, sim in zip(claims, sims):
        claim.evidence_similarity = sim

    # Identify low-similarity cited claims and uncited claims
    low_sim: list[ClaimSpan] = []
    uncited: list[ClaimSpan] = []

    for claim in claims:
        if claim.cited_ref_ids and claim.evidence_similarity < similarity_threshold:
            low_sim.append(claim)
        elif not claim.cited_ref_ids and claim.evidence_similarity < similarity_threshold:
            # Only flag substantial claims (heuristic: contains a verb-like word count)
            if len(claim.text.split()) > 8:
                uncited.append(claim)

    # LLM classification (batch in chunks of 30)
    classified = _classify_claims(claims, model_name=model_name or None)
    for claim, ctype in zip(claims, classified):
        claim.claim_type = ctype

    return EvidenceAudit(
        claims=claims,
        uncited_claims=uncited,
        low_similarity_citations=low_sim,
    )


def _classify_claims(
    claims: list[ClaimSpan],
    *,
    model_name: str | None = None,
    batch_size: int = 30,
) -> list[ClaimType]:
    """Use LLM to classify claims in batches."""
    llm = get_llm(model=model_name, temperature=0.0, json_mode=True)
    results: list[ClaimType] = []

    for i in range(0, len(claims), batch_size):
        batch = claims[i : i + batch_size]
        payload = [
            {
                "index": j,
                "text": c.text[:300],
                "cited": bool(c.cited_ref_ids),
                "similarity": round(c.evidence_similarity, 3),
            }
            for j, c in enumerate(batch)
        ]

        resp = invoke_llm(llm, [
            SystemMessage(content=load_prompt("evidence_critic")),
            HumanMessage(content=json.dumps(payload)),
        ])

        try:
            classifications = json.loads(resp.content)
            type_map = {item["index"]: item["type"] for item in classifications}
        except (json.JSONDecodeError, KeyError) as exc:
            logger.warning(
                "Failed to parse LLM claim classification response: %s — raw: %.200s",
                exc,
                resp.content,
            )
            type_map = {}

        for j in range(len(batch)):
            ctype_str = type_map.get(j, "UNSUPPORTED")
            try:
                results.append(ClaimType(ctype_str))
            except ValueError:
                results.append(ClaimType.UNSUPPORTED)

    return results
