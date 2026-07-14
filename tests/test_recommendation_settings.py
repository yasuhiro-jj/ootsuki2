import os
import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from core.customer_memory import (
    EVENT_ORDER_CONFIRMED,
    EVENT_RECOMMENDATION_DECLINED,
    EVENT_RECOMMENDATION_SHOWN,
    CustomerMemoryRepository,
)
from core.integrations.chatbot_ai_manager.recommendation_settings import (
    RecommendationSettingsRepository,
    RecommendationSettingsService,
    RecommendationSettingsValidationError,
)
from core.integrations.chatbot_ai_manager.repository import SalesStrategyRepository
from core.integrations.chatbot_ai_manager.schemas import (
    ConversationSalesContext,
    PriorityProduct,
    SalesStrategy,
)
from core.integrations.chatbot_ai_manager.service import ChatbotAIManagerBridge
from core.integrations.chatbot_ai_manager.strategy_service import (
    SalesStrategyManagementService,
)
from core.security.admin_auth import ADMIN_API_KEY_ENV, require_admin_api_key


def make_strategy(*products):
    return SalesStrategy(
        strategy_id="strategy_settings",
        name="Settings strategy",
        active=True,
        valid_from="2026-07-14T17:00:00+09:00",
        valid_until="2026-07-14T21:00:00+09:00",
        max_suggestions_per_session=2,
        priority_products=products
        or (
            PriorityProduct(
                product_id="low",
                name="Low product",
                priority_score=70,
                suggest_when=("product_recommendation",),
            ),
            PriorityProduct(
                product_id="high",
                name="High product",
                priority_score=80,
                suggest_when=("product_recommendation",),
            ),
        ),
    )


class BrokenRecommendationSettingsService:
    def get_effective(self, strategy_id):
        raise RuntimeError("settings backend failed")


class RecommendationSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings_path = Path(self.temp_dir.name) / "recommendation_settings.json"
        self.strategy_path = Path(self.temp_dir.name) / "sales_strategies.json"
        self.settings_repository = RecommendationSettingsRepository(self.settings_path)
        self.strategy_repository = SalesStrategyRepository(self.strategy_path)
        self.strategy_service = SalesStrategyManagementService(self.strategy_repository)
        self.settings_service = RecommendationSettingsService(
            self.settings_repository,
            strategy_repository=self.strategy_repository,
        )
        self.strategy_repository.save(make_strategy())

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_default_settings(self):
        settings = self.settings_service.get_effective("strategy_settings")

        self.assertEqual(settings.strategy_id, "strategy_settings")
        self.assertEqual(settings.weights.topic_relevance, 8)
        self.assertTrue(settings.rules.exclude_declined_products)
        self.assertTrue(settings.rules.exclude_already_suggested_in_session)

    def test_save_strategy_settings_and_audit_history(self):
        settings = self.settings_service.update(
            "strategy_settings",
            {
                "strategy_priority": 12,
                "product_priorities": {"low": 25},
                "weights": {"topic_relevance": 18},
            },
        )
        response = self.settings_service.get_response("strategy_settings")

        self.assertEqual(settings.strategy_priority, 12)
        self.assertEqual(settings.product_priorities["low"], 25)
        self.assertEqual(settings.weights.topic_relevance, 18)
        self.assertEqual(len(response["audit_history"]), 1)
        self.assertEqual(response["audit_history"][0]["updated_by"], "admin_api")

    def test_rejects_missing_strategy_id(self):
        with self.assertRaises(KeyError):
            self.settings_service.update(
                "missing_strategy",
                {"strategy_priority": 10},
            )

    def test_rejects_invalid_weight_values(self):
        invalid_payloads = [
            {"strategy_priority": 101},
            {"weights": {"repeat_count_unit": -1}},
            {"weights": {"topic_relevance": "NaN"}},
            {"rules": {"exclude_declined_products": False}},
            {"rules": {"exclude_already_suggested_in_session": False}},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(RecommendationSettingsValidationError):
                    self.settings_service.update("strategy_settings", payload)

    def test_product_priority_changes_selected_candidate(self):
        self.settings_service.update(
            "strategy_settings",
            {"product_priorities": {"low": 30}},
        )
        bridge = ChatbotAIManagerBridge(self.settings_service)

        decision = bridge.decide_suggestion(
            ConversationSalesContext(
                session_id="s1",
                detected_intent="product_recommendation",
                recommendation_requested=True,
                question_only=False,
            ),
            make_strategy(),
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.product.product_id, "low")

    def test_declined_product_remains_excluded_with_settings(self):
        self.settings_service.update(
            "strategy_settings",
            {"product_priorities": {"high": 100}},
        )
        bridge = ChatbotAIManagerBridge(self.settings_service)

        decision = bridge.decide_suggestion(
            ConversationSalesContext(
                session_id="s1",
                detected_intent="product_recommendation",
                recommendation_requested=True,
                question_only=False,
                declined_products=("high",),
            ),
            make_strategy(),
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.product.product_id, "low")

    def test_session_repeat_remains_excluded_with_settings(self):
        self.settings_service.update(
            "strategy_settings",
            {"product_priorities": {"high": 100}},
        )
        bridge = ChatbotAIManagerBridge(self.settings_service)

        decision = bridge.decide_suggestion(
            ConversationSalesContext(
                session_id="s1",
                detected_intent="product_recommendation",
                recommendation_requested=True,
                question_only=False,
                proposed_items=("high",),
            ),
            make_strategy(),
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.product.product_id, "low")

    def test_settings_failure_falls_back_to_default_scoring(self):
        bridge = ChatbotAIManagerBridge(BrokenRecommendationSettingsService())

        decision = bridge.decide_suggestion(
            ConversationSalesContext(
                session_id="s1",
                detected_intent="product_recommendation",
                recommendation_requested=True,
                question_only=False,
            ),
            make_strategy(),
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.product.product_id, "high")

    def test_invalid_stored_settings_fall_back_to_defaults(self):
        self.settings_path.write_text(
            json.dumps(
                {
                    "settings": {
                        "strategy_settings": {
                            "strategy_id": "strategy_settings",
                            "weights": {"topic_relevance": 999},
                        }
                    },
                    "audit_history": [],
                }
            ),
            encoding="utf-8",
        )

        settings = self.settings_service.get_effective("strategy_settings")

        self.assertEqual(settings.weights.topic_relevance, 8)

    def test_performance_numbers_are_not_changed_by_settings(self):
        memory_path = Path(self.temp_dir.name) / "profiles.json"
        memory_repository = CustomerMemoryRepository(memory_path)
        profile = memory_repository.identify(consent_accepted=True)
        memory_repository.record_event(
            event_type=EVENT_RECOMMENDATION_SHOWN,
            anonymous_customer_id=profile.anonymous_customer_id,
            session_id="s1",
            product_id="high",
            product_name="High product",
            strategy_id="strategy_settings",
        )
        memory_repository.record_event(
            event_type=EVENT_ORDER_CONFIRMED,
            anonymous_customer_id=profile.anonymous_customer_id,
            session_id="s1",
            product_id="high",
            product_name="High product",
            strategy_id="strategy_settings",
        )
        memory_repository.record_event(
            event_type=EVENT_RECOMMENDATION_DECLINED,
            anonymous_customer_id=profile.anonymous_customer_id,
            session_id="s2",
            product_id="low",
            product_name="Low product",
            strategy_id="strategy_settings",
        )

        before = memory_repository.aggregate_performance(strategy_id="strategy_settings")
        self.settings_service.update("strategy_settings", {"product_priorities": {"low": 40}})
        after = memory_repository.aggregate_performance(strategy_id="strategy_settings")

        self.assertEqual(before["summary"], after["summary"])
        self.assertEqual(before["products"], after["products"])

    def test_admin_api_key_accepts_correct_key(self):
        previous = os.environ.get(ADMIN_API_KEY_ENV)
        os.environ[ADMIN_API_KEY_ENV] = "test-admin-key"
        try:
            self.assertIsNone(require_admin_api_key("test-admin-key"))
        finally:
            if previous is None:
                os.environ.pop(ADMIN_API_KEY_ENV, None)
            else:
                os.environ[ADMIN_API_KEY_ENV] = previous

    def test_admin_api_key_rejects_wrong_key(self):
        previous = os.environ.get(ADMIN_API_KEY_ENV)
        os.environ[ADMIN_API_KEY_ENV] = "test-admin-key"
        try:
            with self.assertRaises(HTTPException) as raised:
                require_admin_api_key("wrong-key")
            self.assertEqual(raised.exception.status_code, 401)
        finally:
            if previous is None:
                os.environ.pop(ADMIN_API_KEY_ENV, None)
            else:
                os.environ[ADMIN_API_KEY_ENV] = previous


if __name__ == "__main__":
    unittest.main()
