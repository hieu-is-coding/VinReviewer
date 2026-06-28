"""AgentSupervisor — Red-line enforcement (Phase 4.2).

Checks the generated review against five red-line rules:
  R1: no hallucinated citations
  R2: full rubric coverage
  R3: no contradictory formatting advice
  R4: score within calibrated bound
  R5: citation style consistency

One regen on violation; persistent failures → human flag.
"""

from __future__ import annotations

from grading_system_src.config import load_red_lines_config
from grading_system_src.models import (
    CalibrationParams,
    DeliberationResult,
    EvidenceAudit,
    LitPool,
    Manuscript,
    RedLineID,
    RedLineViolation,
    ReferenceValidation,
    ReviewOutput,
    RubricTree,
    Severity,
    SupervisorResult,
)


def check_red_lines(
    review: ReviewOutput,
    manuscript: Manuscript,
    rubric_tree: RubricTree,
    lit_pool: LitPool,
    evidence_audit: EvidenceAudit,
    calibration: CalibrationParams | None = None,
    assignment_prompt: str = "",
    reference_validation: ReferenceValidation | None = None,
    deliberation: DeliberationResult | None = None,
) -> SupervisorResult:
    """Run all red-line checks against the generated review."""
    violations: list[RedLineViolation] = []

    violations.extend(_check_r1(review, manuscript, lit_pool))
    violations.extend(_check_r2(review, rubric_tree))
    violations.extend(_check_r3(review, assignment_prompt))
    violations.extend(_check_r4(review, calibration))
    violations.extend(_check_r5(review, manuscript))
    violations.extend(_check_r6(reference_validation))
    violations.extend(_check_r7(deliberation))

    passed = len(violations) == 0

    # Determine if any violation requires immediate human flagging
    human_flag = False
    try:
        config = load_red_lines_config()
        rules_config = config.get("rules", {})
        for v in violations:
            v_id = getattr(v.rule_id, "value", v.rule_id)
            for r_cfg in rules_config.values():
                if r_cfg.get("id") == v_id:
                    if r_cfg.get("action_on_violation") == "flag":
                        human_flag = True
                    break
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to determine human_flag from config: %s", e)

    return SupervisorResult(
        passed=passed,
        violations=violations,
        human_flag=human_flag,
    )


# ---------------------------------------------------------------------------
# R1: No hallucinated citations
# ---------------------------------------------------------------------------

def _check_r1(
    review: ReviewOutput,
    manuscript: Manuscript,
    lit_pool: LitPool,
) -> list[RedLineViolation]:
    """Every citation in the review must exist in lit_pool or manuscript bibliography."""
    # Build set of known reference titles (lowercased) and IDs
    known_titles: set[str] = set()
    known_ids: set[str] = set()

    for ref in manuscript.references:
        known_titles.add(ref.title.lower().strip())
        known_ids.add(ref.id)
    for entry in lit_pool.entries:
        known_titles.add(entry.title.lower().strip())
        known_ids.add(entry.paper_id)

    violations: list[RedLineViolation] = []

    # Scan verdict justifications and suggested revisions for parenthetical references
    import re
    cite_pattern = re.compile(r"\(([^)]+\d{4}[^)]*)\)")

    all_text = review.summary + " ".join(
        v.justification + " " + v.suggested_revision for v in review.verdicts
    )

    for match in cite_pattern.finditer(all_text):
        cite_text = match.group(1).strip().lower()
        # Check if any known title fragment appears
        found = any(
            title_fragment in cite_text or cite_text in title_fragment
            for title_fragment in known_titles
            if title_fragment
        )
        if not found:
            # Also check author-year patterns against known references
            found = _author_year_in_bibliography(cite_text, manuscript)

        if not found:
            violations.append(RedLineViolation(
                rule_id=RedLineID.R1,
                severity=Severity.HARD,
                detail=f"Potentially hallucinated citation: ({match.group(1)})",
            ))

    return violations


def _author_year_in_bibliography(cite_text: str, manuscript: Manuscript) -> bool:
    """Check if a 'Author, Year' citation text can be traced to the bibliography."""
    import re
    year_match = re.search(r"(\d{4})", cite_text)
    if not year_match:
        return False
    year = int(year_match.group(1))
    # Extract potential author last name (first word before comma or year)
    words = re.split(r"[,&;]", cite_text.split(str(year))[0])
    author_words = {w.strip().lower() for w in words if len(w.strip()) > 2}

    for ref in manuscript.references:
        if ref.year == year:
            ref_authors_lower = {a.split()[-1].lower() for a in ref.authors if a}
            if author_words & ref_authors_lower:
                return True
    return False


# ---------------------------------------------------------------------------
# R2: Full rubric coverage
# ---------------------------------------------------------------------------

def _check_r2(
    review: ReviewOutput,
    rubric_tree: RubricTree,
) -> list[RedLineViolation]:
    """Every leaf in the rubric tree must appear in the review verdicts."""
    leaf_ids = _collect_leaf_ids(rubric_tree)
    addressed = {v.leaf_id for v in review.verdicts}
    missing = leaf_ids - addressed

    violations: list[RedLineViolation] = []
    if missing:
        violations.append(RedLineViolation(
            rule_id=RedLineID.R2,
            severity=Severity.HARD,
            detail=f"Missing rubric leaves: {', '.join(sorted(missing))}",
        ))
    return violations


def _collect_leaf_ids(tree: RubricTree) -> set[str]:
    """Collect all leaf-node IDs from the rubric tree."""
    leaves: set[str] = set()

    def _walk(node):
        if not node.children:
            leaves.add(node.id)
        for child in node.children:
            _walk(child)

    for dim in tree.dimensions:
        _walk(dim)
    return leaves


# ---------------------------------------------------------------------------
# R3: No contradictory formatting advice
# ---------------------------------------------------------------------------

def _check_r3(
    review: ReviewOutput,
    assignment_prompt: str,
) -> list[RedLineViolation]:
    """Suggested revisions must not contradict assignment formatting requirements."""
    if not assignment_prompt:
        return []

    # Extract formatting constraints from the assignment prompt
    prompt_lower = assignment_prompt.lower()
    violations: list[RedLineViolation] = []

    # Heuristic: check for contradictory page/font/margin mentions
    import re
    format_patterns = {
        "page_count": re.compile(r"(\d+)\s*(?:page|páginas)", re.IGNORECASE),
        "font": re.compile(r"(times new roman|arial|calibri|helvetica)", re.IGNORECASE),
        "font_size": re.compile(r"(\d+)\s*(?:pt|point)", re.IGNORECASE),
        "spacing": re.compile(r"(double|single|1\.5)\s*spac", re.IGNORECASE),
        "margin": re.compile(r"(\d+(?:\.\d+)?)\s*(?:inch|in|cm)\s*margin", re.IGNORECASE),
    }

    prompt_constraints: dict[str, str] = {}
    for key, pattern in format_patterns.items():
        m = pattern.search(prompt_lower)
        if m:
            prompt_constraints[key] = m.group(1).lower()

    # Check revisions for contradictions
    for verdict in review.verdicts:
        rev_lower = verdict.suggested_revision.lower()
        for key, constraint in prompt_constraints.items():
            pattern = format_patterns[key]
            for m in pattern.finditer(rev_lower):
                suggested = m.group(1).lower()
                if suggested != constraint:
                    violations.append(RedLineViolation(
                        rule_id=RedLineID.R3,
                        severity=Severity.HARD,
                        detail=(
                            f"Formatting contradiction in leaf '{verdict.leaf_id}': "
                            f"suggested '{suggested}' but assignment requires '{constraint}' "
                            f"for {key}."
                        ),
                    ))

    return violations


# ---------------------------------------------------------------------------
# R4: Score within calibrated bound
# ---------------------------------------------------------------------------

def _check_r4(
    review: ReviewOutput,
    calibration: CalibrationParams | None,
) -> list[RedLineViolation]:
    """Overall score must fall within the calibrated confidence interval."""
    if calibration is None:
        return []

    violations: list[RedLineViolation] = []
    calibrated = calibration.slope * review.overall_score + calibration.intercept

    if calibrated < calibration.lower_bound or calibrated > calibration.upper_bound:
        violations.append(RedLineViolation(
            rule_id=RedLineID.R4,
            severity=Severity.SOFT,
            detail=(
                f"Calibrated score {calibrated:.3f} outside bounds "
                f"[{calibration.lower_bound:.3f}, {calibration.upper_bound:.3f}]."
            ),
        ))

    return violations


# ---------------------------------------------------------------------------
# R5: Citation style consistency
# ---------------------------------------------------------------------------

_STYLE_MARKERS = {
    "apa": ["et al.", "&"],
    "mla": ["et al.", "and"],
    "chicago": ["et al.", "Ibid"],
}


def _check_r5(
    review: ReviewOutput,
    manuscript: Manuscript,
) -> list[RedLineViolation]:
    """Stylistic suggestions must be consistent with the detected citation style."""
    # Detect citation style from manuscript
    detected_style = _detect_citation_style(manuscript)
    if not detected_style:
        return []

    violations: list[RedLineViolation] = []

    # Check if any verdict suggests a different style
    for verdict in review.verdicts:
        rev_lower = verdict.suggested_revision.lower()
        for style_name, markers in _STYLE_MARKERS.items():
            if style_name == detected_style:
                continue
            # If the suggestion explicitly mentions a different style by name
            if style_name in rev_lower and detected_style not in rev_lower:
                violations.append(RedLineViolation(
                    rule_id=RedLineID.R5,
                    severity=Severity.SOFT,
                    detail=(
                        f"Citation style inconsistency in leaf '{verdict.leaf_id}': "
                        f"detected style is {detected_style.upper()}, "
                        f"but revision suggests {style_name.upper()}."
                    ),
                ))

    return violations


def _detect_citation_style(manuscript: Manuscript) -> str:
    """Heuristic detection of citation style from inline citations and bibliography."""
    text = manuscript.full_text[:10_000]
    bib_text = " ".join(r.raw for r in manuscript.references[:20])

    # APA: (Author, Year) + ampersand in references
    apa_score = text.count("&") + text.count(", 20") + text.count(", 19")
    # MLA: (Author page) + "Works Cited"
    mla_score = text.lower().count("works cited") * 5 + text.count(") ")
    # Chicago: footnotes or "Bibliography" + Ibid
    chicago_score = text.lower().count("bibliography") * 5 + text.lower().count("ibid")

    scores = {"apa": apa_score, "mla": mla_score, "chicago": chicago_score}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else ""


# ---------------------------------------------------------------------------
# R6: No fabricated references in manuscript
# ---------------------------------------------------------------------------

def _check_r6(
    reference_validation: ReferenceValidation | None,
) -> list[RedLineViolation]:
    """Flag if reference validation found fabricated references."""
    if reference_validation is None:
        return []

    violations: list[RedLineViolation] = []
    if reference_validation.fabricated_refs:
        violations.append(RedLineViolation(
            rule_id=RedLineID.R6,
            severity=Severity.HARD,
            detail=(
                f"Potentially fabricated references detected "
                f"({len(reference_validation.fabricated_refs)}): "
                f"{', '.join(reference_validation.fabricated_refs[:5])}"
                + (" ..." if len(reference_validation.fabricated_refs) > 5 else "")
            ),
        ))
    return violations


# ---------------------------------------------------------------------------
# R7: Deliberation disagreement resolved
# ---------------------------------------------------------------------------

def _check_r7(
    deliberation: DeliberationResult | None,
) -> list[RedLineViolation]:
    """Flag if multi-persona deliberation had unresolved high disagreement."""
    if deliberation is None:
        return []

    violations: list[RedLineViolation] = []
    if deliberation.disagreement_flags:
        violations.append(RedLineViolation(
            rule_id=RedLineID.R7,
            severity=Severity.SOFT,
            detail=(
                f"High persona disagreement on {len(deliberation.disagreement_flags)} "
                f"leaf(s): {', '.join(deliberation.disagreement_flags[:5])}"
                + (" ..." if len(deliberation.disagreement_flags) > 5 else "")
            ),
        ))
    return violations
