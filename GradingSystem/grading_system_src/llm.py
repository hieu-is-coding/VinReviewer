"""Shared LLM invocation utilities — single source of truth for retry logic and model construction."""

from __future__ import annotations

import os
from typing import Any

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from openai import APIStatusError, RateLimitError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

DEFAULT_MODEL = "gpt-4o-mini"


@retry(
    retry=retry_if_exception_type((RateLimitError, APIStatusError)),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
    reraise=True,
)
def invoke_llm(llm: ChatOpenAI, messages: list[BaseMessage]) -> Any:
    """Invoke an LLM with automatic retry on transient OpenAI errors."""
    return llm.invoke(messages)


def get_llm(
    model: str | None = None,
    temperature: float = 0.0,
    json_mode: bool = False,
) -> ChatOpenAI:
    """Construct a ChatOpenAI instance with standardised defaults.

    Args:
        model: Model name override. Falls back to OPENAI_MODEL env var, then gpt-4o-mini.
        temperature: Sampling temperature.
        json_mode: If True, requests structured JSON output.
    """
    model = model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    kwargs: dict[str, Any] = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    return ChatOpenAI(model=model, temperature=temperature, model_kwargs=kwargs)
