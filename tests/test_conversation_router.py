import unittest

from core.conversation_router import (
    classify_conversation_route,
    infer_memory_updates,
    should_search_standard_answer,
)


class ConversationRouterTests(unittest.TestCase):
    def assert_route(self, message: str, expected: str, **kwargs):
        self.assertEqual(
            classify_conversation_route(message, **kwargs).kind,
            expected,
            msg=message,
        )

    def test_smalltalk_does_not_hit_store_tools(self):
        self.assert_route("今日は疲れたよ", "natural")
        self.assertFalse(should_search_standard_answer("今日は疲れたよ"))

    def test_clear_faq_question_can_search_standard_answer(self):
        self.assert_route("駐車場はあるの？", "store")
        self.assertTrue(should_search_standard_answer("駐車場はあるの？"))

    def test_store_keyword_status_update_is_natural(self):
        self.assert_route("駐車場で少し待っているね", "natural")
        self.assertFalse(should_search_standard_answer("駐車場で少し待っているね"))

    def test_reservation_pending_flow_overrides_short_followup(self):
        self.assert_route("20人なんだけど", "store", pending_flow="reservation")
        self.assert_route("明日の夜かな", "store", pending_flow="reservation")

    def test_clear_smalltalk_can_escape_pending_flow(self):
        self.assert_route("今日は疲れたよ", "natural", pending_flow="reservation")
        route = classify_conversation_route(
            "ところで今日は暑いね", pending_flow="reservation"
        )
        updates = infer_memory_updates("ところで今日は暑いね", route)
        self.assertEqual(route.kind, "natural")
        self.assertEqual(updates.get("pending_flow"), "")

    def test_reservation_can_pause_or_switch_to_latest(self):
        route = classify_conversation_route(
            "やっぱりやめる", pending_flow="reservation"
        )
        updates = infer_memory_updates("やっぱりやめる", route)
        self.assertEqual(route.kind, "natural")
        self.assertEqual(updates.get("pending_flow"), "")

        route = classify_conversation_route(
            "予約の話はまた後で。今日の天気は？",
            pending_flow="reservation",
        )
        updates = infer_memory_updates(
            "予約の話はまた後で。今日の天気は？", route
        )
        self.assertEqual(route.kind, "latest")
        self.assertEqual(updates.get("active_topic"), "latest")
        self.assertEqual(updates.get("pending_flow"), "")

    def test_recent_reservation_context_routes_followup_to_store(self):
        self.assert_route(
            "一人5000円くらい",
            "store",
            recent_messages=["宴会を20人でお願いしたい"],
        )

    def test_active_topic_routes_ambiguous_followups(self):
        self.assert_route("それいくら？", "store", active_topic="menu")
        self.assert_route("さっきの続きだけど", "store", active_topic="restaurant")
        self.assert_route("それで結果は？", "latest", active_topic="latest")
        self.assert_route("それでさ", "natural", active_topic="natural")

    def test_store_status_updates_are_natural(self):
        self.assert_route("店の前にいるよ", "natural")
        self.assert_route("駐車場に着きました", "natural")

    def test_today_alone_is_not_latest(self):
        self.assert_route("今日は疲れたよ", "natural")
        self.assert_route("今日のおすすめは？", "store")

    def test_external_realtime_question_is_latest(self):
        self.assert_route("今日の天気は？", "latest")
        self.assert_route("昨日の大谷の結果は？", "latest")

    def test_memory_updates_set_pending_flow_for_reservation(self):
        route = classify_conversation_route("宴会を20人でやりたい")
        updates = infer_memory_updates("宴会を20人でやりたい", route)
        self.assertEqual(updates.get("active_topic"), "reservation")
        self.assertEqual(updates.get("pending_flow"), "reservation")
        self.assertEqual(updates.get("reservation_slots", {}).get("people"), 20)

    def test_reservation_slots_accumulate(self):
        current_memory = {
            "active_topic": "reservation",
            "pending_flow": "reservation",
            "reservation_slots": {
                "date": None,
                "time": None,
                "people": 20,
                "course": None,
                "budget": None,
                "room_preference": None,
                "name": None,
                "phone": None,
            },
        }
        route = classify_conversation_route(
            "一人5000円くらいで個室がいい",
            pending_flow="reservation",
        )
        updates = infer_memory_updates(
            "一人5000円くらいで個室がいい",
            route,
            current_memory=current_memory,
        )
        slots = updates.get("reservation_slots", {})
        self.assertEqual(slots.get("people"), 20)
        self.assertEqual(slots.get("budget"), 5000)
        self.assertEqual(slots.get("room_preference"), "個室")

    def test_order_followup_after_product_existence_stays_store_order(self):
        current_memory = {
            "active_topic": "menu",
            "current_entity": "中生ビール",
            "detected_intent": "product_existence",
            "last_assistant_action": "answered_product_existence",
        }
        route = classify_conversation_route(
            "じゃあ一つ",
            active_topic=current_memory["active_topic"],
        )
        updates = infer_memory_updates(
            "じゃあ一つ",
            route,
            current_memory=current_memory,
        )

        self.assertEqual(route.kind, "store")
        self.assertEqual(updates.get("active_topic"), "order")
        self.assertEqual(updates.get("pending_flow"), "order")

    def test_topic_shift_from_product_existence_to_business_hours(self):
        route = classify_conversation_route(
            "ところで明日は何時から？",
            active_topic="menu",
        )

        self.assertEqual(route.kind, "store")
        self.assertTrue(
            route.reason.startswith("store_question")
            or route.reason == "store_keyword"
            or route.reason == "fallback_existing_pipeline"
        )


if __name__ == "__main__":
    unittest.main()
