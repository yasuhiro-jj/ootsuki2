"""Intent and tool planning for the autonomous conversation orchestrator.

Phase 1 uses deterministic planning so tests and local development do not
require an OpenAI API call.  The class boundary is designed so a structured
OpenAI planner can replace or augment these heuristics later.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Tuple

from .conversation_state import ConversationState
from .menu_existence import is_direct_menu_existence_question
from .response_compactness import (
    detect_short_store_faq_key,
    is_cancel_request,
    is_initial_reservation_request,
    is_other_recommendation_request,
    is_party_size_without_context,
    is_reservation_correction,
    is_reservation_followup_request,
    is_short_order_confirmation,
    is_snack_recommendation_request,
)


INTENT_PRODUCT_EXISTENCE = "product_existence"
INTENT_PRODUCT_ORDER = "product_order"
INTENT_ORDER_CHANGE = "order_change"
INTENT_CANCEL = "cancel"
INTENT_RESERVATION = "reservation"
INTENT_STORE_FAQ = "store_faq"
INTENT_RECOMMENDATION = "recommendation"
INTENT_SMALLTALK = "smalltalk"
INTENT_UNKNOWN = "unknown"

TOOL_MENU = "menu_price"
TOOL_STORE_KNOWLEDGE = "store_knowledge"
TOOL_CUSTOMER_MEMORY = "customer_memory"
TOOL_RESERVATION = "reservation_existing"
TOOL_LEGACY_ROUTER = "legacy_router"

FAQ_TERMS = (
    "\u55b6\u696d\u6642\u9593",
    "\u4f55\u6642",
    "\u99d0\u8eca\u5834",
    "\u652f\u6255\u3044",
    "\u30ab\u30fc\u30c9",
    "\u500b\u5ba4",
    "\u5b50\u3069\u3082",
    "\u5b50\u9023\u308c",
    "\u30c6\u30a4\u30af\u30a2\u30a6\u30c8",
)

MENU_PRICE_TERMS = (
    "\u3044\u304f\u3089",
    "\u5024\u6bb5",
    "\u4fa1\u683c",
    "\u6599\u91d1",
    "\u5186",
)

RECOMMEND_TERMS = (
    "\u304a\u3059\u3059\u3081",
    "\u3064\u307e\u307f",
    "\u4f55\u304c\u3044\u3044",
    "\u9078\u3093\u3067",
    "\u8ff7\u3063\u3066",
)

SMALLTALK_TERMS = (
    "\u3053\u3093\u306b\u3061\u306f",
    "\u3053\u3093\u3070\u3093\u306f",
    "\u3042\u308a\u304c\u3068\u3046",
    "\u75b2\u308c\u305f",
    "\u6691\u3044",
    "\u5bd2\u3044",
)

ORDER_CHANGE_TERMS = (
    "\u4e00\u3064\u3067",
    "\u4e00\u500b\u3067",
    "\u4e00\u676f\u3067",
    "\u4e8c\u3064\u3067",
    "\u5909\u3048",
    "\u5909\u66f4",
)

CUSTOMER_MEMORY_TERMS = (
    "\u524d\u56de",
    "\u3044\u3064\u3082\u306e",
    "\u6628\u65e5\u306e\u7d9a\u304d",
    "\u3053\u306e\u524d",
)


@dataclass(frozen=True)
class ConversationPlan:
    intent: str
    topic: str
    required_tools: Tuple[str, ...] = ()
    missing_slots: Tuple[str, ...] = ()
    next_action: str = "fallback"
    confidence: float = 0.0
    reason: str = ""
    fallback_to_legacy: bool = True
    metadata: dict = field(default_factory=dict)


class ConversationPlanner:
    """Classify a turn and choose the information sources it needs."""

    def plan(
        self,
        message: str,
        state: ConversationState,
        *,
        recent_messages: Iterable[str] | None = None,
    ) -> ConversationPlan:
        text = (message or "").strip()
        if not text:
            return ConversationPlan(
                intent=INTENT_UNKNOWN,
                topic=state.active_topic or "unknown",
                required_tools=(TOOL_LEGACY_ROUTER,),
                reason="empty_message",
            )

        if is_cancel_request(text, state.to_memory_updates()) or _contains_any(
            text, ("\u3084\u3063\u3071\u308a\u3084\u3081\u308b", "\u30ad\u30e3\u30f3\u30bb\u30eb")
        ):
            return ConversationPlan(
                intent=INTENT_CANCEL,
                topic="order" if state.order_candidate else state.active_topic,
                required_tools=(TOOL_LEGACY_ROUTER,),
                next_action="cancel_or_fallback",
                confidence=0.86,
                reason="cancel_request",
            )

        if is_reservation_correction(text, state.to_memory_updates()):
            return ConversationPlan(
                intent=INTENT_ORDER_CHANGE,
                topic="reservation",
                required_tools=(TOOL_RESERVATION, TOOL_LEGACY_ROUTER),
                next_action="correct_reservation_context",
                confidence=0.82,
                reason="reservation_correction",
            )

        if (
            is_initial_reservation_request(text, state.to_memory_updates())
            or is_reservation_followup_request(text, state.to_memory_updates())
            or is_party_size_without_context(text, state.to_memory_updates())
            or _contains_any(text, ("\u4e88\u7d04", "\u5bb4\u4f1a", "\u500b\u5ba4", "\u4eba\u306a\u3093\u3060\u3051\u3069"))
        ):
            missing = tuple(state.reservation.missing_core_slots)
            return ConversationPlan(
                intent=INTENT_RESERVATION,
                topic="reservation",
                required_tools=(TOOL_STORE_KNOWLEDGE, TOOL_RESERVATION),
                missing_slots=missing,
                next_action="collect_reservation_slots",
                confidence=0.84,
                reason="reservation_or_banquet",
            )

        if is_direct_menu_existence_question(text):
            return ConversationPlan(
                intent=INTENT_PRODUCT_EXISTENCE,
                topic="menu",
                required_tools=(TOOL_MENU,),
                next_action="lookup_product_availability",
                confidence=0.9,
                reason="direct_menu_existence",
            )

        if _contains_any(text, MENU_PRICE_TERMS):
            return ConversationPlan(
                intent=INTENT_PRODUCT_EXISTENCE,
                topic="menu",
                required_tools=(TOOL_MENU,),
                next_action="lookup_product_price",
                confidence=0.84,
                reason="menu_price_question",
            )

        if is_short_order_confirmation(text, state.to_memory_updates()) or _looks_like_order(
            text, state
        ):
            return ConversationPlan(
                intent=INTENT_PRODUCT_ORDER,
                topic="order",
                required_tools=(TOOL_MENU, TOOL_LEGACY_ROUTER),
                next_action="confirm_or_collect_order",
                confidence=0.78,
                reason="order_followup",
            )

        if state.order_candidate and _contains_any(text, ORDER_CHANGE_TERMS):
            return ConversationPlan(
                intent=INTENT_ORDER_CHANGE,
                topic="order",
                required_tools=(TOOL_MENU, TOOL_LEGACY_ROUTER),
                next_action="update_order_candidate",
                confidence=0.72,
                reason="order_change",
            )

        if detect_short_store_faq_key(text) or _contains_any(text, FAQ_TERMS):
            return ConversationPlan(
                intent=INTENT_STORE_FAQ,
                topic="store_info",
                required_tools=(TOOL_STORE_KNOWLEDGE,),
                next_action="answer_store_faq",
                confidence=0.8,
                reason="store_faq",
            )

        if (
            is_snack_recommendation_request(text)
            or is_other_recommendation_request(text, state.to_memory_updates())
            or _contains_any(text, RECOMMEND_TERMS)
        ):
            return ConversationPlan(
                intent=INTENT_RECOMMENDATION,
                topic="recommendation",
                required_tools=(TOOL_MENU, TOOL_CUSTOMER_MEMORY),
                next_action="recommend_product",
                confidence=0.76,
                reason="recommendation_request",
            )

        if _contains_any(text, CUSTOMER_MEMORY_TERMS):
            return ConversationPlan(
                intent=INTENT_UNKNOWN,
                topic="customer_memory",
                required_tools=(TOOL_CUSTOMER_MEMORY, TOOL_LEGACY_ROUTER),
                next_action="customer_memory_followup_or_fallback",
                confidence=0.66,
                reason="customer_memory_reference",
            )

        if _contains_any(text, SMALLTALK_TERMS):
            return ConversationPlan(
                intent=INTENT_SMALLTALK,
                topic="natural",
                required_tools=(),
                next_action="natural_reply",
                confidence=0.7,
                reason="smalltalk",
            )

        return ConversationPlan(
            intent=INTENT_UNKNOWN,
            topic=state.active_topic or "unknown",
            required_tools=(TOOL_LEGACY_ROUTER,),
            next_action="fallback",
            confidence=0.25,
            reason="unclassified",
        )


def _contains_any(text: str, terms: Iterable[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms)


def _looks_like_order(text: str, state: ConversationState) -> bool:
    if not state.current_product and not state.order_candidate:
        return False
    if re.search(r"\d+\s*(?:\u3064|\u500b|\u676f)", text):
        return True
    return _contains_any(
        text,
        (
            "\u3058\u3083\u3042",
            "\u305d\u308c",
            "\u305d\u308c\u3068",
            "\u540c\u3058\u306e",
            "\u304a\u9858\u3044",
            "\u304f\u3060\u3055\u3044",
        ),
    )
