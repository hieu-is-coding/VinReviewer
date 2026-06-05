"""Reference validation — verify manuscript references against Crossref and OpenAlex."""

from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.models import Manuscript, RefCheckResult, Reference, ReferenceValidation

logger = logging.getLogger(__name__)

CROSSREF_API_URL = "https://api.crossref.org/works"
OPENALEX_API_URL = "https://api.openalex.org/works"

# Polite pool email for Crossref (gets faster rate limits)
_CROSSREF_MAILTO = os.getenv("CROSSREF_MAILTO", "")


def _title_similarity(a: str, b: str) -> float:
    """Compute normalized similarity between two titles."""
    a_lower = a.strip().lower()
    b_lower = b.strip().lower()
    if not a_lower or not b_lower:
        return 0.0
    return SequenceMatcher(None, a_lower, b_lower).ratio()


@retry(
    retry=retry_if_exception_type(requests.exceptions.ConnectionError),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
def _check_crossref_doi(doi: str) -> dict | None:
    """Verify a DOI exists on Crossref and return metadata."""
    headers = {"Accept": "application/json"}
    if _CROSSREF_MAILTO:
        headers["User-Agent"] = f"AgenticReviewer/1.0 (mailto:{_CROSSREF_MAILTO})"

    url = f"{CROSSREF_API_URL}/{doi}"
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code == 200:
        return resp.json().get("message", {})
    return None


@retry(
    retry=retry_if_exception_type(requests.exceptions.ConnectionError),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
def _search_crossref_title(title: str) -> dict | None:
    """Search Crossref by title and return best match."""
    headers = {"Accept": "application/json"}
    if _CROSSREF_MAILTO:
        headers["User-Agent"] = f"AgenticReviewer/1.0 (mailto:{_CROSSREF_MAILTO})"

    params = {"query.title": title, "rows": 3}
    resp = requests.get(CROSSREF_API_URL, params=params, headers=headers, timeout=10)
    if resp.status_code == 200:
        items = resp.json().get("message", {}).get("items", [])
        if items:
            return items[0]
    return None


@retry(
    retry=retry_if_exception_type(requests.exceptions.ConnectionError),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
def _search_openalex(title: str, authors: list[str] | None = None) -> dict | None:
    """Search OpenAlex by title (and optionally authors) and return best match."""
    params = {"filter": f"title.search:{title}", "per_page": 3}
    headers = {"Accept": "application/json"}
    mailto = os.getenv("OPENALEX_MAILTO", _CROSSREF_MAILTO)
    if mailto:
        params["mailto"] = mailto

    resp = requests.get(OPENALEX_API_URL, params=params, headers=headers, timeout=10)
    if resp.status_code == 200:
        results = resp.json().get("results", [])
        if results:
            return results[0]
    return None


def _validate_single_reference(ref: Reference) -> RefCheckResult:
    """Validate a single reference against external APIs."""
    # Strategy 1: If DOI is available, verify directly via Crossref
    if ref.doi:
        try:
            metadata = _check_crossref_doi(ref.doi)
            if metadata:
                cr_title = " ".join(metadata.get("title", []))
                sim = _title_similarity(ref.title, cr_title)
                if sim >= 0.70:
                    return RefCheckResult(
                        ref_id=ref.id,
                        status="verified",
                        source="crossref",
                        matched_doi=ref.doi,
                        confidence=sim,
                    )
                else:
                    # DOI exists but title doesn't match — suspicious
                    return RefCheckResult(
                        ref_id=ref.id,
                        status="suspicious",
                        source="crossref",
                        matched_doi=ref.doi,
                        confidence=sim,
                    )
        except Exception as e:
            logger.warning("Crossref DOI lookup failed for %s: %s", ref.doi, e)

    # Strategy 2: Search by title on Crossref
    if ref.title:
        try:
            result = _search_crossref_title(ref.title)
            if result:
                cr_title = " ".join(result.get("title", []))
                sim = _title_similarity(ref.title, cr_title)
                matched_doi = result.get("DOI", "")
                if sim >= 0.85:
                    return RefCheckResult(
                        ref_id=ref.id,
                        status="verified",
                        source="crossref",
                        matched_doi=matched_doi,
                        confidence=sim,
                    )
                elif sim >= 0.65:
                    return RefCheckResult(
                        ref_id=ref.id,
                        status="likely_valid",
                        source="crossref",
                        matched_doi=matched_doi,
                        confidence=sim,
                    )
        except Exception as e:
            logger.warning("Crossref title search failed for '%s': %s", ref.title, e)

    # Strategy 3: Fall back to OpenAlex
    if ref.title:
        try:
            result = _search_openalex(ref.title, ref.authors)
            if result:
                oa_title = result.get("title", "")
                sim = _title_similarity(ref.title, oa_title)
                matched_doi = result.get("doi", "")
                if matched_doi and matched_doi.startswith("https://doi.org/"):
                    matched_doi = matched_doi.replace("https://doi.org/", "")
                if sim >= 0.85:
                    return RefCheckResult(
                        ref_id=ref.id,
                        status="verified",
                        source="openalex",
                        matched_doi=matched_doi or None,
                        confidence=sim,
                    )
                elif sim >= 0.65:
                    return RefCheckResult(
                        ref_id=ref.id,
                        status="likely_valid",
                        source="openalex",
                        matched_doi=matched_doi or None,
                        confidence=sim,
                    )
        except Exception as e:
            logger.warning("OpenAlex search failed for '%s': %s", ref.title, e)

    # Could not verify — mark as suspicious if we had something to search,
    # or fabricated if completely empty
    if not ref.title and not ref.doi:
        return RefCheckResult(
            ref_id=ref.id,
            status="fabricated",
            source="unverified",
            confidence=0.0,
        )

    return RefCheckResult(
        ref_id=ref.id,
        status="suspicious",
        source="unverified",
        confidence=0.0,
    )


_rate_lock = threading.Lock()
_last_call_time = 0.0


def _rate_limited_validate(ref: Reference, rate_limit_delay: float) -> RefCheckResult:
    """Validate a single reference with cross-thread rate limiting."""
    global _last_call_time
    with _rate_lock:
        now = time.monotonic()
        wait = rate_limit_delay - (now - _last_call_time)
        if wait > 0:
            time.sleep(wait)
        _last_call_time = time.monotonic()
    return _validate_single_reference(ref)


def validate_references(
    manuscript: Manuscript,
    *,
    rate_limit_delay: float = 0.5,
    max_workers: int = 5,
) -> ReferenceValidation:
    """Validate all references in a manuscript against Crossref and OpenAlex.

    Uses a thread pool with rate limiting for parallel validation.
    """
    if not manuscript.references:
        return ReferenceValidation(verified_ratio=1.0)

    results: list[RefCheckResult] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_rate_limited_validate, ref, rate_limit_delay): i
            for i, ref in enumerate(manuscript.references)
        }
        indexed_results: dict[int, RefCheckResult] = {}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                indexed_results[idx] = future.result()
            except Exception as exc:
                ref = manuscript.references[idx]
                logger.warning("Reference validation failed for %s: %s", ref.title, exc)
                indexed_results[idx] = RefCheckResult(
                    ref_id=ref.id, status="suspicious", source="error", confidence=0.0,
                )
        results = [indexed_results[i] for i in range(len(manuscript.references))]

    verified_count = sum(
        1 for r in results if r.status in ("verified", "likely_valid")
    )
    fabricated = [r.ref_id for r in results if r.status == "fabricated"]
    total = len(results)

    return ReferenceValidation(
        results=results,
        verified_ratio=verified_count / total if total > 0 else 1.0,
        fabricated_refs=fabricated,
    )
