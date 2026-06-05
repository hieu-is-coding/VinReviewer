"""Synthesis prompt construction (Phase 4.1).

Injects curated z-scored features, rubric tree, evidence audit, and manuscript
into a structured LLM prompt that produces per-rubric-leaf verdicts.
"""

from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage

from src.llm import get_llm, invoke_llm
from src.prompts import load_prompt
from src.models import (
    EvidenceAudit,
    Features,
    LeafVerdict,
    Manuscript,
    ReviewOutput,
    RubricTree,
)




def generate_review(
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    features: Features,
    evidence_audit: EvidenceAudit,
    *,
    model_name: str | None = None,
    temperature: float = 0.3,
) -> ReviewOutput:
    """Generate a structured review via LLM synthesis."""
    user_msg = _build_user_message(manuscript, rubric_tree, features, evidence_audit)

    llm = get_llm(model=model_name, temperature=temperature, json_mode=True)
    response = invoke_llm(llm, [
        SystemMessage(content=load_prompt("review_synthesis")),
        HumanMessage(content=user_msg),
    ])

    data = json.loads(response.content)

    verdicts = [
        LeafVerdict(
            leaf_id=v["leaf_id"],
            score=v["score"],
            justification=v.get("justification", ""),
            suggested_revision=v.get("suggested_revision", ""),
        )
        for v in data.get("verdicts", [])
    ]

    return ReviewOutput(
        verdicts=verdicts,
        overall_score=data.get("overall_score", 0.0),
        summary=data.get("summary", ""),
        strengths=data.get("strengths", []),
        weaknesses=data.get("weaknesses", []),
    )


def _build_user_message(
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    features: Features,
    evidence_audit: EvidenceAudit,
) -> str:
    """Assemble the user message with all injected context."""
    parts: list[str] = []

    # 1. Rubric tree
    rubric_data = _rubric_to_dict(rubric_tree)
    parts.append(f"## Rubric Tree\n```json\n{json.dumps(rubric_data, indent=2)}\n```")

    # 2. Features (z-scored)
    feat_summary: dict[str, dict] = {}
    for fid, fv in features.values.items():
        feat_summary[fid] = {
            "label": fv.label,
            "raw": round(fv.raw_value, 4),
            "z_score": round(fv.z_score, 2) if fv.z_score is not None else None,
        }
    parts.append(f"## Quantitative Features\n```json\n{json.dumps(feat_summary, indent=2)}\n```")

    # 3. Evidence audit summary
    audit_summary = {
        "total_claims": len(evidence_audit.claims),
        "uncited_claims": len(evidence_audit.uncited_claims),
        "low_similarity_citations": len(evidence_audit.low_similarity_citations),
        "claim_type_distribution": _claim_type_dist(evidence_audit),
    }
    if evidence_audit.uncited_claims:
        audit_summary["sample_uncited"] = [
            c.text[:150] for c in evidence_audit.uncited_claims[:5]
        ]
    if evidence_audit.low_similarity_citations:
        audit_summary["sample_low_sim"] = [
            {"text": c.text[:150], "sim": round(c.evidence_similarity, 3)}
            for c in evidence_audit.low_similarity_citations[:5]
        ]
    parts.append(f"## Evidence Audit\n```json\n{json.dumps(audit_summary, indent=2)}\n```")

    # 4. Manuscript text (truncated to ~15k chars for context window management)
    ms_text = manuscript.full_text[:15_000]
    parts.append(f"## Manuscript Text (truncated)\n{ms_text}")

    # 5. Bibliography
    bib = [{"id": r.id, "title": r.title, "authors": r.authors, "year": r.year}
           for r in manuscript.references[:50]]
    parts.append(f"## Bibliography\n```json\n{json.dumps(bib, indent=2)}\n```")

    return "\n\n".join(parts)


def _rubric_to_dict(tree: RubricTree) -> list[dict]:
    def _node(n):
        d = {"id": n.id, "label": n.label, "weight": n.weight}
        if n.children:
            d["children"] = [_node(c) for c in n.children]
        return d
    return [_node(dim) for dim in tree.dimensions]


def _claim_type_dist(audit: EvidenceAudit) -> dict[str, int]:
    dist: dict[str, int] = {}
    for c in audit.claims:
        dist[c.claim_type.value] = dist.get(c.claim_type.value, 0) + 1
    return dist
