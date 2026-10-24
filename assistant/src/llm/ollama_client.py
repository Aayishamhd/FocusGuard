"""
assistant/src/llm/ollama_client.py

Asynchronous HTTP client for communicating with the local Ollama daemon.
Follows SHARED_CONTRACTS.md and 02_ai_assistant_intervention.md specifications.

Guarantees:
- Never raises uncaught network exceptions to the caller.
- Strictly respects timeouts (default 5.0 seconds).
- Handles markdown/JSON responses cleanly.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class OllamaClientError(Exception):
    """Base exception for Ollama client issues."""


class OllamaClient:
    """Async client interfacing with the Ollama REST API."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ) -> None:
        self.base_url = (base_url or str(settings.ollama_url)).rstrip("/")
        self.model = model or settings.ollama_model
        self.timeout = timeout_seconds or settings.ollama_timeout_seconds
        self._last_health_check: float = 0.0
        self._cached_available: bool = False
        self._cache_ttl_seconds: float = 5.0

    async def is_available(self, force_check: bool = False) -> bool:
        """
        Check if Ollama service is reachable.
        Caches result for 5 seconds to avoid repeated connection timeouts.
        """
        import time

        now = time.monotonic()
        if not force_check and (now - self._last_health_check) < self._cache_ttl_seconds:
            return self._cached_available

        url = f"{self.base_url}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                res = await client.get(url)
                self._cached_available = res.status_code == 200
        except Exception as exc:
            logger.debug("Ollama availability check failed: %s", exc)
            self._cached_available = False

        self._last_health_check = now
        return self._cached_available

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        format_json: bool = True,
        temperature: float = 0.2,
    ) -> Optional[str]:
        """
        Send a generation request to Ollama (/api/generate).
        
        Returns the raw string output (expected to be JSON) or None on failure/timeout.
        """
        if not await self.is_available():
            return None
        url = f"{self.base_url}/api/generate"
        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }
        if system:
            payload["system"] = system
        if format_json:
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                logger.debug("Sending prompt to Ollama (%s) at %s", self.model, url)
                response = await client.post(url, json=payload)
                if response.status_code != 200:
                    logger.warning(
                        "Ollama returned HTTP %d: %s",
                        response.status_code,
                        response.text[:200],
                    )
                    return None

                data = response.json()
                return data.get("response")
        except httpx.TimeoutException:
            logger.warning(
                "Ollama generation timed out after %.1fs (model=%s)",
                self.timeout,
                self.model,
            )
            return None
        except httpx.ConnectError:
            logger.warning("Could not connect to Ollama at %s", self.base_url)
            return None
        except Exception as exc:
            logger.error("Unexpected error during Ollama generation: %s", exc)
            return None


# Global singleton instance
ollama_client = OllamaClient()
