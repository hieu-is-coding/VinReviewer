"""Thread-safe model cache for sentence-transformers and other ML models."""

from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cache: dict[str, Any] = {}


def get_encoder(model_name: str = "all-mpnet-base-v2") -> Any:
    """Return a cached SentenceTransformer instance, loading on first access.

    Thread-safe: uses a lock to prevent duplicate loads.
    """
    if model_name in _cache:
        return _cache[model_name]

    with _lock:
        if model_name not in _cache:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading SentenceTransformer model: %s", model_name)
            _cache[model_name] = SentenceTransformer(model_name)
    return _cache[model_name]


def get_encoder_with_fallbacks(*model_names: str) -> Any:
    """Try loading models in order, falling back on failure.

    Returns the first model that loads successfully.
    """
    for name in model_names:
        try:
            return get_encoder(name)
        except Exception as exc:
            logger.warning("Failed to load model %s: %s", name, exc)
    raise RuntimeError(f"All model fallbacks failed: {model_names}")
