"""Limited connector for explicit recommendation requests only."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .events import suggestion_event
from .schemas import ConversationSalesContext, PriorityProduct, SuggestionEvent
from .service import ChatbotAIManagerBridge
from .strategy_service import SalesStrategyManagementService

logger = logging.getLogger(__name__)

SKIP_NOT_RECOMMENDATION_REQUEST = "not_recommendation_request"
SKIP_NO_ACTIVE_STRATEGY = "no_active_strategy"
SKIP_NO_CANDIDATE = "no_candidate"
SKIP_SESSION_LIMIT_REACHED = "session_limit_reached"
SKIP_PRODUCT_DECLINED = "product_declined"
SKIP_PRODUCT_AVOIDED = "product_avoided"
SKIP_NOT_RELEVANT = "not_relevant"
SKIP_ORDER_CONFIRMATION = "order_confirmation"
SKIP_INTEGRATION_ERROR = "integration_error"

BLOCKED_ROUTES = frozenset({"natural", "latest", "empty"})
BLOCKED_PENDING_FLOWS = frozenset({"reservation", "banquet", "order", "takeout"})
BLOCKED_ASSISTANT_ACTIONS = frozenset(
    {"confirmed_order_item", "answered_product_existence"}
)
SHORT_FALLBACK_PRODUCT_ID = "262e9a7e-e5b7-81d6-980b-eca518b63e27"
SHORT_FALLBACK_PRODUCT_NAME = "刺身定食"
SHORT_FALLBACK_MESSAGE = (
    "今日は刺身定食がおすすめです。\n"
    "新鮮なお刺身を楽しみたい方に人気ですよ。"
)
REPEATED_SHORT_FALLBACK_MESSAGE = "先ほどご案内した刺身定食がおすすめです。"


@dataclass(frozen=True)
class ExplicitRecommendationResult:
    message: str = ""
    skip_reason: str = ""
    selected_product_id: str = ""
    strategy_id: str = ""
    memory_updates: Dict[str, Any] | None = None
    event: Optional[SuggestionEvent] = None

    @property
    def has_message(self) -> bool:
        return bool(self.message)


class ExplicitSalesRecommendationConnector:
    def __init__(
        self,
        strategy_service: SalesStrategyManagementService,
        bridge: ChatbotAIManagerBridge,
    ) -> None:
        self.strategy_service = strategy_service
        self.bridge = bridge

    def try_recommend(
        self,
        *,
        session_id: str,
        user_message: str,
        intent_value: str,
        route_kind: str,
        session_memory: Dict[str, Any],
    ) -> ExplicitRecommendationResult:
        if not self._is_recommendation_request(intent_value, route_kind, session_memory):
            return self._skipped(session_id, SKIP_NOT_RECOMMENDATION_REQUEST)

        if self._is_order_confirmation_context(session_memory):
            return self._skipped(session_id, SKIP_ORDER_CONFIRMATION)

        try:
            strategy = self.strategy_service.get_current()
        except Exception as exc:
            logger.warning("[SalesStrategy] get_current failed: %s", exc)
            return self._short_fallback(
                session_id,
                SKIP_INTEGRATION_ERROR,
                session_memory=session_memory,
            )

        if not strategy:
            return self._short_fallback(
                session_id,
                SKIP_NO_ACTIVE_STRATEGY,
                session_memory=session_memory,
            )

        context = self._build_context(
            session_id=session_id,
            user_message=user_message,
            intent_value=intent_value,
            session_memory=session_memory,
        )
        decision = self.bridge.decide_suggestion(context, strategy)
        if not decision.allowed or not decision.product:
            skip_reason = self._skip_reason_from_decision(
                decision.reason, strategy, context
            )
            if skip_reason == SKIP_SESSION_LIMIT_REACHED:
                return self._repeated_recommendation(
                    session_id=session_id,
                    strategy=strategy,
                    context=context,
                )
            return self._skipped(session_id, skip_reason, strategy_id=strategy.strategy_id)

        message = self._render_customer_message(decision.product, context)
        event = suggestion_event(
            session_id=session_id,
            strategy_id=strategy.strategy_id,
            product_id=decision.product.product_id,
            result="suggestion_shown",
            metadata={
                "selected_product_id": decision.product.product_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        self.bridge.record_suggestion_result(event)

        suggested_product_ids = list(context.proposed_items)
        suggested_product_ids.append(decision.product.product_id)
        memory_updates = {
            "active_topic": "recommendation",
            "detected_intent": "product_recommendation",
            "current_entity": decision.product.name,
            "last_recommended_item": decision.product.name,
            "suggestion_count": context.suggestion_count + 1,
            "suggested_product_ids": suggested_product_ids,
            "last_suggestion_at": datetime.now(timezone.utc).isoformat(),
            "last_suggestion_product_id": decision.product.product_id,
            "last_assistant_action": "sales_strategy_recommendation",
        }
        return ExplicitRecommendationResult(
            message=message,
            selected_product_id=decision.product.product_id,
            strategy_id=strategy.strategy_id,
            memory_updates=memory_updates,
            event=event,
        )

    def _is_recommendation_request(
        self, intent_value: str, route_kind: str, session_memory: Dict[str, Any]
    ) -> bool:
        if intent_value != "proposal":
            return False
        if route_kind in BLOCKED_ROUTES:
            return False
        if session_memory.get("pending_flow") in BLOCKED_PENDING_FLOWS:
            return False
        return True

    def _is_order_confirmation_context(self, session_memory: Dict[str, Any]) -> bool:
        if session_memory.get("pending_flow") == "order":
            return True
        if session_memory.get("last_assistant_action") in BLOCKED_ASSISTANT_ACTIONS:
            return True
        return False

    def _build_context(
        self,
        *,
        session_id: str,
        user_message: str,
        intent_value: str,
        session_memory: Dict[str, Any],
    ) -> ConversationSalesContext:
        return ConversationSalesContext(
            session_id=session_id,
            message=user_message,
            detected_intent="product_recommendation",
            active_topic=str(session_memory.get("active_topic") or "recommendation"),
            current_entity=str(session_memory.get("current_entity") or ""),
            pending_flow=str(session_memory.get("pending_flow") or ""),
            last_assistant_action=str(session_memory.get("last_assistant_action") or ""),
            suggestion_count=int(session_memory.get("suggestion_count") or 0),
            proposed_items=tuple(session_memory.get("suggested_product_ids") or ()),
            declined_products=tuple(session_memory.get("declined_product_ids") or ()),
            ordered_items=tuple(session_memory.get("ordered_items") or ()),
            avoided_items=tuple(session_memory.get("avoided_items") or ()),
            recommendation_requested=intent_value == "proposal",
            question_only=False,
        )

    def _render_customer_message(
        self, product: PriorityProduct, context: ConversationSalesContext
    ) -> str:
        if context.current_entity:
            return f"{context.current_entity}でしたら、{product.name}がよく合います。"
        return f"{product.name}がおすすめです。"

    def _skip_reason_from_decision(
        self, reason: str, strategy, context: ConversationSalesContext
    ) -> str:
        if "limit" in reason:
            return SKIP_SESSION_LIMIT_REACHED
        declined = {self._key(item) for item in context.declined_products}
        avoided = {self._key(item) for item in context.avoided_items}
        for product in strategy.priority_products:
            product_keys = {self._key(product.product_id), self._key(product.name)}
            if product_keys & declined:
                return SKIP_PRODUCT_DECLINED
            if product_keys & avoided:
                return SKIP_PRODUCT_AVOIDED
        if "declined" in reason:
            return SKIP_PRODUCT_DECLINED
        if "avoided" in reason:
            return SKIP_PRODUCT_AVOIDED
        if "eligible" in reason:
            return SKIP_NOT_RELEVANT
        return SKIP_NOT_RELEVANT

    def _key(self, value: str) -> str:
        return str(value or "").strip().lower()

    def _short_fallback(
        self,
        session_id: str,
        skip_reason: str,
        *,
        session_memory: Dict[str, Any],
    ) -> ExplicitRecommendationResult:
        skipped = self._skipped(session_id, skip_reason)
        repeated = session_memory.get("last_assistant_action") in {
            "short_recommendation_fallback",
            "repeated_short_recommendation_fallback",
        }
        memory_updates = {
            "active_topic": "recommendation",
            "detected_intent": "product_recommendation",
            "current_entity": SHORT_FALLBACK_PRODUCT_NAME,
            "last_recommended_item": SHORT_FALLBACK_PRODUCT_NAME,
            "last_assistant_action": (
                "repeated_short_recommendation_fallback"
                if repeated
                else "short_recommendation_fallback"
            ),
        }
        return ExplicitRecommendationResult(
            message=(
                REPEATED_SHORT_FALLBACK_MESSAGE if repeated else SHORT_FALLBACK_MESSAGE
            ),
            skip_reason=skip_reason,
            selected_product_id=SHORT_FALLBACK_PRODUCT_ID,
            memory_updates=memory_updates,
            event=skipped.event,
        )

    def _repeated_recommendation(
        self,
        *,
        session_id: str,
        strategy: SalesStrategy,
        context: ConversationSalesContext,
    ) -> ExplicitRecommendationResult:
        skipped = self._skipped(
            session_id,
            SKIP_SESSION_LIMIT_REACHED,
            strategy_id=strategy.strategy_id,
        )
        product_name = self._previous_product_name(strategy, context)
        memory_updates = {
            "active_topic": "recommendation",
            "detected_intent": "product_recommendation",
            "current_entity": product_name,
            "last_recommended_item": product_name,
            "suggestion_count": context.suggestion_count,
            "suggested_product_ids": list(context.proposed_items),
            "last_assistant_action": "repeated_recommendation_limit",
        }
        return ExplicitRecommendationResult(
            message=f"先ほどご案内した{product_name}がおすすめです。",
            skip_reason=SKIP_SESSION_LIMIT_REACHED,
            selected_product_id=(context.proposed_items[-1] if context.proposed_items else ""),
            strategy_id=strategy.strategy_id,
            memory_updates=memory_updates,
            event=skipped.event,
        )

    def _previous_product_name(
        self, strategy: SalesStrategy, context: ConversationSalesContext
    ) -> str:
        previous_product_id = context.proposed_items[-1] if context.proposed_items else ""
        for product in strategy.priority_products:
            if product.product_id == previous_product_id:
                return product.name
        return SHORT_FALLBACK_PRODUCT_NAME

    def _skipped(
        self, session_id: str, skip_reason: str, strategy_id: str = ""
    ) -> ExplicitRecommendationResult:
        event = suggestion_event(
            session_id=session_id,
            strategy_id=strategy_id,
            product_id="",
            result="suggestion_skipped",
            metadata={
                "skip_reason": skip_reason,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        self.bridge.record_suggestion_result(event)
        return ExplicitRecommendationResult(skip_reason=skip_reason, event=event)
