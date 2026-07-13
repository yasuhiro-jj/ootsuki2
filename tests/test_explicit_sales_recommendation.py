import unittest

from core.integrations.chatbot_ai_manager import ChatbotAIManagerBridge
from core.integrations.chatbot_ai_manager.explicit_recommendation import (
    SKIP_INTEGRATION_ERROR,
    SKIP_NO_ACTIVE_STRATEGY,
    SKIP_NOT_RECOMMENDATION_REQUEST,
    SKIP_ORDER_CONFIRMATION,
    SKIP_PRODUCT_AVOIDED,
    SKIP_PRODUCT_DECLINED,
    SKIP_SESSION_LIMIT_REACHED,
    ExplicitSalesRecommendationConnector,
    SHORT_FALLBACK_PRODUCT_ID,
)
from core.integrations.chatbot_ai_manager.schemas import PriorityProduct, SalesStrategy


class StaticStrategyService:
    def __init__(self, strategy=None, should_raise=False):
        self.strategy = strategy
        self.should_raise = should_raise

    def get_current(self):
        if self.should_raise:
            raise RuntimeError("strategy backend failed")
        return self.strategy


def make_strategy(*products, max_suggestions_per_session=1):
    return SalesStrategy(
        strategy_id="strategy_now",
        name="Manual dinner strategy",
        active=True,
        valid_from="2026-07-12T17:00:00+09:00",
        valid_until="2026-07-12T21:00:00+09:00",
        max_suggestions_per_session=max_suggestions_per_session,
        priority_products=products
        or (
            PriorityProduct(
                product_id="sake_fuji_001",
                name="Fuji sake",
                priority_score=90,
                suggest_when=("product_recommendation",),
                trigger_item_ids=("sashimi_001",),
            ),
        ),
    )


def make_connector(strategy=None, should_raise=False):
    bridge = ChatbotAIManagerBridge()
    connector = ExplicitSalesRecommendationConnector(
        StaticStrategyService(strategy=strategy, should_raise=should_raise),
        bridge,
    )
    return connector, bridge


class ExplicitSalesRecommendationTests(unittest.TestCase):
    def test_recommendation_request_returns_priority_product(self):
        connector, bridge = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="sashimi_001 pairing",
            intent_value="proposal",
            route_kind="store",
            session_memory={"current_entity": "sashimi_001"},
        )

        self.assertTrue(result.has_message)
        self.assertEqual(result.selected_product_id, "sake_fuji_001")
        self.assertEqual(result.memory_updates["suggestion_count"], 1)
        self.assertEqual(result.memory_updates["current_entity"], "Fuji sake")
        self.assertEqual(result.memory_updates["last_recommended_item"], "Fuji sake")
        self.assertEqual(bridge.list_recorded_events()[0].result, "suggestion_shown")

    def test_product_existence_does_not_return_suggestion(self):
        connector, _ = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="beer available?",
            intent_value="question",
            route_kind="store",
            session_memory={"last_assistant_action": "answered_product_existence"},
        )

        self.assertFalse(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_NOT_RECOMMENDATION_REQUEST)

    def test_faq_does_not_return_suggestion(self):
        connector, _ = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="business hours?",
            intent_value="question",
            route_kind="store",
            session_memory={},
        )

        self.assertFalse(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_NOT_RECOMMENDATION_REQUEST)

    def test_order_confirmation_context_does_not_return_suggestion(self):
        connector, _ = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="one please",
            intent_value="proposal",
            route_kind="store",
            session_memory={"last_assistant_action": "confirmed_order_item"},
        )

        self.assertFalse(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_ORDER_CONFIRMATION)

    def test_no_active_strategy_falls_back(self):
        connector, _ = make_connector(None)

        result = connector.try_recommend(
            session_id="s1",
            user_message="recommend drink",
            intent_value="proposal",
            route_kind="store",
            session_memory={},
        )

        self.assertTrue(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_NO_ACTIVE_STRATEGY)
        self.assertEqual(result.selected_product_id, SHORT_FALLBACK_PRODUCT_ID)
        self.assertEqual(result.memory_updates["current_entity"], "刺身定食")
        self.assertEqual(result.memory_updates["last_recommended_item"], "刺身定食")

    def test_no_active_strategy_fallback_is_short(self):
        connector, _ = make_connector(None)

        result = connector.try_recommend(
            session_id="s1",
            user_message="recommend food",
            intent_value="proposal",
            route_kind="store",
            session_memory={},
        )

        sentences = [
            part
            for part in result.message.replace("\n", "").replace("！", "。").split("。")
            if part.strip()
        ]
        self.assertLessEqual(len(sentences), 3)
        self.assertNotIn("LINE", result.message)
        self.assertNotIn("電話", result.message)
        self.assertNotIn("①", result.message)
        self.assertNotIn("②", result.message)

    def test_no_active_strategy_second_fallback_is_compact_repeat(self):
        connector, _ = make_connector(None)

        first = connector.try_recommend(
            session_id="s1",
            user_message="recommend food",
            intent_value="proposal",
            route_kind="store",
            session_memory={},
        )
        second = connector.try_recommend(
            session_id="s1",
            user_message="recommend food",
            intent_value="proposal",
            route_kind="store",
            session_memory=first.memory_updates,
        )

        self.assertTrue(first.has_message)
        self.assertTrue(second.has_message)
        self.assertEqual(second.skip_reason, SKIP_NO_ACTIVE_STRATEGY)
        self.assertEqual(
            second.memory_updates["last_assistant_action"],
            "repeated_short_recommendation_fallback",
        )
        self.assertNotEqual(first.message, second.message)
        self.assertLessEqual(second.message.count("\u3002"), 3)
        self.assertNotIn("LINE", second.message)
        self.assertNotIn("\u96fb\u8a71", second.message)
        self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", second.message)
        self.assertNotIn("\u2460", second.message)
        self.assertNotIn("\u2461", second.message)

    def test_strategy_service_exception_falls_back(self):
        connector, _ = make_connector(should_raise=True)

        result = connector.try_recommend(
            session_id="s1",
            user_message="recommend drink",
            intent_value="proposal",
            route_kind="store",
            session_memory={},
        )

        self.assertTrue(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_INTEGRATION_ERROR)
        self.assertEqual(result.selected_product_id, SHORT_FALLBACK_PRODUCT_ID)

    def test_session_limit_blocks_second_suggestion(self):
        connector, bridge = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="sashimi_001 pairing",
            intent_value="proposal",
            route_kind="store",
            session_memory={
                "current_entity": "sashimi_001",
                "suggestion_count": 1,
                "suggested_product_ids": ["sake_fuji_001"],
            },
        )

        self.assertTrue(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_SESSION_LIMIT_REACHED)
        self.assertEqual(result.memory_updates["suggestion_count"], 1)
        self.assertEqual(result.memory_updates["current_entity"], "Fuji sake")
        self.assertEqual(result.memory_updates["last_recommended_item"], "Fuji sake")
        self.assertEqual(
            result.memory_updates["last_assistant_action"],
            "repeated_recommendation_limit",
        )
        self.assertNotIn("LINE", result.message)
        self.assertNotIn("\u96fb\u8a71", result.message)
        self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", result.message)
        self.assertNotIn("\u2460", result.message)
        self.assertNotIn("\u2461", result.message)
        self.assertLessEqual(result.message.count("\u3002"), 3)
        events = bridge.list_recorded_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].result, "suggestion_skipped")

    def test_second_recommendation_does_not_duplicate_suggestion_event(self):
        connector, bridge = make_connector(make_strategy())

        first = connector.try_recommend(
            session_id="s1",
            user_message="sashimi_001 pairing",
            intent_value="proposal",
            route_kind="store",
            session_memory={"current_entity": "sashimi_001"},
        )
        second = connector.try_recommend(
            session_id="s1",
            user_message="sashimi_001 pairing",
            intent_value="proposal",
            route_kind="store",
            session_memory={
                "current_entity": "sashimi_001",
                "suggestion_count": first.memory_updates["suggestion_count"],
                "suggested_product_ids": first.memory_updates["suggested_product_ids"],
            },
        )

        self.assertEqual(first.memory_updates["suggestion_count"], 1)
        self.assertEqual(second.memory_updates["suggestion_count"], 1)
        self.assertEqual(second.skip_reason, SKIP_SESSION_LIMIT_REACHED)
        self.assertTrue(second.has_message)
        self.assertEqual(
            [event.result for event in bridge.list_recorded_events()],
            ["suggestion_shown", "suggestion_skipped"],
        )

    def test_declined_product_is_not_suggested(self):
        connector, _ = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="sashimi_001 pairing",
            intent_value="proposal",
            route_kind="store",
            session_memory={
                "current_entity": "sashimi_001",
                "declined_product_ids": ["sake_fuji_001"],
            },
        )

        self.assertFalse(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_PRODUCT_DECLINED)

    def test_avoided_product_is_not_suggested(self):
        connector, _ = make_connector(make_strategy())

        result = connector.try_recommend(
            session_id="s1",
            user_message="sashimi_001 pairing",
            intent_value="proposal",
            route_kind="store",
            session_memory={
                "current_entity": "sashimi_001",
                "avoided_items": ["sake_fuji_001"],
            },
        )

        self.assertFalse(result.has_message)
        self.assertEqual(result.skip_reason, SKIP_PRODUCT_AVOIDED)

    def test_multiple_candidates_returns_only_highest_priority_product(self):
        connector, _ = make_connector(
            make_strategy(
                PriorityProduct(
                    product_id="low",
                    name="Low priority",
                    priority_score=10,
                    suggest_when=("product_recommendation",),
                ),
                PriorityProduct(
                    product_id="high",
                    name="High priority",
                    priority_score=95,
                    suggest_when=("product_recommendation",),
                ),
            )
        )

        result = connector.try_recommend(
            session_id="s1",
            user_message="recommend drink",
            intent_value="proposal",
            route_kind="store",
            session_memory={},
        )

        self.assertTrue(result.has_message)
        self.assertEqual(result.selected_product_id, "high")
        self.assertEqual(result.memory_updates["suggested_product_ids"], ["high"])


if __name__ == "__main__":
    unittest.main()
