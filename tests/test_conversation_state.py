import unittest

from core.conversation_state import ConversationState


class ConversationStateTests(unittest.TestCase):
    def test_from_memory_normalizes_recent_product_and_reservation_slots(self):
        state = ConversationState.from_memory(
            {
                "active_topic": "reservation",
                "pending_flow": "reservation",
                "current_entity": "\u4e2d\u751f\u30d3\u30fc\u30eb",
                "reservation_slots": {
                    "people": 20,
                    "date": "\u660e\u65e5",
                    "time": "\u591c",
                },
            },
            session_id="session-1",
            customer_id="anon_customer",
        )

        self.assertEqual(state.session_id, "session-1")
        self.assertEqual(state.customer_id, "anon_customer")
        self.assertEqual(state.current_product.name, "\u4e2d\u751f\u30d3\u30fc\u30eb")
        self.assertEqual(state.reservation.slots["people"], 20)
        self.assertEqual(state.reservation.missing_core_slots, [])

    def test_order_candidate_can_be_confirmed_and_cancelled(self):
        state = ConversationState()
        state.set_order_candidate("\u4e2d\u751f\u30d3\u30fc\u30eb", quantity=2)

        self.assertEqual(state.pending_flow, "order")
        self.assertEqual(state.order_candidate.quantity, 2)

        confirmed = state.confirm_order_candidate()

        self.assertEqual(confirmed.status, "confirmed")
        self.assertEqual(state.confirmed_orders[0].product_name, "\u4e2d\u751f\u30d3\u30fc\u30eb")

        cancelled = state.cancel_latest_order_candidate()

        self.assertEqual(cancelled.product_name, "\u4e2d\u751f\u30d3\u30fc\u30eb")
        self.assertIsNone(state.order_candidate)
        self.assertEqual(state.pending_flow, "")

    def test_to_memory_updates_preserves_legacy_keys(self):
        state = ConversationState(session_id="session-1")
        state.remember_product("\u523a\u8eab")
        state.set_order_candidate("\u523a\u8eab", quantity=1)
        state.reservation.merge({"people": 20})

        updates = state.to_memory_updates()

        self.assertEqual(updates["active_topic"], "order")
        self.assertEqual(updates["pending_flow"], "order")
        self.assertEqual(updates["current_entity"], "\u523a\u8eab")
        self.assertEqual(updates["recently_confirmed_item"], "\u523a\u8eab")
        self.assertEqual(updates["reservation_slots"]["people"], 20)


if __name__ == "__main__":
    unittest.main()
