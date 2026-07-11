"""Chatbot-side bridge for future AI manager sales strategy."""

from .schemas import (
    ConversationSalesContext,
    CustomerMemoryProfile,
    PriorityProduct,
    SalesStrategy,
    SuggestionDecision,
    SuggestionEvent,
)
from .service import ChatbotAIManagerBridge

__all__ = [
    "ChatbotAIManagerBridge",
    "ConversationSalesContext",
    "CustomerMemoryProfile",
    "PriorityProduct",
    "SalesStrategy",
    "SuggestionDecision",
    "SuggestionEvent",
]
