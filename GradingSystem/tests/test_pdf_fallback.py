"""Tests for PDF primary evaluation and text fallback logic."""

import base64
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from grading_system_src.synthesis.prompt import invoke_llm_synthesis


def test_fallback_when_path_is_none():
    llm = MagicMock()
    system_prompt = "system instructions"
    user_msg = "user message"

    with patch("grading_system_src.synthesis.prompt.invoke_llm") as mock_invoke:
        mock_invoke.return_value = MagicMock(content="Review text")
        
        response = invoke_llm_synthesis(
            llm=llm,
            system_prompt=system_prompt,
            user_msg=user_msg,
            manuscript_path=None,
        )
        
        assert response.content == "Review text"
        mock_invoke.assert_called_once()
        
        # Verify text-only message structure
        call_args = mock_invoke.call_args[0][1]
        assert len(call_args) == 2
        assert isinstance(call_args[0], SystemMessage)
        assert call_args[0].content == system_prompt
        assert isinstance(call_args[1], HumanMessage)
        assert call_args[1].content == user_msg


def test_fallback_when_not_pdf():
    llm = MagicMock()
    system_prompt = "system instructions"
    user_msg = "user message"

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(b"dummy docx content")
        tmp_path = Path(tmp.name)

    try:
        with patch("grading_system_src.synthesis.prompt.invoke_llm") as mock_invoke:
            mock_invoke.return_value = MagicMock(content="Review text")
            
            response = invoke_llm_synthesis(
                llm=llm,
                system_prompt=system_prompt,
                user_msg=user_msg,
                manuscript_path=tmp_path,
            )
            
            assert response.content == "Review text"
            mock_invoke.assert_called_once()
            
            # Verify text-only message structure
            call_args = mock_invoke.call_args[0][1]
            assert isinstance(call_args[1], HumanMessage)
            assert call_args[1].content == user_msg
    finally:
        tmp_path.unlink(missing_ok=True)


def test_pdf_primary_success():
    llm = MagicMock()
    system_prompt = "system instructions"
    user_msg = "user message"

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(b"dummy pdf content")
        tmp_path = Path(tmp.name)

    try:
        with patch("grading_system_src.synthesis.prompt.invoke_llm") as mock_invoke:
            mock_invoke.return_value = MagicMock(content="Review text")
            
            response = invoke_llm_synthesis(
                llm=llm,
                system_prompt=system_prompt,
                user_msg=user_msg,
                manuscript_path=tmp_path,
            )
            
            assert response.content == "Review text"
            mock_invoke.assert_called_once()
            
            # Verify PDF multimodal message structure
            call_args = mock_invoke.call_args[0][1]
            assert len(call_args) == 2
            assert isinstance(call_args[0], SystemMessage)
            assert isinstance(call_args[1], HumanMessage)
            
            content = call_args[1].content
            assert isinstance(content, list)
            assert len(content) == 2
            
            # Text part
            assert content[0]["type"] == "text"
            assert content[0]["text"] == user_msg
            
            # File part
            assert content[1]["type"] == "file"
            assert content[1]["file"]["filename"] == tmp_path.name
            
            expected_b64 = base64.b64encode(b"dummy pdf content").decode("utf-8")
            assert content[1]["file"]["file_data"] == f"data:application/pdf;base64,{expected_b64}"
    finally:
        tmp_path.unlink(missing_ok=True)


def test_pdf_primary_fails_and_falls_back():
    llm = MagicMock()
    system_prompt = "system instructions"
    user_msg = "user message"

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(b"dummy pdf content")
        tmp_path = Path(tmp.name)

    try:
        with patch("grading_system_src.synthesis.prompt.invoke_llm") as mock_invoke:
            # First call raises an exception, second call succeeds
            mock_invoke.side_effect = [Exception("API Error"), MagicMock(content="Fallback review text")]
            
            response = invoke_llm_synthesis(
                llm=llm,
                system_prompt=system_prompt,
                user_msg=user_msg,
                manuscript_path=tmp_path,
            )
            
            assert response.content == "Fallback review text"
            
            # invoke_llm should be called twice (first time with PDF, second time with text)
            assert mock_invoke.call_count == 2
            
            # First call arguments (PDF)
            first_call_args = mock_invoke.call_args_list[0][0][1]
            assert isinstance(first_call_args[1].content, list)
            assert first_call_args[1].content[1]["type"] == "file"
            
            # Second call arguments (Text fallback)
            second_call_args = mock_invoke.call_args_list[1][0][1]
            assert isinstance(second_call_args[1].content, str)
            assert second_call_args[1].content == user_msg
    finally:
        tmp_path.unlink(missing_ok=True)
