"""Local Ollama HTTP client with timeout, bounded retry, and health discovery."""

import logging
import time
from typing import Any, Dict, List, Optional
import httpx

from ..config import settings

logger = logging.getLogger("focusguard.assistant.ollama")


class OllamaError(Exception):
    """Base exception for Ollama interactions."""
    pass


class OllamaUnavailableError(OllamaError):
    """Raised when Ollama is unreachable, offline, or timed out."""
    pass


class OllamaModelNotFoundError(OllamaError):
    """Raised when the specified model is not installed in Ollama."""
    pass


class OllamaClient:
    """Asynchronous HTTP client for interacting with a local Ollama instance."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        connect_timeout: Optional[float] = None,
        generation_timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
    ):
        self.base_url = (base_url or settings.ollama_host).rstrip("/")
        self.model = model or settings.ollama_model
        self.connect_timeout = connect_timeout or settings.ollama_timeout
        self.generation_timeout = generation_timeout or settings.ollama_generation_timeout
        self.max_retries = max_retries if max_retries is not None else settings.ollama_max_retries

        # Connectivity cache (valid for 5 seconds to keep health endpoints snappy)
        self._last_health_check_time: float = 0.0
        self._cached_connected: bool = False
        self._cached_models: List[str] = []
        self._client: Optional[httpx.AsyncClient] = None

    async def get_http_client(self) -> httpx.AsyncClient:
        """Get or initialize the persistent httpx client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(
                    connect=self.connect_timeout,
                    read=self.generation_timeout,
                    write=self.generation_timeout,
                    pool=self.connect_timeout,
                ),
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def get_available_models(self, force_refresh: bool = False) -> List[str]:
        """Fetch list of available models from Ollama /api/tags."""
        now = time.time()
        if not force_refresh and (now - self._last_health_check_time < 5.0):
            return self._cached_models

        client = await self.get_http_client()
        try:
            resp = await client.get("/api/tags", timeout=self.connect_timeout)
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                self._cached_models = models
                self._cached_connected = True
                self._last_health_check_time = now
                return models
            else:
                logger.warning("Ollama /api/tags responded with status %d", resp.status_code)
                self._cached_connected = False
                self._cached_models = []
                self._last_health_check_time = now
                return []
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
            logger.debug("Ollama connectivity check failed: %s", e)
            self._cached_connected = False
            self._cached_models = []
            self._last_health_check_time = now
            return []
        except Exception as e:
            logger.warning("Unexpected error during Ollama health check: %s", e)
            self._cached_connected = False
            self._cached_models = []
            self._last_health_check_time = now
            return []

    async def is_model_available(self, target_model: Optional[str] = None) -> bool:
        """Check if target model or configured model is available in Ollama."""
        model_to_check = target_model or self.model
        available = await self.get_available_models()
        if not available:
            return False

        # Model names might be "llama3.2" or "llama3.2:latest"
        target_lower = model_to_check.lower()
        for m in available:
            m_lower = m.lower()
            if m_lower == target_lower or m_lower.startswith(f"{target_lower}:") or target_lower.startswith(f"{m_lower}:"):
                return True
        return False

    async def is_connected(self) -> bool:
        """Check whether Ollama is reachable and configured model is installed."""
        return await self.is_model_available(self.model)

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> Optional[Dict[str, Any]]:
        """
        Request JSON generation from Ollama with bounded retries and timeouts.
        Returns parsed JSON dict or None on any failure (triggering fallback).
        """
        # Step 1: verify model availability
        if not await self.is_model_available():
            logger.info("Ollama or model '%s' unavailable. Skipping LLM call.", self.model)
            return None

        payload = {
            "model": self.model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": temperature,
            },
        }

        client = await self.get_http_client()
        attempts = 0
        total_attempts = 1 + max(0, self.max_retries)

        while attempts < total_attempts:
            attempts += 1
            try:
                resp = await client.post(
                    "/api/generate",
                    json=payload,
                    timeout=self.generation_timeout,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    response_text = data.get("response", "")
                    if not response_text:
                        logger.warning("Ollama returned empty response.")
                        return None
                    return response_text  # returned as string to be validated by output_validator
                elif resp.status_code == 404:
                    logger.warning("Ollama returned 404 for model '%s'", self.model)
                    return None
                elif resp.status_code in (502, 503, 504) and attempts < total_attempts:
                    logger.warning("Ollama transient status %d, retrying attempt %d/%d", resp.status_code, attempts, total_attempts)
                    continue
                else:
                    logger.warning("Ollama error status %d", resp.status_code)
                    return None
            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as e:
                logger.warning("Ollama generation timed out (attempt %d/%d): %s", attempts, total_attempts, e)
                if attempts < total_attempts:
                    continue
                return None
            except (httpx.ConnectError, httpx.NetworkError) as e:
                logger.warning("Ollama network connection failed: %s", e)
                if attempts < total_attempts:
                    continue
                return None
            except Exception as e:
                logger.warning("Unexpected error during Ollama generation: %s", e)
                return None

        return None
