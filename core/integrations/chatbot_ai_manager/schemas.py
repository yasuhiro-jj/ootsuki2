"""Shared schemas for chatbot and AI manager sales strategy integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional, Tuple
from uuid import uuid4


def _as_tuple(values: Optional[Iterable[str]]) -> Tuple[str, ...]:
    if not values:
        return ()
    return tuple(str(value) for value in values if str(value).strip())


@dataclass(frozen=True)
class PriorityProduct:
    product_id: str
    name: str
    priority_score: int = 0
    reason: str = ""
    suggest_when: Tuple[str, ...] = ()
    max_suggestions: int = 1
    inventory_priority: Optional[str] = None
    gross_margin_rank: Optional[int] = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "suggest_when", _as_tuple(self.suggest_when))


@dataclass(frozen=True)
class SalesStrategy:
    strategy_id: str
    priority_products: Tuple[PriorityProduct, ...] = ()
    sales_goal: str = ""
    active: bool = True
    max_suggestions_per_session: int = 1
    allowed_topics: Tuple[str, ...] = (
        "product_recommendation",
        "menu_search",
        "food_pairing",
        "order_followup",
    )
    blocked_intents: Tuple[str, ...] = (
        "allergy_inquiry",
        "banquet_inquiry",
        "business_hours",
        "facility_inquiry",
        "general_chat",
        "product_existence",
        "product_order",
        "product_price",
        "reservation",
    )
    generated_by: str = "manual"

    def __post_init__(self) -> None:
        object.__setattr__(self, "priority_products", tuple(self.priority_products))
        object.__setattr__(self, "allowed_topics", _as_tuple(self.allowed_topics))
        object.__setattr__(self, "blocked_intents", _as_tuple(self.blocked_intents))


@dataclass(frozen=True)
class ConversationSalesContext:
    session_id: str
    conversation_id: str = ""
    customer_profile_id: str = ""
    message: str = ""
    detected_intent: str = ""
    active_topic: str = ""
    current_entity: str = ""
    pending_flow: str = ""
    order_intent_level: str = ""
    last_assistant_action: str = ""
    suggestion_count: int = 0
    proposed_items: Tuple[str, ...] = ()
    declined_products: Tuple[str, ...] = ()
    ordered_items: Tuple[str, ...] = ()
    preference_tags: Tuple[str, ...] = ()
    favorite_items: Tuple[str, ...] = ()
    avoided_items: Tuple[str, ...] = ()
    last_ordered_items: Tuple[str, ...] = ()
    recommendation_requested: bool = False
    list_requested: bool = False
    question_only: bool = True
    time_slot: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "proposed_items", _as_tuple(self.proposed_items))
        object.__setattr__(self, "declined_products", _as_tuple(self.declined_products))
        object.__setattr__(self, "ordered_items", _as_tuple(self.ordered_items))
        object.__setattr__(self, "preference_tags", _as_tuple(self.preference_tags))
        object.__setattr__(self, "favorite_items", _as_tuple(self.favorite_items))
        object.__setattr__(self, "avoided_items", _as_tuple(self.avoided_items))
        object.__setattr__(self, "last_ordered_items", _as_tuple(self.last_ordered_items))


@dataclass(frozen=True)
class CustomerMemoryProfile:
    customer_profile_id: str
    anonymous_customer_id: str = ""
    consent_status: str = "unknown"
    preference_tags: Tuple[str, ...] = ()
    favorite_items: Tuple[str, ...] = ()
    avoided_items: Tuple[str, ...] = ()
    last_ordered_items: Tuple[str, ...] = ()
    declined_products: Tuple[str, ...] = ()
    visit_count: int = 0
    last_visit_at: str = ""
    communication_notes: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "preference_tags", _as_tuple(self.preference_tags))
        object.__setattr__(self, "favorite_items", _as_tuple(self.favorite_items))
        object.__setattr__(self, "avoided_items", _as_tuple(self.avoided_items))
        object.__setattr__(self, "last_ordered_items", _as_tuple(self.last_ordered_items))
        object.__setattr__(self, "declined_products", _as_tuple(self.declined_products))


@dataclass(frozen=True)
class SuggestionDecision:
    allowed: bool
    product: Optional[PriorityProduct] = None
    reason: str = ""
    rule: str = ""
    strategy_id: Optional[str] = None


@dataclass(frozen=True)
class SuggestionEvent:
    session_id: str
    strategy_id: str
    product_id: str
    result: str
    event_id: str = field(default_factory=lambda: str(uuid4()))
    conversation_id: str = ""
    occurred_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metadata: Dict[str, Any] = field(default_factory=dict)
