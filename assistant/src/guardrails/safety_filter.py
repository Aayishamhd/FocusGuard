"""Safety filter for ensuring human-centered, supportive, non-stigmatizing AI language."""

import logging
import re
from typing import List, Optional, Pattern

logger = logging.getLogger("focusguard.assistant.safety")

# Patterns prohibited by AI for Humanity principles and FocusGuard specifications
UNSAFE_PATTERNS: List[Pattern] = [
    # Shaming and guilt-tripping language
    re.compile(r"\b(?:you\s+are|you're)\s+(?:being\s+)?(?:lazy|slacking|procrastinating|a\s+failure|useless|pathetic|hopeless|worthless)\b", re.I),
    re.compile(r"\b(?:wasting|wasted)\s+(?:your\s+)?(?:precious\s+)?time\b", re.I),
    re.compile(r"\b(?:stop\s+being\s+lazy|shame\s+on\s+you|get\s+it\s+together)\b", re.I),
    re.compile(r"\byou\s+(?:should|must)\s+feel\s+(?:guilty|ashamed|bad)\b", re.I),

    # Unsupported psychological and medical diagnoses
    re.compile(r"\b(?:adhd|attention\s+deficit|depression|clinical\s+depression|bipolar|schizophreni|neurotic)\b", re.I),
    re.compile(r"\b(?:mental\s+illness|mental\s+disorder|psychiatric\s+disorder|medical\s+condition|diagnosis)\b", re.I),

    # Unobservable emotional assertions
    re.compile(r"\byou\s+(?:are\s+feeling|feel)\s+(?:hopeless|depressed|miserable|worthless|failing)\b", re.I),

    # Potential command or code injection
    re.compile(r"\b(?:rm\s+-rf|cmd\.exe|powershell\.exe|sudo\s+|bash\s+-c|<script|javascript:)\b", re.I),
]


def is_text_safe(text: str) -> bool:
    """Return True if text contains no shaming, diagnostic, or unsafe patterns."""
    if not text:
        return True
    for pattern in UNSAFE_PATTERNS:
        if pattern.search(text):
            return False
    return True


def sanitize_user_facing_text(text: Optional[str], default_fallback: str) -> str:
    """
    Validate user-facing text against safety guardrails.
    Replaces unsafe text with a trusted, respectful fallback string.
    """
    if not text:
        return default_fallback
    if not is_text_safe(text):
        logger.warning("Unsafe content detected in model output: '%s'. Replacing with safe fallback.", text[:80])
        return default_fallback
    return text.strip()
