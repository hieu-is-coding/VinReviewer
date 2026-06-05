"""Tests for novelty assessment agent."""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from src.agents.novelty import (
    NoveltyAssessment,
    _compute_novelty_scores,
    assess_novelty,
)
from src.models import Language, LitPool, LitPoolEntry, Manuscript


def _make_manuscript() -> Manuscript:
    return Manuscript(
        source_path="test.pdf",
        language=Language.EN,
        title="A Novel Approach to X",
        abstract="We propose a new method for solving X. Our approach achieves state-of-the-art results.",
        full_text="Introduction\nWe propose a new method for solving X.",
        sections=[],
    )


def _make_lit_pool() -> LitPool:
    return LitPool(
        entries=[
            LitPoolEntry(
                paper_id="p1",
                title="Previous Method for X",
                abstract="We present a method for solving X using deep learning.",
                year=2023,
            ),
            LitPoolEntry(
                paper_id="p2",
                title="Unrelated Paper on Y",
                abstract="This paper addresses problem Y in computer vision.",
                year=2024,
            ),
        ],
        query_keywords=["method X", "solving X"],
    )


class TestComputeNoveltyScores:
    def test_empty_claims(self):
        results = _compute_novelty_scores([], _make_lit_pool())
        assert results == []

    def test_empty_lit_pool(self):
        results = _compute_novelty_scores(
            ["We propose a new thing"],
            LitPool(),
        )
        assert len(results) == 1
        assert results[0].classification == "NOVEL"

    @patch("src.agents.novelty._get_encoder")
    def test_classification_logic(self, mock_encoder):
        # Mock encoder to return controlled embeddings
        encoder = MagicMock()
        # Claim embedding normalized
        claim_emb = np.array([[1.0, 0.0, 0.0]])
        # Lit embeddings: one similar (0.9 cosine), one different
        lit_embs = np.array([[0.9, 0.1, 0.0], [0.0, 1.0, 0.0]])
        # Normalize
        lit_embs = lit_embs / np.linalg.norm(lit_embs, axis=1, keepdims=True)
        claim_emb = claim_emb / np.linalg.norm(claim_emb, axis=1, keepdims=True)

        encoder.encode.side_effect = [claim_emb, lit_embs]
        mock_encoder.return_value = encoder

        lit_pool = LitPool(
            entries=[
                LitPoolEntry(paper_id="p1", title="Similar", abstract="Similar content"),
                LitPoolEntry(paper_id="p2", title="Different", abstract="Different content"),
            ]
        )
        results = _compute_novelty_scores(["Our novel claim"], lit_pool)
        assert len(results) == 1
        # With high similarity, should be REDUNDANT or INCREMENTAL
        assert results[0].classification in ("REDUNDANT", "INCREMENTAL")


class TestAssessNovelty:
    @patch("src.agents.novelty._extract_contribution_claims")
    @patch("src.agents.novelty._compute_novelty_scores")
    def test_full_pipeline(self, mock_scores, mock_claims):
        from src.models import NoveltyClaimResult

        mock_claims.return_value = ["Claim 1", "Claim 2"]
        mock_scores.return_value = [
            NoveltyClaimResult(
                claim_text="Claim 1",
                max_similarity=0.4,
                classification="NOVEL",
                closest_paper_id="p1",
                closest_paper_title="Paper 1",
            ),
            NoveltyClaimResult(
                claim_text="Claim 2",
                max_similarity=0.7,
                classification="INCREMENTAL",
                closest_paper_id="p2",
                closest_paper_title="Paper 2",
            ),
        ]

        result = assess_novelty(_make_manuscript(), _make_lit_pool())
        assert len(result.claims) == 2
        assert 0.0 < result.overall_novelty_score < 1.0

    @patch("src.agents.novelty._extract_contribution_claims")
    def test_no_claims(self, mock_claims):
        mock_claims.return_value = []
        result = assess_novelty(_make_manuscript(), _make_lit_pool())
        assert result.overall_novelty_score == 0.5
