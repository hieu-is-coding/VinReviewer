"""Tests for config loading."""

from src.config import load_feature_config, load_red_lines_config, load_rubric_config


def test_load_rubric_config() -> None:
    cfg = load_rubric_config()
    assert "dimensions" in cfg
    assert len(cfg["dimensions"]) == 6


def test_load_feature_config() -> None:
    cfg = load_feature_config()
    assert "features" in cfg
    # Check that all feature categories are present
    for cat in ["cohesion", "style", "diversity", "mechanics", "citations"]:
        assert cat in cfg["features"]


def test_load_red_lines_config() -> None:
    cfg = load_red_lines_config()
    assert "rules" in cfg
    for rule_id in ["R1", "R2", "R3", "R4", "R5"]:
        assert rule_id in cfg["rules"]
