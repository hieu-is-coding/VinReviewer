"""CLI entry-point for the Agentic Academic-Writing Reviewer."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from grading_system_src.orchestration.graph import run_pipeline
from grading_system_src.synthesis.output import save_report


def main(argv: list[str] | None = None) -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(
        prog="agentic-reviewer",
        description="Multi-agent academic-writing reviewer pipeline",
    )
    parser.add_argument(
        "--manuscript", "-m",
        required=True,
        help="Path to the manuscript file (PDF or DOCX)",
    )
    parser.add_argument(
        "--prompt", "-p",
        default="",
        help="Path to the assignment prompt text file",
    )
    parser.add_argument(
        "--output", "-o",
        default="output",
        help="Output directory for reports (default: output/)",
    )
    parser.add_argument(
        "--reference-grade",
        type=float,
        default=None,
        help="Optional reference grade (0-1) for calibration comparison",
    )
    parser.add_argument(
        "--venue",
        default="",
        help="Target venue for venue-aware scoring (e.g., neurips, acl, nature)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    # Read assignment prompt if path provided
    assignment_prompt = ""
    if args.prompt:
        prompt_path = Path(args.prompt)
        if prompt_path.exists():
            assignment_prompt = prompt_path.read_text(encoding="utf-8")
        else:
            assignment_prompt = args.prompt  # treat as raw text

    # Run pipeline
    state = run_pipeline(
        manuscript_path=args.manuscript,
        assignment_prompt=assignment_prompt,
        reference_grade=args.reference_grade,
        target_venue=args.venue,
        output_dir=args.output,
    )

    # Save reports
    paths = save_report(state, args.output)
    print(f"\nReview complete!")
    print(f"  Markdown report: {paths['markdown']}")
    print(f"  JSON output:     {paths['json']}")

    if state.calibrated_score is not None:
        print(f"  Calibrated score: {state.calibrated_score:.2f}")

    if state.comparative:
        print(f"  Percentile: {state.comparative.overall_percentile:.0f}th ({state.comparative.venue_tier})")

    if state.supervisor_result and state.supervisor_result.human_flag:
        print("\n  ⚠ HUMAN REVIEW REQUIRED — red-line violations persisted after regen.")

    sys.exit(0)


def rebut(argv: list[str] | None = None) -> None:
    """Process an author rebuttal against an existing review."""
    load_dotenv()
    parser = argparse.ArgumentParser(
        prog="agentic-reviewer-rebut",
        description="Process author rebuttals against an existing review",
    )
    parser.add_argument(
        "--review-json", "-r",
        required=True,
        help="Path to the review_output.json from a previous run",
    )
    parser.add_argument(
        "--rebuttal", "-b",
        required=True,
        help="Path to the rebuttal JSON file",
    )
    parser.add_argument(
        "--manuscript", "-m",
        required=True,
        help="Path to the original manuscript",
    )
    parser.add_argument(
        "--output", "-o",
        default="output",
        help="Output directory for rebuttal results",
    )
    args = parser.parse_args(argv)

    import json
    from grading_system_src.ingest.pipeline import ingest
    from grading_system_src.models import LeafVerdict, RebuttalEntry, ReviewOutput
    from grading_system_src.rebuttal.handler import process_rebuttals

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    # Load review
    review_data = json.loads(Path(args.review_json).read_text(encoding="utf-8"))
    review_section = review_data.get("review", {})
    review = ReviewOutput(
        verdicts=[LeafVerdict(**v) for v in review_section.get("verdicts", [])],
        overall_score=review_section.get("overall_score", 0.0),
    )

    # Load rebuttals
    rebuttal_data = json.loads(Path(args.rebuttal).read_text(encoding="utf-8"))
    rebuttals = [RebuttalEntry(**r) for r in rebuttal_data]

    # Load manuscript
    manuscript = ingest(args.manuscript)

    # Process
    result = process_rebuttals(rebuttals, review, manuscript)

    # Output
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "rebuttal_result.json"
    output_path.write_text(json.dumps(result.model_dump(), indent=2, default=str), encoding="utf-8")

    print(f"\nRebuttal processed!")
    print(f"  Result: {output_path}")
    print(f"  Score delta: {result.score_delta:+.4f}")
    print(f"  Revised overall: {result.revised_overall_score:.4f}")
    for o in result.outcomes:
        status = "✓ Accepted" if o.accepted else "✗ Rejected"
        print(f"  [{status}] {o.leaf_id}: {o.original_score:.2f} → {o.revised_score:.2f}")

    sys.exit(0)


if __name__ == "__main__":
    main()
