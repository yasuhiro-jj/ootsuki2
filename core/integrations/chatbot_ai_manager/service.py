"""Passive bridge between chatbot conversation state and AI manager strategy."""

from __future__ import annotations

from typing import List

from .rules import (
    BLOCKED_ASSISTANT_ACTIONS,
    BLOCKED_PENDING_FLOWS,
    find_eligible_product,
)
from .schemas import (
    ConversationSalesContext,
    SalesStrategy,
    SuggestionDecision,
    SuggestionEvent,
)


class ChatbotAIManagerBridge:
    """Evaluate sales strategy without changing chatbot runtime behavior."""

    def __init__(self) -> None:
        self._events: List[SuggestionEvent] = []

    def decide_suggestion(
        self, context: ConversationSalesContext, strategy: SalesStrategy
    ) -> SuggestionDecision:
        if not strategy.active:
            return SuggestionDecision(False, reason="sales strategy is inactive")
        if not strategy.priority_products:
            return SuggestionDecision(False, reason="no priority products")
        if context.suggestion_count >= strategy.max_suggestions_per_session:
            return SuggestionDecision(False, reason="session suggestion limit reached")
        if context.pending_flow in BLOCKED_PENDING_FLOWS:
            return SuggestionDecision(False, reason="pending flow blocks sales suggestion")
        if context.detected_intent in strategy.blocked_intents:
            return SuggestionDecision(False, reason="intent blocks sales suggestion")
        if context.last_assistant_action in BLOCKED_ASSISTANT_ACTIONS:
            return SuggestionDecision(False, reason="last assistant action blocks suggestion")
        if context.question_only and not context.recommendation_requested:
            return SuggestionDecision(False, reason="pure question should be answered only")

        product = find_eligible_product(context, strategy)
        if not product:
            return SuggestionDecision(False, reason="no eligible product matched")

        return SuggestionDecision(
            True,
            product=product,
            reason=product.reason,
            rule="single_safe_priority_product",
            strategy_id=strategy.strategy_id,
        )

    def record_suggestion_result(self, event: SuggestionEvent) -> None:
        self._events.append(event)

    def list_recorded_events(self) -> List[SuggestionEvent]:
        return list(self._events)
