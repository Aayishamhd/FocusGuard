"""
assistant/tests/conftest.py

Shared pytest fixtures for all assistant tests.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

# Ensure assistant directory is on sys.path
ASSISTANT_ROOT = Path(__file__).parent.parent
if str(ASSISTANT_ROOT) not in sys.path:
    sys.path.insert(0, str(ASSISTANT_ROOT))

import pytest
from fastapi.testclient import TestClient

# TestClient is sync — fine for Stage 1 tests.
# Stage 2 async tests will use httpx.AsyncClient via pytest-asyncio.

@pytest.fixture(scope="session")
def client():
    """Synchronous FastAPI test client."""
    from src.server import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def sample_events() -> list[dict]:
    """Load all sample events from mocks/sample_events.json."""
    path = Path(__file__).parent.parent / "mocks" / "sample_events.json"
    return json.loads(path.read_text())


@pytest.fixture(scope="session")
def event_by_scenario(sample_events) -> dict[str, dict]:
    """Index sample events by scenario name for easy lookup."""
    return {e["_scenario"]: e for e in sample_events}


def strip_meta(event: dict) -> dict:
    """Remove internal _-prefixed keys before POSTing to the API."""
    return {k: v for k, v in event.items() if not k.startswith("_")}
