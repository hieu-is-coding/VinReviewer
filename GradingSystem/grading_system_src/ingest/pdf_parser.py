"""PDF parser — uses pypdf + gpt-4o-mini structured output to parse academic PDFs.

No external services required. Falls back to a minimal stub Manuscript on failure.
"""

from __future__ import annotations

import logging
from pathlib import Path

from grading_system_src.models import Manuscript, Reference, Section, Language

logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage


class ParsedReference(BaseModel):
    id: str = Field(description="Unique reference ID, e.g. 'b0', 'b1'")
    title: str = Field(description="Title of the referenced paper or book")
    authors: list[str] = Field(default_factory=list, description="List of authors")
    year: int | None = Field(None, description="Year of publication")
    doi: str | None = Field(None, description="DOI if available")


class ParsedSection(BaseModel):
    heading: str = Field(description="Heading of the section")
    body: str = Field(description="Body text of the section")
    level: int = Field(1, description="Section level (1 for main, 2 for subsection, etc.)")


class ParsedManuscript(BaseModel):
    title: str = Field(description="Title of the manuscript")
    abstract: str = Field(description="Abstract of the manuscript")
    sections: list[ParsedSection] = Field(description="List of sections in the manuscript body")
    references: list[ParsedReference] = Field(default_factory=list, description="Bibliography references list")
    inline_citations: list[str] = Field(default_factory=list, description="List of reference IDs cited in the body")


def process_pdf(pdf_path: str | Path, language: Language) -> Manuscript:
    """Parse a PDF using pypdf for text extraction and gpt-4o-mini for structure.

    Falls back to a minimal stub Manuscript if extraction or LLM call fails.
    """
    pdf_path = Path(pdf_path)

    try:
        import pypdf
        reader = pypdf.PdfReader(pdf_path)
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
        raw_text = "\n\n".join(pages_text)

        if not raw_text.strip():
            raise ValueError("No text could be extracted from PDF")

        from grading_system_src.llm import get_llm
        llm = get_llm(model="gpt-4o-mini", temperature=0.0)
        structured_llm = llm.with_structured_output(ParsedManuscript)

        system_prompt = (
            "You are an expert academic document parser. Parse the provided raw text from a PDF "
            "into a structured representation including title, abstract, sections (headings and body text), "
            "references, and inline citation IDs matching the references list."
        )

        if len(raw_text) > 45_000:
            sample_text = raw_text[:35_000] + "\n\n[... TRUNCATED ...]\n\n" + raw_text[-10_000:]
        else:
            sample_text = raw_text

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Raw text of the academic paper:\n\n{sample_text}"),
        ]

        parsed = structured_llm.invoke(messages)

        sections = [
            Section(heading=s.heading, body=s.body, level=s.level)
            for s in parsed.sections
        ]

        full_text = "\n\n".join(
            f"{s.heading}\n{s.body}" if s.heading else s.body for s in sections
        )

        references = [
            Reference(
                id=r.id,
                title=r.title,
                authors=r.authors,
                year=r.year,
                doi=r.doi,
                raw=f"{', '.join(r.authors)}. {r.title}. {r.year or ''}"
            )
            for r in parsed.references
        ]

        word_count = len(full_text.split())

        return Manuscript(
            source_path=str(pdf_path),
            language=language,
            title=parsed.title,
            abstract=parsed.abstract,
            sections=sections,
            full_text=full_text,
            references=references,
            inline_citations=parsed.inline_citations,
            word_count=word_count,
        )

    except Exception as exc:
        logger.warning(
            "PDF parsing failed for %s: %s. Returning minimal stub manuscript.",
            pdf_path.name,
            exc,
        )
        # Return a minimal valid Manuscript so the pipeline can still run
        return Manuscript(
            source_path=str(pdf_path),
            language=language,
            title=pdf_path.stem,
            abstract="",
            sections=[],
            full_text="",
            references=[],
            inline_citations=[],
            word_count=0,
        )
