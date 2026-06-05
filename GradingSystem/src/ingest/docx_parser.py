"""DOCX parser — extract text, sections, and basic references from .docx files."""

from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

from src.models import Language, Manuscript, Reference, Section


# Heading style prefixes recognised by python-docx
_HEADING_RE = re.compile(r"^Heading\s*(\d+)$", re.IGNORECASE)


def process_docx(docx_path: str | Path, language: Language) -> Manuscript:
    """Parse a DOCX file into a Manuscript model."""
    docx_path = Path(docx_path)
    doc = Document(str(docx_path))

    title = ""
    sections: list[Section] = []
    current_heading = ""
    current_level = 1
    current_body_parts: list[str] = []

    for para in doc.paragraphs:
        style_name = para.style.name if para.style else ""
        heading_match = _HEADING_RE.match(style_name)

        if style_name == "Title":
            title = para.text.strip()
            continue

        if heading_match:
            # Flush previous section
            if current_body_parts:
                sections.append(Section(
                    heading=current_heading,
                    body="\n".join(current_body_parts),
                    level=current_level,
                ))
                current_body_parts = []
            current_heading = para.text.strip()
            current_level = int(heading_match.group(1))
        else:
            text = para.text.strip()
            if text:
                current_body_parts.append(text)

    # Flush final section
    if current_body_parts:
        sections.append(Section(
            heading=current_heading,
            body="\n".join(current_body_parts),
            level=current_level,
        ))

    full_text = "\n\n".join(
        f"{s.heading}\n{s.body}" if s.heading else s.body for s in sections
    )
    word_count = len(full_text.split())

    # Attempt basic reference extraction from a "References" / "Bibliography" section
    references = _extract_references(sections)

    # Inline citation detection (parenthetical patterns)
    inline_citations = _detect_inline_citations(full_text)

    return Manuscript(
        source_path=str(docx_path),
        language=language,
        title=title,
        sections=sections,
        full_text=full_text,
        references=references,
        inline_citations=inline_citations,
        word_count=word_count,
    )


_REF_SECTION_NAMES = {"references", "bibliography", "works cited", "obras citadas"}

# Rough pattern: Author (Year). Title …
_REF_LINE_RE = re.compile(
    r"^(.+?)\s*\((\d{4})\)\.\s*(.+)",
    re.MULTILINE,
)


def _extract_references(sections: list[Section]) -> list[Reference]:
    """Extract references from the bibliography section using regex heuristics."""
    refs: list[Reference] = []
    for sec in sections:
        if sec.heading.lower().strip() in _REF_SECTION_NAMES:
            for idx, m in enumerate(_REF_LINE_RE.finditer(sec.body)):
                refs.append(Reference(
                    id=f"docx_ref_{idx}",
                    title=m.group(3).split(".")[0].strip(),
                    authors=[a.strip() for a in m.group(1).split(",") if a.strip()],
                    year=int(m.group(2)),
                    raw=m.group(0),
                ))
    return refs


_INLINE_CITE_RE = re.compile(r"\(([^)]*\d{4}[^)]*)\)")


def _detect_inline_citations(text: str) -> list[str]:
    """Detect parenthetical citations like (Author, 2020)."""
    return [m.group(1) for m in _INLINE_CITE_RE.finditer(text)]
