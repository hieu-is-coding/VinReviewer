"""Diagnostic output renderer (Phase 5.1).

Produces:
- Rubric-tree report (Markdown)
- Annotated feature radar description
- Evidence-audit table
- Reference validation summary
- Novelty assessment
- Comparative positioning
- Multi-persona deliberation details
- Explicit "AI-unreliable" panel
- JSON structured output
"""

from __future__ import annotations

import json
from pathlib import Path

from grading_system_src.models import (
    EvidenceAudit,
    Features,
    Manuscript,
    PipelineState,
    ReviewOutput,
    RubricTree,
    SupervisorResult,
)


def render_markdown_report(state: PipelineState) -> str:
    """Render a full Markdown diagnostic report from the pipeline state."""
    parts: list[str] = []
    parts.append(f"# Academic Writing Review Report")
    
    if state.errors:
        parts.append("## Pipeline Errors")
        for err in state.errors:
            parts.append(f"- ❌ {err}")
        parts.append("")

    if state.manuscript:
        parts.append(f"**Manuscript:** {state.manuscript.title or state.manuscript_path}")
        parts.append(f"**Language:** {state.manuscript.language.value.upper()}")
        parts.append(f"**Word count:** {state.manuscript.word_count}")
    else:
        parts.append(f"**Manuscript Path:** {state.manuscript_path}")
        
    if state.calibrated_score is not None:
        parts.append(f"**Calibrated score:** {state.calibrated_score:.2f}")
    parts.append("")

    # Summary
    if state.review:
        parts.append("## Summary")
        parts.append(state.review.summary)
        parts.append(f"\n**Overall score:** {state.review.overall_score:.2f}")
        parts.append("")

        # Strengths & weaknesses
        if state.review.strengths:
            parts.append("## Strengths")
            for s in state.review.strengths:
                parts.append(f"- {s}")
            parts.append("")

        if state.review.weaknesses:
            parts.append("## Weaknesses")
            for w in state.review.weaknesses:
                parts.append(f"- {w}")
            parts.append("")

        # Per-leaf verdicts
        parts.append("## Rubric Verdicts")
        parts.append("")
        parts.append("| Criterion | Score | Justification | Suggested Revision |")
        parts.append("|-----------|-------|---------------|-------------------|")
        for v in state.review.verdicts:
            just = v.justification.replace("\n", " ")[:200]
            rev = v.suggested_revision.replace("\n", " ")[:150]
            parts.append(f"| {v.leaf_id} | {v.score:.2f} | {just} | {rev} |")
        parts.append("")

    # Feature summary
    if state.features:
        parts.append("## Quantitative Features")
        parts.append("")
        parts.append("| Feature | Raw Value | Z-Score |")
        parts.append("|---------|-----------|---------|")
        for fid, fv in state.features.values.items():
            z = f"{fv.z_score:.2f}" if fv.z_score is not None else "—"
            parts.append(f"| {fv.label} | {fv.raw_value:.4f} | {z} |")
        parts.append("")

    # Evidence audit
    if state.evidence_audit:
        audit = state.evidence_audit
        parts.append("## Evidence Audit")
        parts.append(f"- Total claims analysed: {len(audit.claims)}")
        parts.append(f"- Uncited claims flagged: {len(audit.uncited_claims)}")
        parts.append(f"- Low-similarity citations: {len(audit.low_similarity_citations)}")
        parts.append("")

        if audit.uncited_claims:
            parts.append("### Uncited Claims (samples)")
            for c in audit.uncited_claims[:5]:
                parts.append(f"> {c.text[:200]}")
            parts.append("")

        if audit.low_similarity_citations:
            parts.append("### Low-Similarity Citations (samples)")
            for c in audit.low_similarity_citations[:5]:
                parts.append(f"> {c.text[:200]} (sim={c.evidence_similarity:.3f})")
            parts.append("")

    # Supervisor result
    if state.supervisor_result:
        sr = state.supervisor_result
        status = "PASSED" if sr.passed else "FAILED"
        parts.append(f"## Red-Line Check: {status}")
        if sr.violations:
            for v in sr.violations:
                parts.append(f"- **{v.rule_id.value}** [{v.severity.value}]: {v.detail}")
        if sr.human_flag:
            parts.append("\n**⚠ HUMAN REVIEW REQUIRED**")
        parts.append("")

    # Reference Validation
    if state.reference_validation:
        rv = state.reference_validation
        parts.append("## Reference Validation")
        parts.append(f"- Verified ratio: {rv.verified_ratio:.0%}")
        parts.append(f"- Total references checked: {len(rv.results)}")
        if rv.fabricated_refs:
            parts.append(f"- **⚠ Potentially fabricated references:** {', '.join(rv.fabricated_refs)}")
        parts.append("")
        parts.append("| Ref ID | Status | Source | Confidence |")
        parts.append("|--------|--------|--------|------------|")
        for r in rv.results[:20]:
            parts.append(f"| {r.ref_id} | {r.status} | {r.source} | {r.confidence:.2f} |")
        parts.append("")

    # Novelty Assessment
    if state.novelty:
        nov = state.novelty
        parts.append("## Novelty Assessment")
        parts.append(f"**Overall Novelty Score:** {nov.overall_novelty_score:.2f}")
        parts.append("")
        if nov.claims:
            parts.append("| Contribution Claim | Classification | Max Similarity | Closest Paper |")
            parts.append("|-------------------|----------------|----------------|---------------|")
            for c in nov.claims:
                claim_short = c.claim_text[:100]
                parts.append(f"| {claim_short} | {c.classification} | {c.max_similarity:.3f} | {c.closest_paper_title[:60]} |")
            parts.append("")

    # Multi-Persona Deliberation
    if state.deliberation:
        delib = state.deliberation
        parts.append("## Multi-Persona Deliberation")
        parts.append("")
        for pr in delib.persona_reviews:
            parts.append(f"### {pr.persona.title()} Expert — Score: {pr.overall_score:.2f}")
            if pr.summary:
                parts.append(f"> {pr.summary[:300]}")
            parts.append("")
        if delib.disagreement_flags:
            parts.append(f"**⚠ High disagreement on:** {', '.join(delib.disagreement_flags)}")
            parts.append("")

    # Comparative Positioning
    if state.comparative:
        comp = state.comparative
        parts.append("## Comparative Positioning")
        parts.append(f"**Venue tier:** {comp.venue_tier}")
        parts.append(f"**Overall percentile:** {comp.overall_percentile:.0f}th")
        parts.append("")
        for stmt in comp.comparative_statements:
            parts.append(f"- {stmt}")
        parts.append("")

    # Perturbation Confidence
    if state.perturbation:
        pert = state.perturbation
        parts.append("## Review Confidence")
        parts.append(f"**Confidence:** {pert.confidence_label} ({pert.confidence:.2f})")
        parts.append(f"**Score std across perturbations:** {pert.score_std:.4f}")
        if pert.unstable_leaves:
            parts.append(f"**Unstable criteria:** {', '.join(pert.unstable_leaves)}")
        parts.append("")

    # AI-unreliable panel
    parts.append("## AI-Unreliable Assessment Panel")
    parts.append(
        "The following aspects are difficult for automated systems to assess reliably "
        "and should be verified by a human reviewer:"
    )
    parts.append("- **Irony and sarcasm detection** — may be misinterpreted as literal")
    parts.append("- **Metaphor appropriateness** — cultural and disciplinary nuance")
    parts.append("- **Argument authenticity** — whether arguments reflect genuine understanding")
    parts.append("- **Creative or non-standard structure** — may be penalised unfairly")
    parts.append("- **Domain-specific jargon accuracy** — specialised terminology validation")
    parts.append("")

    return "\n".join(parts)


def render_json_output(state: PipelineState) -> str:
    """Render the structured JSON output."""
    output = {
        "manuscript": {
            "path": state.manuscript_path,
            "title": state.manuscript.title if state.manuscript else "",
            "language": state.manuscript.language.value if state.manuscript else "",
            "word_count": state.manuscript.word_count if state.manuscript else 0,
        },
        "target_venue": state.target_venue,
        "review": state.review.model_dump() if state.review else None,
        "features": {
            fid: fv.model_dump()
            for fid, fv in (state.features.values.items() if state.features else {})
        },
        "evidence_audit": {
            "total_claims": len(state.evidence_audit.claims) if state.evidence_audit else 0,
            "uncited_claims": len(state.evidence_audit.uncited_claims) if state.evidence_audit else 0,
            "low_similarity": len(state.evidence_audit.low_similarity_citations) if state.evidence_audit else 0,
        },
        "reference_validation": state.reference_validation.model_dump() if state.reference_validation else None,
        "novelty": state.novelty.model_dump() if state.novelty else None,
        "deliberation": state.deliberation.model_dump() if state.deliberation else None,
        "supervisor": state.supervisor_result.model_dump() if state.supervisor_result else None,
        "calibrated_score": state.calibrated_score,
        "comparative": state.comparative.model_dump() if state.comparative else None,
        "perturbation": state.perturbation.model_dump() if state.perturbation else None,
        "errors": state.errors,
    }
    return json.dumps(output, indent=2, default=str)


def save_report(state: PipelineState, output_dir: str | Path) -> dict[str, Path]:
    """Save both Markdown and JSON reports to the output directory."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    md_path = output_dir / "review_report.md"
    json_path = output_dir / "review_output.json"

    md_path.write_text(render_markdown_report(state), encoding="utf-8")
    json_path.write_text(render_json_output(state), encoding="utf-8")

    return {"markdown": md_path, "json": json_path}
