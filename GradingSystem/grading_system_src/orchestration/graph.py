"""LangGraph orchestration — state machine connecting all pipeline phases.

Phases:
  0. Ingest manuscript
  1a. Build rubric tree (venue-aware) | 1b. Retrieve literature | 1c. Extract features + ref validation (parallel)
  2. Evidence audit + Novelty assessment
  3. Multi-persona deliberation (3 reviewers + voting)
  3b. Supervisor red-line check (loop up to 1 regen)
  4. Calibrate + Comparative scoring
  5. (Optional) Perturbation confidence test
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from langgraph.graph import END, StateGraph

from grading_system_src.agents.critic import run_evidence_audit
from grading_system_src.agents.novelty import assess_novelty
from grading_system_src.agents.objective import build_rubric_tree
from grading_system_src.agents.retrieval import retrieve_literature
from grading_system_src.agents.supervisor import check_red_lines
from grading_system_src.calibration.calibrator import apply_calibration, load_calibration
from grading_system_src.calibration.comparative import compute_comparative_position
from grading_system_src.features.normalize import normalize_features
from grading_system_src.features.references import validate_references
from grading_system_src.features.router import extract_all_features
from grading_system_src.ingest.pipeline import ingest
from grading_system_src.models import PipelineState, SupervisorResult
from grading_system_src.synthesis.deliberation import run_deliberation
from grading_system_src.synthesis.output import render_json_output, render_markdown_report
from grading_system_src.synthesis.prompt import generate_review

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Node functions & output serialization helper
# ---------------------------------------------------------------------------

def _save_phase_output(state: dict[str, Any], phase_name: str, data: Any) -> None:
    """Save intermediate phase data as a JSON file if output_dir is configured."""
    output_dir = state.get("output_dir")
    if not output_dir:
        return

    try:
        from pydantic import BaseModel
        import json
        from pathlib import Path

        path = Path(output_dir) / "phases"
        path.mkdir(parents=True, exist_ok=True)
        file_path = path / f"{phase_name}.json"

        # Serialize based on type
        if isinstance(data, BaseModel):
            serialized = data.model_dump()
        elif isinstance(data, dict):
            # Dict of Pydantic models or primitive types
            serialized = {}
            for k, v in data.items():
                if isinstance(v, BaseModel):
                    serialized[k] = v.model_dump()
                else:
                    serialized[k] = v
        elif isinstance(data, list):
            serialized = [
                item.model_dump() if isinstance(item, BaseModel) else item
                for item in data
            ]
        else:
            serialized = data

        file_path.write_text(json.dumps(serialized, indent=2, default=str), encoding="utf-8")
        logger.info("Phase Output Saved: %s -> %s", phase_name, file_path)
    except Exception as e:
        logger.error("Failed to save output for %s: %s", phase_name, e)


from functools import wraps

def _skip_if_error(func):
    """Decorator to skip node execution if errors are present, and catch unexpected exceptions."""
    @wraps(func)
    def wrapper(state: dict[str, Any], *args, **kwargs):
        if state.get("errors"):
            logger.info("Skipping node %s due to pre-existing errors in state", func.__name__)
            return {}
        try:
            return func(state, *args, **kwargs)
        except Exception as exc:
            node_name = func.__name__
            error_msg = f"[{node_name}] {type(exc).__name__}: {exc}"
            logger.exception("Node %s failed: %s", node_name, exc)
            return {"errors": state.get("errors", []) + [error_msg]}
    return wrapper


def _require_fields(state: dict[str, Any], *field_names: str) -> list[str]:
    """Check that required fields are present and non-None in the state.
    Returns a list of missing field names (empty if all present).
    """
    return [f for f in field_names if state.get(f) is None]


def _node_ingest(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 0: Ingest manuscript."""
    logger.info("Phase 0 — Ingesting manuscript: %s", state["manuscript_path"])
    try:
        manuscript = ingest(state["manuscript_path"])
        _save_phase_output(state, "phase_0_ingestion", manuscript)
        return {"manuscript": manuscript}
    except (FileNotFoundError, OSError) as e:
        error_msg = f"[Errno 2] No such file or directory: '{state['manuscript_path']}'"
        logger.error("Ingestion failed: %s", error_msg)
        return {"errors": state.get("errors", []) + [error_msg]}


@_skip_if_error
def _node_rubric(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 1.1: Build rubric tree (venue-aware)."""
    logger.info("Phase 1.1 — Building rubric tree")
    rubric_tree = build_rubric_tree(
        state.get("assignment_prompt", ""),
        target_venue=state.get("target_venue", ""),
    )
    _save_phase_output(state, "phase_1a_rubric", rubric_tree)
    return {"rubric_tree": rubric_tree}


@_skip_if_error
def _node_retrieval(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 1.2: Retrieve supporting literature."""
    missing = _require_fields(state, "manuscript")
    if missing:
        return {"errors": state.get("errors", []) + [f"[_node_retrieval] Missing fields: {missing}"]}
    logger.info("Phase 1.2 — Retrieving literature")
    ms = state["manuscript"]
    lit_pool = retrieve_literature(
        title=ms.title,
        abstract=ms.abstract,
        assignment_prompt=state.get("assignment_prompt", ""),
    )
    _save_phase_output(state, "phase_1b_retrieval", lit_pool)
    return {"lit_pool": lit_pool}


@_skip_if_error
def _node_features(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 2: Extract and normalize features."""
    missing = _require_fields(state, "manuscript")
    if missing:
        return {"errors": state.get("errors", []) + [f"[_node_features] Missing fields: {missing}"]}
    logger.info("Phase 2 — Extracting features")
    features = extract_all_features(state["manuscript"])
    features = normalize_features(features)
    _save_phase_output(state, "phase_2_features", features)
    return {"features": features}


@_skip_if_error
def _node_ref_validation(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 2b: Validate manuscript references against Crossref/OpenAlex."""
    missing = _require_fields(state, "manuscript")
    if missing:
        return {"errors": state.get("errors", []) + [f"[_node_ref_validation] Missing fields: {missing}"]}
    logger.info("Phase 2b — Validating references")
    ref_val = validate_references(state["manuscript"])
    _save_phase_output(state, "phase_2b_ref_validation", ref_val)
    return {"reference_validation": ref_val}


@_skip_if_error
def _node_evidence(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 3: Evidence audit."""
    missing = _require_fields(state, "manuscript", "lit_pool")
    if missing:
        return {"errors": state.get("errors", []) + [f"[_node_evidence] Missing fields: {missing}"]}
    logger.info("Phase 3 — Running evidence audit")
    evidence_audit = run_evidence_audit(
        state["manuscript"],
        state["lit_pool"],
    )
    _save_phase_output(state, "phase_3_evidence", evidence_audit)
    return {"evidence_audit": evidence_audit}


@_skip_if_error
def _node_novelty(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 3b: Novelty assessment."""
    missing = _require_fields(state, "manuscript", "lit_pool")
    if missing:
        return {"errors": state.get("errors", []) + [f"[_node_novelty] Missing fields: {missing}"]}
    logger.info("Phase 3b — Assessing novelty")
    novelty = assess_novelty(state["manuscript"], state["lit_pool"])
    _save_phase_output(state, "phase_3b_novelty", novelty)
    return {"novelty": novelty}


@_skip_if_error
def _node_synthesis(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 4.1: Generate LLM review via multi-persona deliberation."""
    missing = _require_fields(state, "manuscript", "rubric_tree", "features", "evidence_audit")
    if missing:
        return {"errors": state.get("errors", []) + [f"[_node_synthesis] Missing fields: {missing}"]}
    logger.info("Phase 4.1 — Running multi-persona deliberation")
    deliberation = run_deliberation(
        state["manuscript"],
        state["rubric_tree"],
        state["features"],
        state["evidence_audit"],
        novelty=state.get("novelty"),
    )
    # Convert deliberation result to ReviewOutput for downstream compatibility
    from grading_system_src.models import ReviewOutput
    review = ReviewOutput(
        verdicts=deliberation.final_verdicts,
        overall_score=deliberation.final_score,
        summary="; ".join(pr.summary for pr in deliberation.persona_reviews if pr.summary),
        strengths=[],
        weaknesses=[],
    )
    _save_phase_output(state, "phase_4_1_deliberation", deliberation)
    return {"review": review, "deliberation": deliberation}


@_skip_if_error
def _node_supervisor(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 4.2: Red-line check."""
    logger.info("Phase 4.2 — Running supervisor red-line checks")
    calibration = state.get("calibration")
    result = check_red_lines(
        state["review"],
        state["manuscript"],
        state["rubric_tree"],
        state["lit_pool"],
        state["evidence_audit"],
        calibration=calibration,
        assignment_prompt=state.get("assignment_prompt", ""),
        reference_validation=state.get("reference_validation"),
        deliberation=state.get("deliberation"),
    )

    # Track regen attempts
    prev_result: SupervisorResult | None = state.get("supervisor_result")
    regen_count = (prev_result.regen_count if prev_result else 0) + (0 if result.passed else 1)
    result.regen_count = regen_count

    # If failed and max regen exceeded → human flag
    if not result.passed and regen_count > 1:
        result.human_flag = True

    _save_phase_output(state, "phase_4_2_supervisor", result)
    return {"supervisor_result": result}


def _should_regen(state: dict[str, Any]) -> str:
    """Conditional edge: regen synthesis or proceed to calibration."""
    sr: SupervisorResult | None = state.get("supervisor_result")
    if sr and not sr.passed and sr.regen_count <= 1 and not sr.human_flag:
        logger.info("Red-line violation — regenerating review (attempt %d)", sr.regen_count)
        return "regen"
    return "proceed"


@_skip_if_error
def _node_calibrate(state: dict[str, Any]) -> dict[str, Any]:
    """Phase 5: Apply calibration, comparative scoring, and produce final score."""
    logger.info("Phase 5 — Calibrating score")
    calibration = load_calibration()
    calibrated = apply_calibration(state["review"].overall_score, calibration)
    
    # Comparative positioning
    comparative = compute_comparative_position(
        calibrated,
        state["review"].verdicts,
        target_venue=state.get("target_venue", ""),
    )

    # Save both calibration details and calibrated score info
    _save_phase_output(state, "phase_5_calibration", {
        "calibration": calibration,
        "raw_score": state["review"].overall_score if state.get("review") else None,
        "calibrated_score": calibrated,
        "comparative": comparative,
    })
    return {
        "calibration": calibration,
        "calibrated_score": calibrated,
        "comparative": comparative,
    }


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

from typing import Annotated, Any, TypedDict

def merge_errors(left: list[str], right: list[str]) -> list[str]:
    """Combine error lists without duplicates while maintaining order."""
    res = list(left)
    for x in right:
        if x not in res:
            res.append(x)
    return res

class GraphState(TypedDict, total=False):
    manuscript_path: str
    assignment_prompt: str
    reference_grade: float | None
    target_venue: str
    run_id: str
    errors: Annotated[list[str], merge_errors]
    output_dir: str | None

    
    manuscript: Any
    rubric_tree: Any
    lit_pool: Any
    features: Any
    reference_validation: Any
    evidence_audit: Any
    novelty: Any
    review: Any
    deliberation: Any
    supervisor_result: Any
    calibration: Any
    calibrated_score: float | None
    comparative: Any
    perturbation: Any

def build_graph() -> StateGraph:
    """Build and compile the LangGraph pipeline."""
    graph = StateGraph(GraphState)

    # Add nodes
    graph.add_node("ingest", _node_ingest)
    graph.add_node("rubric", _node_rubric)
    graph.add_node("retrieval", _node_retrieval)
    graph.add_node("features", _node_features)
    graph.add_node("ref_validation", _node_ref_validation)
    graph.add_node("evidence", _node_evidence)
    graph.add_node("novelty", _node_novelty)
    graph.add_node("synthesis", _node_synthesis)
    graph.add_node("supervisor", _node_supervisor)
    graph.add_node("calibrate", _node_calibrate)

    # Edges
    graph.set_entry_point("ingest")

    # After ingest: parallel — rubric + retrieval + features + ref_validation
    graph.add_edge("ingest", "rubric")
    graph.add_edge("ingest", "retrieval")
    graph.add_edge("ingest", "features")
    graph.add_edge("ingest", "ref_validation")

    # After rubric + retrieval + features → evidence + novelty
    graph.add_edge("rubric", "evidence")
    graph.add_edge("retrieval", "evidence")
    graph.add_edge("features", "evidence")
    graph.add_edge("ref_validation", "evidence")

    # Novelty depends on retrieval (needs lit_pool)
    graph.add_edge("retrieval", "novelty")

    # Evidence + novelty → synthesis (deliberation)
    graph.add_edge("evidence", "synthesis")
    graph.add_edge("novelty", "synthesis")

    # Synthesis → supervisor
    graph.add_edge("synthesis", "supervisor")

    # Supervisor → conditional: regen or proceed
    graph.add_conditional_edges(
        "supervisor",
        _should_regen,
        {"regen": "synthesis", "proceed": "calibrate"},
    )

    # Calibrate → end
    graph.add_edge("calibrate", END)

    return graph


def run_pipeline(
    manuscript_path: str,
    assignment_prompt: str = "",
    reference_grade: float | None = None,
    target_venue: str = "",
    output_dir: str | None = None,
) -> PipelineState:
    """Run the full review pipeline and return the final state."""
    from pathlib import Path
    
    path = Path(manuscript_path)
    if not path.exists():
        return PipelineState(
            manuscript_path=manuscript_path,
            assignment_prompt=assignment_prompt,
            reference_grade=reference_grade,
            target_venue=target_venue,
            run_id=str(uuid.uuid4()),
            errors=[f"[Errno 2] No such file or directory: '{manuscript_path}'"],
        )

    graph = build_graph()
    compiled = graph.compile()

    initial_state = {
        "manuscript_path": manuscript_path,
        "assignment_prompt": assignment_prompt,
        "reference_grade": reference_grade,
        "target_venue": target_venue,
        "run_id": str(uuid.uuid4()),
        "errors": [],
        "output_dir": output_dir,
    }

    final_state = compiled.invoke(initial_state)

    # Convert to PipelineState for typed access
    return PipelineState(**{
        k: v for k, v in final_state.items()
        if k in PipelineState.model_fields
    })
