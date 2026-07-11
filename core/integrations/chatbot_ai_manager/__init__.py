"""Chatbot-side bridge for future AI manager sales strategy."""

from .schemas import (
    ConversationSalesContext,
    PriorityProduct,
    SalesStrategy,
    SuggestionDecision,
    SuggestionEvent,
)
from .service import ChatbotAIManagerBridge

__all__ = [
    "ChatbotAIManagerBridge",
    "ConversationSalesContext",
    "PriorityProduct",
    "SalesStrategy",
    "SuggestionDecision",
    "SuggestionEvent",
]

