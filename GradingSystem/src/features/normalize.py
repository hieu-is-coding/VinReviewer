"""Z-score normalization against reference corpus baselines."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from src.models import Features

_BASELINES_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "reference_corpus" / "baselines.json"


def normalize_features(features: Features, clip: tuple[float, float] = (-3.0, 3.0)) -> Features:
    """Apply z-score normalization to all features using stored baselines.

    If no baseline exists for a feature, z_score remains None.
    """
    baselines = _load_baselines()

    for fid, fv in features.values.items():
        if fid in baselines:
            mean = baselines[fid]["mean"]
            std = baselines[fid]["std"]
            if std > 0:
                z = (fv.raw_value - mean) / std
                fv.z_score = float(np.clip(z, clip[0], clip[1]))
            else:
                fv.z_score = 0.0

    return features


def _load_baselines() -> dict:
    if not _BASELINES_PATH.exists():
        return {}
    with open(_BASELINES_PATH, encoding="utf-8") as f:
        return json.load(f)
