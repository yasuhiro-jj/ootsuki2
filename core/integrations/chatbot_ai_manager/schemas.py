"""Shared schemas for chatbot and AI manager sales strategy integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional, Tuple
from uuid import uuid4


# AI Manager の自動戦略が付ける商品区分。文字列は AI Manager 側の生成ロジックと一致させる。
SEGMENT_SIGNATURE = "看板"
SEGMENT_GROWTH = "育成"
SEGMENT_BEST_SELLER = "売れ筋"
SEGMENT_HIGH_MARGIN = "高粗利"


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
    trigger_item_ids: Tuple[str, ...] = ()
    excluded_intents: Tuple[str, ...] = ()
    max_suggestions: int = 1
    inventory_priority: Optional[str] = None
    gross_margin_rank: Optional[int] = None
    # AI Manager の自動戦略が付与する順位情報。手動戦略では None のままになる。
    sales_qty_rank: Optional[int] = None
    candidate_count: Optional[int] = None
    segment: Optional[str] = None
    # お客様向けに表示してよい一文。粗利・原価・数値を含めない（AI Manager 側で検証する）。
    customer_reason: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "suggest_when", _as_tuple(self.suggest_when))
        object.__setattr__(self, "trigger_item_ids", _as_tuple(self.trigger_item_ids))
        object.__setattr__(self, "excluded_intents", _as_tuple(self.excluded_intents))


def _optional_int(value: Any) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def product_from_payload(data: Dict[str, Any]) -> PriorityProduct:
    """Build a PriorityProduct from stored JSON / API payload.

    repository.py と strategy_service.py の双方から使う。片方だけ新しい項目に
    対応して食い違うのを防ぐため、変換はここに集約する。
    """

    return PriorityProduct(
        product_id=str(data.get("product_id", "")),
        name=str(data.get("name") or data.get("product_name") or ""),
        priority_score=int(data.get("priority_score", data.get("priority", 0)) or 0),
        reason=str(data.get("reason", "")),
        suggest_when=tuple(data.get("suggest_when", ()) or ()),
        trigger_item_ids=tuple(data.get("trigger_item_ids", ()) or ()),
        excluded_intents=tuple(data.get("excluded_intents", ()) or ()),
        max_suggestions=int(data.get("max_suggestions", 1) or 1),
        inventory_priority=data.get("inventory_priority"),
        gross_margin_rank=_optional_int(data.get("gross_margin_rank")),
        sales_qty_rank=_optional_int(data.get("sales_qty_rank")),
        candidate_count=_optional_int(data.get("candidate_count")),
        segment=(str(data["segment"]) if data.get("segment") else None),
        customer_reason=str(data.get("customer_reason", "")),
    )


@dataclass(frozen=True)
class SalesStrategy:
    strategy_id: str
    name: str = ""
    priority_products: Tuple[PriorityProduct, ...] = ()
    sales_goal: str = ""
    active: bool = True
    valid_from: str = ""
    valid_until: str = ""
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
    created_at: str = ""
    updated_at: str = ""

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
    last_recommended_items: Tuple[str, ...] = ()
    recommendation_history: Tuple[str, ...] = ()
    customer_memory_declined_products: Tuple[str, ...] = ()
    order_cancelled_items: Tuple[str, ...] = ()
    order_counts_by_product: Dict[str, int] = field(default_factory=dict)
    customer_memory_available: bool = False
    customer_memory_consent_status: str = "unknown"
    different_from_previous_requested: bool = False
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
    last_recommended_items: Tuple[str, ...] = ()
    recommendation_history: Tuple[str, ...] = ()
    declined_products: Tuple[str, ...] = ()
    visit_count: int = 0
    last_visit_at: str = ""
    last_ordered_at: str = ""
    last_recommended_at: str = ""
    memory_updated_at: str = ""
    communication_notes: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "preference_tags", _as_tuple(self.preference_tags))
        object.__setattr__(self, "favorite_items", _as_tuple(self.favorite_items))
        object.__setattr__(self, "avoided_items", _as_tuple(self.avoided_items))
        object.__setattr__(self, "last_ordered_items", _as_tuple(self.last_ordered_items))
        object.__setattr__(self, "last_recommended_items", _as_tuple(self.last_recommended_items))
        object.__setattr__(self, "recommendation_history", _as_tuple(self.recommendation_history))
        object.__setattr__(self, "declined_products", _as_tuple(self.declined_products))


@dataclass(frozen=True)
class SuggestionDecision:
    allowed: bool
    product: Optional[PriorityProduct] = None
    reason: str = ""
    rule: str = ""
    strategy_id: Optional[str] = None
    final_score: int = 0
    memory_adjustments: Tuple[str, ...] = ()
    used_customer_memory: bool = False


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
