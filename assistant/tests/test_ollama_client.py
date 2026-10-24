"""Unit tests for Ollama HTTP client using mocked requests."""

from unittest.mock import AsyncMock, patch
import httpx
import pytest

from assistant.src.llm.ollama_client import OllamaClient


@pytest.mark.asyncio
class TestOllamaClient:
    async def test_successful_connectivity_and_model_found(self):
        """Ollama reachable and target model present."""
        client = OllamaClient(base_url="http://127.0.0.1:11434", model="llama3.2")

        mock_resp = AsyncMock(spec=httpx.Response)
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "models": [{"name": "llama3.2:latest"}, {"name": "mistral:latest"}]
        }

        with patch.object(httpx.AsyncClient, "get", return_value=mock_resp):
            connected = await client.is_connected()
            assert connected is True
        await client.close()

    async def test_unreachable_ollama_returns_false(self):
        """Ollama offline / connect error handled gracefully."""
        client = OllamaClient(base_url="http://127.0.0.1:11434", model="llama3.2")

        with patch.object(httpx.AsyncClient, "get", side_effect=httpx.ConnectError("Connection refused")):
            connected = await client.is_connected()
            assert connected is False
        await client.close()

    async def test_missing_model_returns_false(self):
        """Ollama reachable but configured model is not installed."""
        client = OllamaClient(base_url="http://127.0.0.1:11434", model="phi3")

        mock_resp = AsyncMock(spec=httpx.Response)
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "models": [{"name": "llama3.2:latest"}]
        }

        with patch.object(httpx.AsyncClient, "get", return_value=mock_resp):
            connected = await client.is_connected()
            assert connected is False
        await client.close()

    async def test_generation_timeout_triggers_fallback(self):
        """Generation read timeout handled gracefully without crash."""
        client = OllamaClient(base_url="http://127.0.0.1:11434", model="llama3.2", max_retries=1)

        # Mock model check as true
        with patch.object(client, "is_model_available", return_value=True):
            with patch.object(httpx.AsyncClient, "post", side_effect=httpx.ReadTimeout("Generation timed out")):
                result = await client.generate_json("system", "user")
                assert result is None
        await client.close()

    async def test_transient_failure_bounded_retry(self):
        """Client retries transient 503 error up to max_retries."""
        client = OllamaClient(base_url="http://127.0.0.1:11434", model="llama3.2", max_retries=1)

        mock_resp_503 = AsyncMock(spec=httpx.Response)
        mock_resp_503.status_code = 503

        mock_resp_200 = AsyncMock(spec=httpx.Response)
        mock_resp_200.status_code = 200
        mock_resp_200.json.return_value = {"response": '{"test": 123}'}

        with patch.object(client, "is_model_available", return_value=True):
            # First attempt 503, second attempt 200
            with patch.object(httpx.AsyncClient, "post", side_effect=[mock_resp_503, mock_resp_200]) as mock_post:
                res = await client.generate_json("sys", "usr")
                assert res == '{"test": 123}'
                assert mock_post.call_count == 2
        await client.close()

    async def test_empty_or_malformed_response_returns_none(self):
        """Empty response from Ollama returns None."""
        client = OllamaClient(base_url="http://127.0.0.1:11434", model="llama3.2", max_retries=0)

        mock_resp = AsyncMock(spec=httpx.Response)
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": ""}

        with patch.object(client, "is_model_available", return_value=True):
            with patch.object(httpx.AsyncClient, "post", return_value=mock_resp):
                res = await client.generate_json("sys", "usr")
                assert res is None
        await client.close()
