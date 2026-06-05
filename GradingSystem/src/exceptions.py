"""GradingSystem exception hierarchy."""

from __future__ import annotations


class GradingSystemError(Exception):
    """Base exception for all GradingSystem errors."""


class LLMParseError(GradingSystemError):
    """Raised when an LLM response cannot be parsed as expected JSON."""

    def __init__(self, message: str, raw_content: str = ""):
        super().__init__(message)
        self.raw_content = raw_content


class IngestError(GradingSystemError):
    """Raised when manuscript ingestion (PDF/DOCX parsing) fails."""


class FeatureExtractionError(GradingSystemError):
    """Raised when a feature extraction step fails."""
