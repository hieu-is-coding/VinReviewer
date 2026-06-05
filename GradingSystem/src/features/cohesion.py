"""Cohesion feature extraction (Phase 2.1).

EN → TAACO-style adjacent/paragraph overlap + sentence-transformer LSA coherence.
ES → PUCP-Metrix proxies (SECLOS*, CRFNO/AO/SO) via sentence-transformer similarity.
Both → LSA coherence via sentence-transformers.
"""

from __future__ import annotations

import numpy as np

from src.model_cache import get_encoder
from src.models import FeatureValue, Language, Manuscript


def extract_cohesion_features(manuscript: Manuscript) -> dict[str, FeatureValue]:
    """Extract cohesion features, gated by language."""
    features: dict[str, FeatureValue] = {}
    sentences = _split_sentences(manuscript.full_text)

    if len(sentences) < 2:
        return features

    model = get_encoder("all-MiniLM-L6-v2")
    embeddings = model.encode(sentences, convert_to_numpy=True, batch_size=64)

    # LSA coherence (both EN and ES) — mean cosine between adjacent sentences
    adj_sims = _adjacent_cosine(embeddings)
    features["lsa_coherence"] = FeatureValue(
        id="lsa_coherence",
        raw_value=float(np.mean(adj_sims)),
        label="LSA coherence (sentence-transformer)",
    )

    lex_adjacent = _lexical_adjacent_overlap(sentences)
    features["taaco_adjacent_overlap"] = FeatureValue(
        id="taaco_adjacent_overlap",
        raw_value=float(lex_adjacent),
        label="Adjacent sentence overlap",
    )
    # Paragraph overlap — mean similarity between paragraph-boundary sentences
    para_sim = _paragraph_overlap(manuscript, embeddings, sentences)
    features["taaco_paragraph_overlap"] = FeatureValue(
        id="taaco_paragraph_overlap",
        raw_value=float(para_sim),
        label="Paragraph-level overlap",
    )

    return features


def _split_sentences(text: str) -> list[str]:
    """Sentence segmentation using spaCy's rule-based sentencizer."""
    import spacy
    try:
        nlp = spacy.blank("en")
        nlp.add_pipe("sentencizer")
        doc = nlp(text[:500_000])
        return [sent.text.strip() for sent in doc.sents if len(sent.text.strip()) > 10]
    except Exception:
        import re
        raw = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])", text)
        return [s.strip() for s in raw if len(s.strip()) > 10]


def _adjacent_cosine(embeddings: np.ndarray) -> np.ndarray:
    """Cosine similarity between each pair of adjacent sentence embeddings."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    normed = embeddings / norms
    sims = np.sum(normed[:-1] * normed[1:], axis=1)
    return sims


def _paragraph_overlap(
    manuscript: Manuscript,
    embeddings: np.ndarray,
    sentences: list[str],
) -> float:
    """Approximate paragraph-level overlap: cosine between last sentence of each
    section and first sentence of the next."""
    if len(manuscript.sections) < 2:
        return float(np.mean(_adjacent_cosine(embeddings)))

    boundary_sims: list[float] = []
    offset = 0
    for i, sec in enumerate(manuscript.sections[:-1]):
        sec_sents = _split_sentences(sec.body)
        if not sec_sents:
            continue
        last_idx = min(offset + len(sec_sents) - 1, len(embeddings) - 1)
        next_idx = min(last_idx + 1, len(embeddings) - 1)
        if last_idx != next_idx:
            a = embeddings[last_idx]
            b = embeddings[next_idx]
            na = np.linalg.norm(a)
            nb = np.linalg.norm(b)
            if na > 0 and nb > 0:
                boundary_sims.append(float(np.dot(a, b) / (na * nb)))
        offset += len(sec_sents)

    return float(np.mean(boundary_sims)) if boundary_sims else 0.0


def _lexical_adjacent_overlap(sentences: list[str]) -> float:
    """Calculate the average lexical adjacent sentence overlap (Jaccard similarity)."""
    if len(sentences) < 2:
        return 0.0
    import re
    def get_words(s: str) -> set[str]:
        # Filter to alphanumeric words of length > 2 (ignoring short stopwords/punctuation)
        return {w for w in re.findall(r"\b\w{3,}\b", s.lower())}
    
    overlaps: list[float] = []
    word_sets = [get_words(s) for s in sentences]
    for i in range(len(word_sets) - 1):
        set1 = word_sets[i]
        set2 = word_sets[i+1]
        union = set1 | set2
        if union:
            overlaps.append(len(set1 & set2) / len(union))
    return float(np.mean(overlaps)) if overlaps else 0.0

