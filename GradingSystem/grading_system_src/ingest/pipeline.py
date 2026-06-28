"""Unified ingestion entry-point: detect format → parse → detect language."""

import hashlib
import json
import logging
import tempfile
from pathlib import Path

from grading_system_src.models import Language, Manuscript

from .docx_parser import process_docx
from .grobid_client import process_pdf
from .language import detect_language

logger = logging.getLogger(__name__)


def ingest(manuscript_path: str | Path) -> Manuscript:
    """Ingest a manuscript (PDF or DOCX) and return a fully populated Manuscript model."""
    path = Path(manuscript_path)
    if not path.exists():
        raise FileNotFoundError(f"[Errno 2] No such file or directory: '{manuscript_path}'")
        
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        try:
            # Compute MD5 hash of the PDF file
            hasher = hashlib.md5()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
            file_hash = hasher.hexdigest()

            # Cache check
            cache_dir = Path(tempfile.gettempdir()) / "vinreviewer_cache"
            cache_file = cache_dir / f"{file_hash}.json"

            if cache_file.exists():
                logger.info("Using cached parsed manuscript for PDF hash %s (file: %s)", file_hash, path.name)
                cached_data = cache_file.read_text(encoding="utf-8")
                ms = Manuscript.model_validate_json(cached_data)
                ms.source_path = str(path)
                return ms
        except Exception as e:
            logger.warning("Cache check failed: %s. Proceeding with fresh parse.", e)

        # Parse normally if cache miss or error
        ms = process_pdf(path, language=Language.EN)
        ms.language = detect_language(ms.full_text)

        # Save to cache
        try:
            cache_dir = Path(tempfile.gettempdir()) / "vinreviewer_cache"
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_file = cache_dir / f"{file_hash}.json"
            cache_file.write_text(ms.model_dump_json(indent=2), encoding="utf-8")
            logger.info("Cached parsed manuscript for PDF hash %s", file_hash)
        except Exception as e:
            logger.warning("Failed to save parsed manuscript to cache: %s", e)

        return ms
    elif suffix in {".docx", ".doc"}:
        # Parse first to get text, then detect language.
        ms = process_docx(path, language=Language.EN)  # placeholder
        language = detect_language(ms.full_text)
        ms.language = language
        return ms
    elif suffix == ".txt":
        content = path.read_text(encoding="utf-8", errors="ignore")
        # Split into words to estimate count
        word_count = len(content.split())
        from grading_system_src.models import Section
        ms = Manuscript(
            source_path=str(path),
            language=Language.EN,
            title=path.stem,
            abstract="",
            sections=[Section(heading="Body", body=content, level=1)],
            full_text=content,
            references=[],
            inline_citations=[],
            word_count=word_count,
        )
        ms.language = detect_language(ms.full_text)
        return ms
    else:
        raise ValueError(f"Unsupported file format: {suffix}")

