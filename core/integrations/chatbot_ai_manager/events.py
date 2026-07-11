"""Helpers for recording suggestion outcomes."""

from __future__ import annotations

from typing import Any, Dict

from .schemas import SuggestionEvent


def suggestion_event(
    *,
    session_id: str,
    strategy_id: str,
    product_id: str,
    result: str,
    conversation_id: str = "",
    metadata: Dict[str, Any] | None = None,
) -> SuggestionEvent:
    return SuggestionEvent(
        session_id=session_id,
        strategy_id=strategy_id,
        product_id=product_id,
        result=result,
        conversation_id=conversation_id,
        metadata=metadata or {},
    )

