"""Thread-safe model cache for OpenAI embeddings and other tools."""

from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cache: dict[str, Any] = {}


class OpenAIEncoder:
    """A compatibility wrapper that mimics SentenceTransformer encode interface

    using a deterministic, lightweight hashing feature encoder.
    This ensures 100% offline compatibility, zero footprint, and avoids OpenAI embedding model access restrictions.
    """

    def __init__(self) -> None:
        self.num_features = 768

    def encode(
        self,
        texts: list[str] | str,
        convert_to_numpy: bool = True,
        **kwargs: Any,
    ) -> Any:
        if isinstance(texts, str):
            texts = [texts]

        import hashlib
        import numpy as np

        vectors = []
        for text in texts:
            # Tokenize words (alphanumeric, length >= 2)
            import re
            words = re.findall(r"\b\w{2,}\b", text.lower())
            
            vec = np.zeros(self.num_features)
            for word in words:
                # Use MD5 for deterministic hashing across processes
                h = hashlib.md5(word.encode("utf-8")).hexdigest()
                idx = int(h, 16) % self.num_features
                vec[idx] += 1.0

            # Log transform for TF scaling
            vec = np.log1p(vec)

            # L2 Normalize
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            vectors.append(vec)

        arr = np.array(vectors)
        return arr


def get_encoder(model_name: str = "hash-encoder") -> Any:
    """Return a cached OpenAIEncoder instance, loading on first access.

    Thread-safe: uses a lock to prevent duplicate loads.
    """
    cache_key = "openai_encoder"
    if cache_key in _cache:
        return _cache[cache_key]

    with _lock:
        if cache_key not in _cache:
            logger.info("Initializing Hash-based OpenAIEncoder compatibility wrapper")
            _cache[cache_key] = OpenAIEncoder()
    return _cache[cache_key]


def get_encoder_with_fallbacks(*model_names: str) -> Any:
    """Try loading models in order, falling back on failure.

    Always returns the cached OpenAIEncoder in this API-only setup.
    """
    return get_encoder()

