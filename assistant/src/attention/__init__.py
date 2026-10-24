"""
assistant/src/attention/__init__.py

Modular Attention State Engine and Context Analyzer package for FocusGuard.
"""

from .context_analyzer import ContextAnalyzer
from .reason_codes import AttentionReasonCode
from .state_engine import AttentionAssessment, AttentionStateEngine

__all__ = [
    "ContextAnalyzer",
    "AttentionReasonCode",
    "AttentionAssessment",
    "AttentionStateEngine",
]
