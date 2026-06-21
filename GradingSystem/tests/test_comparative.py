"""Tests for comparative scoring."""

import pytest

from grading_system_src.calibration.comparative import (
    ComparativePosition,
    _generate_statements,
    compute_comparative_position,
)
from grading_system_src.models import LeafVerdict


class TestComputeComparativePosition:
    def test_default_venue(self):
        verdicts = [
            LeafVerdict(leaf_id="leaf1", score=0.7),
            LeafVerdict(leaf_id="leaf2", score=0.5),
        ]
        result = compute_comparative_position(0.65, verdicts)
        assert result.venue_tier == "general"
        assert 0 <= result.overall_percentile <= 100
        assert len(result.dimension_percentiles) == 2
        assert len(result.comparative_statements) > 0

    def test_top_conference_venue(self):
        verdicts = [LeafVerdict(leaf_id="leaf1", score=0.85)]
        result = compute_comparative_position(0.85, verdicts, target_venue="neurips")
        assert result.venue_tier == "top_conference"
        # 0.85 should be well above mean (0.72)
        assert result.overall_percentile > 60

    def test_low_score(self):
        verdicts = [LeafVerdict(leaf_id="leaf1", score=0.3)]
        result = compute_comparative_position(0.3, verdicts, target_venue="neurips")
        assert result.overall_percentile < 30


class TestGenerateStatements:
    def test_generates_statements(self):
        stmts = _generate_statements(
            score=0.75,
            percentile=80.0,
            tier="top_conference",
            dim_percentiles={"leaf1": 90.0, "leaf2": 25.0},
        )
        assert len(stmts) >= 2
        assert any("80th percentile" in s for s in stmts)

    def test_below_threshold(self):
        stmts = _generate_statements(
            score=0.4,
            percentile=20.0,
            tier="general",
            dim_percentiles={},
        )
        assert any("below" in s.lower() for s in stmts)
