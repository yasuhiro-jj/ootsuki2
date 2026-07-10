"""
Conversation quality logging for post-conversation improvement.

This module is intentionally small and side-effect safe: failures while writing
quality logs must never block the customer-facing chat response.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PHONE_RE = re.compile(r"(?<!\d)(?:0\d{1,4}[-ー]?\d{1,4}[-ー]?\d{3,4}|\d{10,11})(?!\d)")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
API_KEY_RE = re.compile(r"\b(?:sk|ntn|rk|pk|ghp)_[A-Za-z0-9_-]{16,}\b")


def mask_sensitive_text(value: Optional[str]) -> str:
    """Mask common PII/secrets before storing conversation quality logs."""
    if not value:
        return ""

    masked = str(value)
    masked = API_KEY_RE.sub("[MASKED_SECRET]", masked)
    masked = EMAIL_RE.sub("[MASKED_EMAIL]", masked)
    masked = PHONE_RE.sub("[MASKED_PHONE]", masked)
    return masked


def anonymize_identifier(value: Optional[str]) -> str:
    """Create a stable anonymous identifier without storing the raw value."""
    if not value:
        return ""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return digest[:16]


def mask_recent_history(history: Optional[List[Dict[str, Any]]], limit: int = 8) -> List[Dict[str, str]]:
    """Return a compact, masked copy of recent chat history."""
    if not history:
        return []

    masked_history: List[Dict[str, str]] = []
    for turn in history[-limit:]:
        role = str(turn.get("role", ""))[:32]
        content = mask_sensitive_text(turn.get("content", ""))[:2000]
        masked_history.append({"role": role, "content": content})
    return masked_history


@dataclass
class ConversationQualityLog:
    conversation_id: str
    session_id: str
    user_id_hash: str
    user_message: str
    ai_response: str
    recent_history: List[Dict[str, str]] = field(default_factory=list)
    active_topic: str = ""
    pending_flow: str = ""
    detected_intent: str = ""
    route: str = ""
    route_reason: str = ""
    node: str = ""
    referenced_sources: Dict[str, Any] = field(default_factory=dict)
    latency_ms: int = 0
    error: str = ""
    channel: str = "web"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    @classmethod
    def from_turn(
        cls,
        *,
        session_id: str,
        user_id: Optional[str],
        user_message: str,
        ai_response: str,
        recent_history: Optional[List[Dict[str, Any]]] = None,
        active_topic: Optional[str] = None,
        pending_flow: Optional[str] = None,
        detected_intent: Optional[str] = None,
        route: Optional[str] = None,
        route_reason: Optional[str] = None,
        node: Optional[str] = None,
        referenced_sources: Optional[Dict[str, Any]] = None,
        latency_ms: int = 0,
        error: Optional[str] = None,
        channel: str = "web",
    ) -> "ConversationQualityLog":
        return cls(
            conversation_id=str(uuid.uuid4()),
            session_id=session_id,
            user_id_hash=anonymize_identifier(user_id or session_id),
            user_message=mask_sensitive_text(user_message)[:4000],
            ai_response=mask_sensitive_text(ai_response)[:8000],
            recent_history=mask_recent_history(recent_history),
            active_topic=active_topic or "",
            pending_flow=pending_flow or "",
            detected_intent=detected_intent or "",
            route=route or "",
            route_reason=route_reason or "",
            node=node or "",
            referenced_sources=referenced_sources or {},
            latency_ms=max(0, int(latency_ms or 0)),
            error=mask_sensitive_text(error)[:2000] if error else "",
            channel=channel,
        )


class ConversationQualityLogger:
    """Append-only JSONL logger used by the improvement workflow MVP."""

    def __init__(self, path: str = "outputs/conversation_quality_logs.jsonl", enabled: bool = True):
        self.path = Path(path)
        self.enabled = enabled

    def save(self, log: ConversationQualityLog) -> bool:
        if not self.enabled:
            return False

        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as fp:
                fp.write(json.dumps(asdict(log), ensure_ascii=False) + "\n")
            return True
        except Exception as exc:
            logger.warning("[ConversationQuality] failed to write log: %s", exc)
            return False

