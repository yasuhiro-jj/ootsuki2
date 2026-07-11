"""Chatbot-side bridge for future AI manager sales strategy."""

from .schemas import (
    ConversationSalesContext,
    CustomerMemoryProfile,
    PriorityProduct,
    SalesStrategy,
    SuggestionDecision,
    SuggestionEvent,
)
from .explicit_recommendation import ExplicitSalesRecommendationConnector
from .repository import SalesStrategyRepository
from .service import ChatbotAIManagerBridge
from .strategy_service import (
    SalesStrategyManagementService,
    SalesStrategyValidationError,
)

__all__ = [
    "ChatbotAIManagerBridge",
    "ConversationSalesContext",
    "CustomerMemoryProfile",
    "ExplicitSalesRecommendationConnector",
    "PriorityProduct",
    "SalesStrategy",
    "SalesStrategyManagementService",
    "SalesStrategyRepository",
    "SalesStrategyValidationError",
    "SuggestionDecision",
    "SuggestionEvent",
]
