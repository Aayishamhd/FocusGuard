"""
assistant/src/attention/context_analyzer.py

Extensible context and task-relevance analyzer for the Attention State Engine.
Avoids hardcoding specific application names by using:
1. Category baseline weights
2. Token-based task/window title relevance scoring
3. Extensible rule and pattern registries
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set


class ContextAnalyzer:
    """
    Evaluates whether an active application and window context aligns with
    the user's stated task and productive workflow.
    """

    DEFAULT_CATEGORY_WEIGHTS: Dict[str, float] = {
        "work": 1.0,
        "utility": 0.9,
        "communication": 0.5,  # Contextual: could be standup or chat distraction
        "unknown": 0.5,        # Neutral uncertainty
        "entertainment": 0.0,  # Divergent from focus
    }

    # Common generic leisure/entertainment patterns in window titles
    DEFAULT_LEISURE_PATTERNS: List[re.Pattern] = [
        re.compile(r"\b(youtube|netflix|twitch|tiktok|instagram|reddit|twitter|facebook|hulu|disney\+)\b", re.IGNORECASE),
        re.compile(r"\b(shorts|reels|gameplay|stream|trending|funny|meme|feed)\b", re.IGNORECASE),
    ]

    # Common development & productive reference patterns
    DEFAULT_PRODUCTIVE_PATTERNS: List[re.Pattern] = [
        re.compile(r"\b(doc|docs|documentation|api|github|gitlab|stackoverflow|arxiv|tutorial|guide)\b", re.IGNORECASE),
        re.compile(r"\b(terminal|bash|powershell|cmd|zsh|git|console|ide|editor|debug|build)\b", re.IGNORECASE),
    ]

    def __init__(
        self,
        category_weights: Optional[Dict[str, float]] = None,
        custom_leisure_patterns: Optional[List[re.Pattern]] = None,
        custom_productive_patterns: Optional[List[re.Pattern]] = None,
    ) -> None:
        self.category_weights = category_weights or dict(self.DEFAULT_CATEGORY_WEIGHTS)
        self.leisure_patterns = list(self.DEFAULT_LEISURE_PATTERNS)
        if custom_leisure_patterns:
            self.leisure_patterns.extend(custom_leisure_patterns)

        self.productive_patterns = list(self.DEFAULT_PRODUCTIVE_PATTERNS)
        if custom_productive_patterns:
            self.productive_patterns.extend(custom_productive_patterns)

    def extract_keywords(self, text: str) -> Set[str]:
        """Extract clean alphanumeric keywords with length >= 3."""
        if not text:
            return set()
        words = re.findall(r"[a-zA-Z0-9_-]{3,}", text.lower())
        # Filter common stopwords
        stopwords = {
            "the", "and", "for", "with", "from", "that", "this", "app",
            "page", "window", "tab", "com", "org", "net", "http", "https"
        }
        return {w for w in words if w not in stopwords}

    def compute_task_relevance(
        self,
        current_task: Optional[str],
        app_name: str,
        window_title: str,
        category: str,
    ) -> float:
        """
        Calculates context relevance score R in [0.0, 1.0].
        
        If current_task is None, falls back to category and window patterns.
        """
        base_weight = self.category_weights.get(category, 0.5)

        # Check explicit leisure patterns in title or app
        combined_text = f"{app_name} {window_title}".lower()
        for pattern in self.leisure_patterns:
            if pattern.search(combined_text):
                # Strong leisure indicator overrides general categories
                return 0.10

        # Check explicit productive documentation / tool patterns
        for pattern in self.productive_patterns:
            if pattern.search(combined_text):
                base_weight = max(base_weight, 0.85)

        if not current_task or not current_task.strip():
            # No task provided: rely on category and title heuristics
            return base_weight

        # When current_task is present, compute lexical similarity
        task_words = self.extract_keywords(current_task)
        title_words = self.extract_keywords(combined_text)

        if not task_words:
            return base_weight

        overlap = task_words.intersection(title_words)
        if overlap:
            # Task keywords directly observed in window title
            overlap_ratio = len(overlap) / min(len(task_words), 4)
            relevance = min(1.0, base_weight * 0.5 + overlap_ratio * 0.5 + 0.3)
            return relevance

        # If window title explicitly matches documentation / developer reference patterns,
        # preserve high relevance even if the task title lacks those specific words
        is_productive_pattern = any(p.search(combined_text) for p in self.productive_patterns)
        if is_productive_pattern:
            return max(base_weight, 0.85)

        # If category is work, maintain solid baseline even if title differs
        if category == "work":
            return max(base_weight * 0.8, 0.70)
        elif category == "utility":
            return 0.55
        elif category == "unknown":
            return 0.35

        return base_weight

    def is_productive_switch(
        self,
        from_category: Optional[str],
        to_category: str,
        to_title: str,
    ) -> bool:
        """
        Determines if switching from one window to another is a natural,
        productive context shift (e.g. IDE to Terminal or Docs).
        """
        # Switching to a documentation / reference / dev tool window is always productive
        for pattern in self.productive_patterns:
            if pattern.search(to_title):
                return True

        # Switching between two work applications (e.g. IDE <-> Code tool)
        if from_category == "work" and to_category == "work":
            return True

        return False
