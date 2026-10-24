"""Configuration settings for FocusGuard AI Assistant."""

import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class Settings:
    """Runtime configuration read from environment variables with safe defaults."""

    ollama_host: str = field(
        default_factory=lambda: os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    )
    ollama_model: str = field(
        default_factory=lambda: os.getenv("OLLAMA_MODEL", "llama3.2")
    )
    assistant_host: str = field(
        default_factory=lambda: os.getenv("ASSISTANT_HOST", "127.0.0.1")
    )
    assistant_port: int = field(
        default_factory=lambda: int(os.getenv("ASSISTANT_PORT", "5002"))
    )
    ollama_timeout: float = field(
        default_factory=lambda: float(os.getenv("OLLAMA_TIMEOUT", "3.0"))
    )
    ollama_generation_timeout: float = field(
        default_factory=lambda: float(os.getenv("OLLAMA_GENERATION_TIMEOUT", "10.0"))
    )
    ollama_max_retries: int = field(
        default_factory=lambda: int(os.getenv("OLLAMA_MAX_RETRIES", "1"))
    )
    max_task_length: int = field(
        default_factory=lambda: int(os.getenv("MAX_TASK_LENGTH", "500"))
    )
    intervention_cooldown_seconds: int = field(
        default_factory=lambda: int(os.getenv("INTERVENTION_COOLDOWN_SECONDS", "60"))
    )
    cors_origins: List[str] = field(
        default_factory=lambda: [
            "http://127.0.0.1:5002",
            "http://localhost:5002",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]
    )


settings = Settings()
