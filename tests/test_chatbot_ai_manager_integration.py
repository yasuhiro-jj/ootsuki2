import unittest

from core.integrations.chatbot_ai_manager import (
    ChatbotAIManagerBridge,
    ConversationSalesContext,
    PriorityProduct,
    SalesStrategy,
)
from core.integrations.chatbot_ai_manager.events import suggestion_event


def make_strategy() -> SalesStrategy:
    return SalesStrategy(
        strategy_id="today",
        priority_products=(
            PriorityProduct(
                product_id="local_sake",
                name="地酒",
                priority_score=90,
                reason="刺身との相性がよく粗利も高い",
                suggest_when=("food_pairing", "product_recommendation"),
            ),
            PriorityProduct(
                product_id="mini_sashimi",
                name="ミニ刺身",
                priority_score=70,
                reason="定食に合わせやすい",
                suggest_when=("order_followup",),
            ),
        ),
    )


class ChatbotAIManagerIntegrationTests(unittest.TestCase):
    def test_allows_one_priority_product_when_recommendation_is_requested(self):
        bridge = ChatbotAIManagerBridge()
        context = ConversationSalesContext(
            session_id="s1",
            detected_intent="product_recommendation",
            active_topic="food_pairing",
            recommendation_requested=True,
            question_only=False,
        )

        decision = bridge.decide_suggestion(context, make_strategy())

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.product.product_id, "local_sake")
        self.assertEqual(decision.rule, "single_safe_priority_product")

    def test_blocks_sales_suggestion_for_product_existence_question(self):
        bridge = ChatbotAIManagerBridge()
        context = ConversationSalesContext(
            session_id="s1",
            detected_intent="product_existence",
            active_topic="menu_search",
            recommendation_requested=False,
            question_only=True,
        )

        decision = bridge.decide_suggestion(context, make_strategy())

        self.assertFalse(decision.allowed)
        self.assertIn("intent", decision.reason)

    def test_blocks_suggestion_immediately_after_order_confirmation(self):
        bridge = ChatbotAIManagerBridge()
        context = ConversationSalesContext(
            session_id="s1",
            detected_intent="product_recommendation",
            active_topic="food_pairing",
            last_assistant_action="confirmed_order_item",
            recommendation_requested=True,
            question_only=False,
        )

        decision = bridge.decide_suggestion(context, make_strategy())

        self.assertFalse(decision.allowed)
        self.assertIn("last assistant action", decision.reason)

    def test_declined_product_is_not_suggested_again(self):
        bridge = ChatbotAIManagerBridge()
        context = ConversationSalesContext(
            session_id="s1",
            detected_intent="product_recommendation",
            active_topic="food_pairing",
            declined_products=("local_sake",),
            recommendation_requested=True,
            question_only=False,
        )

        decision = bridge.decide_suggestion(context, make_strategy())

        self.assertFalse(decision.allowed)
        self.assertIn("no eligible", decision.reason)

    def test_session_suggestion_limit_is_respected(self):
        bridge = ChatbotAIManagerBridge()
        context = ConversationSalesContext(
            session_id="s1",
            detected_intent="product_recommendation",
            active_topic="food_pairing",
            suggestion_count=1,
            recommendation_requested=True,
            question_only=False,
        )

        decision = bridge.decide_suggestion(context, make_strategy())

        self.assertFalse(decision.allowed)
        self.assertIn("limit", decision.reason)

    def test_records_suggestion_result_event(self):
        bridge = ChatbotAIManagerBridge()
        event = suggestion_event(
            session_id="s1",
            strategy_id="today",
            product_id="local_sake",
            result="declined",
        )

        bridge.record_suggestion_result(event)

        self.assertEqual(bridge.list_recorded_events(), [event])


if __name__ == "__main__":
    unittest.main()
