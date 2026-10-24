"""
assistant/src/config.py

Centralised configuration loaded from environment variables / .env file.
Uses pydantic-settings so every value is type-checked on startup.

All fields have sensible defaults so the service runs without any .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Ollama
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2"
    ollama_timeout_seconds: float = 5.0

    # Service
    assistant_host: str = "127.0.0.1"
    assistant_port: int = 5002

    # Logging
    log_level: str = "INFO"

    # Behaviour
    force_fallback: bool = False


# Singleton — import this everywhere
settings = Settings()
