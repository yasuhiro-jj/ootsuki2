"""Chatbot-side bridge for future AI manager sales strategy."""

from .schemas import (
    ConversationSalesContext,
    CustomerMemoryProfile,
    PriorityProduct,
    SalesStrategy,
    SuggestionDecision,
    SuggestionEvent,
)
from .composite_repository import CompositeSalesStrategyRepository
from .explicit_recommendation import ExplicitSalesRecommendationConnector
from .repository import SalesStrategyRepository
from .supabase_repository import SupabaseSalesStrategyRepository
from .recommendation_settings import (
    RecommendationSettings,
    RecommendationSettingsRepository,
    RecommendationSettingsService,
    RecommendationSettingsValidationError,
)
from .service import ChatbotAIManagerBridge
from .strategy_service import (
    SalesStrategyManagementService,
    SalesStrategyValidationError,
)

__all__ = [
    "ChatbotAIManagerBridge",
    "CompositeSalesStrategyRepository",
    "ConversationSalesContext",
    "CustomerMemoryProfile",
    "ExplicitSalesRecommendationConnector",
    "PriorityProduct",
    "RecommendationSettings",
    "RecommendationSettingsRepository",
    "RecommendationSettingsService",
    "RecommendationSettingsValidationError",
    "SalesStrategy",
    "SalesStrategyManagementService",
    "SalesStrategyRepository",
    "SalesStrategyValidationError",
    "SuggestionDecision",
    "SuggestionEvent",
    "SupabaseSalesStrategyRepository",
]
