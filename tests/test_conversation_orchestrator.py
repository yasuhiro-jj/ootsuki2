import unittest

from core.conversation_orchestrator import AutonomousConversationOrchestrator
from core.conversation_planner import (
    INTENT_CANCEL,
    INTENT_ORDER_CHANGE,
    INTENT_PRODUCT_EXISTENCE,
    INTENT_PRODUCT_ORDER,
    INTENT_RESERVATION,
    INTENT_STORE_FAQ,
    TOOL_CUSTOMER_MEMORY,
    TOOL_LEGACY_ROUTER,
    TOOL_MENU,
    TOOL_RESERVATION,
    TOOL_STORE_KNOWLEDGE,
    ConversationPlanner,
)


class RaisingPlanner(ConversationPlanner):
    def plan(self, *args, **kwargs):  # noqa: D401 - test stub
        raise RuntimeError("planner failed")


class ConversationOrchestratorTests(unittest.TestCase):
    def setUp(self):
        self.orchestrator = AutonomousConversationOrchestrator()

    def inspect(self, message, memory=None):
        return self.orchestrator.inspect(
            message,
            session_id="session-1",
            session_memory=memory or {},
        )

    def test_beer_existence_then_two_orders_selects_menu_and_legacy_fallback(self):
        beer_question = "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f"
        decision = self.inspect(beer_question)

        self.assertFalse(decision.handled)
        self.assertTrue(decision.fallback_to_legacy)
        self.assertEqual(decision.plan.intent, INTENT_PRODUCT_EXISTENCE)
        self.assertIn(TOOL_MENU, decision.tools.names)

        followup = self.inspect(
            "\u3058\u3083\u30422\u3064",
            {
                "active_topic": "menu",
                "current_entity": "\u4e2d\u751f\u30d3\u30fc\u30eb",
                "last_assistant_action": "answered_product_existence",
            },
        )

        self.assertEqual(followup.plan.intent, INTENT_PRODUCT_ORDER)
        self.assertIn(TOOL_MENU, followup.tools.names)
        self.assertIn(TOOL_LEGACY_ROUTER, followup.tools.names)

    def test_add_sashimi_then_change_beer_quantity_is_order_context(self):
        add_item = self.inspect(
            "\u305d\u308c\u3068\u523a\u8eab",
            {
                "active_topic": "order",
                "pending_flow": "order",
                "current_entity": "\u4e2d\u751f\u30d3\u30fc\u30eb",
                "last_assistant_action": "confirmed_order_item",
            },
        )

        self.assertEqual(add_item.plan.intent, INTENT_PRODUCT_ORDER)

        change = self.inspect(
            "\u3084\u3063\u3071\u308a\u30d3\u30fc\u30eb\u306f\u4e00\u3064\u3067",
            {
                "active_topic": "order",
                "pending_flow": "order",
                "current_entity": "\u4e2d\u751f\u30d3\u30fc\u30eb",
                "last_assistant_action": "confirmed_order_item",
            },
        )

        self.assertEqual(change.plan.intent, INTENT_ORDER_CHANGE)
        self.assertIn(TOOL_MENU, change.tools.names)

    def test_tomorrow_night_twenty_people_is_reservation(self):
        decision = self.inspect("\u660e\u65e5\u306e\u591c\u300120\u4eba\u306a\u3093\u3060\u3051\u3069")

        self.assertEqual(decision.plan.intent, INTENT_RESERVATION)
        self.assertIn(TOOL_STORE_KNOWLEDGE, decision.tools.names)
        self.assertIn(TOOL_RESERVATION, decision.tools.names)

    def test_private_room_then_banquet_course_uses_store_and_reservation_tools(self):
        private_room = self.inspect("\u500b\u5ba4\u3042\u308b\uff1f")

        self.assertIn(private_room.plan.intent, {INTENT_RESERVATION, INTENT_STORE_FAQ})
        self.assertIn(TOOL_STORE_KNOWLEDGE, private_room.tools.names)

        banquet = self.inspect(
            "\u3058\u3083\u3042\u5bb4\u4f1a\u30b3\u30fc\u30b9\u3067",
            {"active_topic": "reservation", "pending_flow": "reservation"},
        )

        self.assertEqual(banquet.plan.intent, INTENT_RESERVATION)
        self.assertIn(TOOL_RESERVATION, banquet.tools.names)

    def test_reservation_correction_uses_existing_reservation_fallback(self):
        decision = self.inspect(
            "\u4e88\u7d04\u3058\u3083\u306a\u304f\u3066\u8cea\u554f\u3067\u3059",
            {"active_topic": "reservation", "pending_flow": "reservation"},
        )

        self.assertEqual(decision.plan.intent, INTENT_ORDER_CHANGE)
        self.assertTrue(decision.fallback_to_legacy)
        self.assertIn(TOOL_RESERVATION, decision.tools.names)

    def test_cancel_selects_legacy_safe_path(self):
        decision = self.inspect(
            "\u3084\u3063\u3071\u308a\u3084\u3081\u308b",
            {
                "active_topic": "order",
                "pending_flow": "order",
                "recently_confirmed_item": "\u4e2d\u751f\u30d3\u30fc\u30eb",
            },
        )

        self.assertEqual(decision.plan.intent, INTENT_CANCEL)
        self.assertIn(TOOL_LEGACY_ROUTER, decision.tools.names)

    def test_customer_memory_reference_selects_memory_and_legacy_path(self):
        decision = self.inspect("\u6628\u65e5\u306e\u7d9a\u304d\u306a\u3093\u3060\u3051\u3069")

        self.assertIn(TOOL_CUSTOMER_MEMORY, decision.tools.names)
        self.assertIn(TOOL_LEGACY_ROUTER, decision.tools.names)

    def test_planner_exception_falls_back_to_legacy_router(self):
        orchestrator = AutonomousConversationOrchestrator(planner=RaisingPlanner())

        decision = orchestrator.inspect(
            "\u5224\u65ad\u3067\u304d\u306a\u3044\u5165\u529b",
            session_id="session-1",
            session_memory={},
        )

        self.assertFalse(decision.handled)
        self.assertTrue(decision.fallback_to_legacy)
        self.assertEqual(decision.reason, "planner_exception")
        self.assertEqual(decision.error, "RuntimeError")


if __name__ == "__main__":
    unittest.main()
