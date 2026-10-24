"""
assistant/tests/test_ollama_client.py

Tests for Ollama client:
1. Handling offline daemon gracefully without uncaught exceptions
2. Result caching behavior in is_available
3. Successful generation response handling
4. Timeout and error resilience
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from src.llm.ollama_client import OllamaClient


@pytest.mark.asyncio
async def test_ollama_offline_returns_false():
    # Point to an unreachable port
    client = OllamaClient(base_url="http://127.0.0.1:59999", timeout_seconds=0.5)
    available = await client.is_available(force_check=True)
    assert available is False


@pytest.mark.asyncio
async def test_ollama_offline_generate_returns_none():
    client = OllamaClient(base_url="http://127.0.0.1:59999", timeout_seconds=0.5)
    response = await client.generate("test prompt")
    assert response is None


@pytest.mark.asyncio
async def test_ollama_caching_behavior():
    client = OllamaClient(base_url="http://127.0.0.1:59999", timeout_seconds=0.5)
    # First check
    assert await client.is_available(force_check=True) is False
    # Second check within TTL should return cached value without network hit
    assert await client.is_available(force_check=False) is False


@pytest.mark.asyncio
async def test_ollama_generate_success_mocked():
    from unittest.mock import MagicMock
    client = OllamaClient(base_url="http://127.0.0.1:11434")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"response": '{"status": "success"}'}

    with patch.object(client, "is_available", AsyncMock(return_value=True)):
        with patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_response)):
            result = await client.generate("Hello world")
            assert result == '{"status": "success"}'

