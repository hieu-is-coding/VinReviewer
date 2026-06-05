"""Unified ingestion entry-point: detect format → parse → detect language."""

from __future__ import annotations

from pathlib import Path

from src.models import Language, Manuscript

from .docx_parser import process_docx
from .grobid_client import process_pdf
from .language import detect_language


def ingest(manuscript_path: str | Path) -> Manuscript:
    """Ingest a manuscript (PDF or DOCX) and return a fully populated Manuscript model."""
    path = Path(manuscript_path)
    if not path.exists():
        raise FileNotFoundError(f"[Errno 2] No such file or directory: '{manuscript_path}'")
        
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        ms = process_pdf(path, language=Language.EN)
        ms.language = detect_language(ms.full_text)
        return ms
    elif suffix in {".docx", ".doc"}:
        # Parse first to get text, then detect language.
        ms = process_docx(path, language=Language.EN)  # placeholder
        language = detect_language(ms.full_text)
        ms.language = language
        return ms
    else:
        raise ValueError(f"Unsupported file format: {suffix}")
