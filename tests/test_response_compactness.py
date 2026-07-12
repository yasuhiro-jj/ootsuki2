import unittest

from core.response_compactness import (
    detect_short_store_faq_key,
    format_accept_proposal_reply,
    format_cancel_request_reply,
    format_contextual_price_reply,
    format_initial_reservation_reply,
    format_night_visit_reply,
    format_other_recommendation_reply,
    format_party_size_without_context_reply,
    format_reservation_correction_reply,
    format_reservation_followup_reply,
    format_short_order_confirmation,
    format_short_store_faq_reply,
    format_snack_recommendation_reply,
    format_today_business_reply,
    format_what_available_reply,
    get_recent_item_name,
    is_accept_proposal_request,
    is_cancel_request,
    is_contextual_price_request,
    is_initial_reservation_request,
    is_night_visit_request,
    is_other_recommendation_request,
    is_party_size_without_context,
    is_previous_price_request,
    is_reservation_correction,
    is_reservation_followup_request,
    is_short_order_confirmation,
    is_snack_recommendation_request,
    is_today_business_request,
    is_what_available_request,
    normalize_customer_reply,
    should_append_line_contact_footer,
)


class ResponseCompactnessTests(unittest.TestCase):
    def test_initial_reservation_request_returns_compact_reply(self):
        self.assertTrue(is_initial_reservation_request("\u4e88\u7d04\u3067\u304d\u307e\u3059\u304b\uff1f", {}))

        reply = format_initial_reservation_reply()

        self.assertIn("\u4e88\u7d04", reply)
        self.assertIn("\u65e5\u306b\u3061", reply)
        self.assertIn("\u6642\u9593", reply)
        self.assertIn("\u4eba\u6570", reply)
        self.assertNotIn("LINE", reply)
        self.assertNotIn("\u96fb\u8a71", reply)
        self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", reply)
        self.assertNotIn("\u523a\u8eab", reply)
        self.assertLessEqual(reply.count("\u3002"), 3)

    def test_initial_reservation_request_does_not_capture_pending_flow(self):
        self.assertFalse(
            is_initial_reservation_request(
                "20\u4eba\u3067\u3059",
                {"pending_flow": "reservation", "active_topic": "reservation"},
            )
        )

    def test_reservation_followup_for_people_asks_only_missing_slots(self):
        memory = {
            "pending_flow": "reservation",
            "active_topic": "reservation",
            "reservation_slots": {"people": 20, "date": None, "time": None},
        }

        self.assertTrue(is_reservation_followup_request("20\u4eba\u3067\u3059", memory))
        reply = format_reservation_followup_reply(memory)

        self.assertIn("20\u540d\u69d8", reply)
        self.assertIn("\u65e5\u306b\u3061", reply)
        self.assertIn("\u6642\u9593", reply)
        self.assertNotIn("LINE", reply)
        self.assertNotIn("\u96fb\u8a71", reply)
        self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", reply)
        self.assertNotIn("\u304a\u3059\u3059\u3081", reply)
        self.assertLessEqual(reply.count("\u3002"), 3)

    def test_reservation_followup_with_core_slots_asks_name(self):
        memory = {
            "pending_flow": "reservation",
            "active_topic": "reservation",
            "reservation_slots": {"people": 20, "date": "\u660e\u65e5", "time": "\u591c"},
        }

        reply = format_reservation_followup_reply(memory)

        self.assertIn("20\u540d\u69d8", reply)
        self.assertIn("\u660e\u65e5", reply)
        self.assertIn("\u591c", reply)
        self.assertIn("\u304a\u540d\u524d", reply)
        self.assertNotIn("LINE", reply)
        self.assertNotIn("\u96fb\u8a71", reply)
        self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", reply)
        self.assertLessEqual(reply.count("\u3002"), 3)

    def test_snack_recommendation_is_compact(self):
        self.assertTrue(is_snack_recommendation_request("\u30d3\u30fc\u30eb\u306b\u5408\u3046\u3064\u307e\u307f\u306f\uff1f"))

        reply = format_snack_recommendation_reply()

        self.assertIn("\u5510\u63da\u3052", reply)
        self.assertNotIn("LINE", reply)
        self.assertNotIn("\u96fb\u8a71", reply)
        self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", reply)
        self.assertNotIn("\u4ee5\u4e0b\u304b\u3089", reply)
        self.assertLessEqual(reply.count("\u3002"), 3)

    def test_short_store_faq_replies_are_compact(self):
        examples = {
            "\u99d0\u8eca\u5834\u3042\u308a\u307e\u3059\u304b\uff1f": "parking",
            "\u652f\u6255\u3044\u65b9\u6cd5\u306f\uff1f": "payment",
            "\u5b50\u9023\u308c\u3067\u3082\u5927\u4e08\u592b\uff1f": "children",
            "\u500b\u5ba4\u3042\u308a\u307e\u3059\u304b\uff1f": "private_room",
            "\u30c6\u30a4\u30af\u30a2\u30a6\u30c8\u3067\u304d\u307e\u3059\u304b\uff1f": "takeout",
        }

        for message, faq_key in examples.items():
            with self.subTest(faq_key=faq_key):
                self.assertEqual(detect_short_store_faq_key(message), faq_key)
                reply = format_short_store_faq_reply(faq_key)
                self.assertNotIn("LINE", reply)
                self.assertNotIn("\u96fb\u8a71", reply)
                self.assertNotIn("\u30e1\u30cb\u30e5\u30fc", reply)
                self.assertNotIn("\u304a\u3059\u3059\u3081", reply)
                self.assertLessEqual(reply.count("\u3002"), 3)

    def test_short_store_faq_does_not_capture_status_report(self):
        self.assertIsNone(
            detect_short_store_faq_key("\u99d0\u8eca\u5834\u3067\u5c11\u3057\u5f85\u3063\u3066\u3044\u308b\u306d")
        )

    def test_line_contact_footer_is_not_added_to_normal_answers(self):
        self.assertFalse(should_append_line_contact_footer("営業時間は11時からです。"))

    def test_line_contact_footer_is_added_when_contact_is_needed(self):
        self.assertTrue(should_append_line_contact_footer("宴会の空き状況は確認が必要です。"))

    def test_short_order_confirmation_after_product_existence(self):
        memory = {
            "current_entity": "中生ビール",
            "last_assistant_action": "answered_product_existence",
        }

        self.assertTrue(is_short_order_confirmation("じゃあ一つ", memory))
        self.assertEqual(
            format_short_order_confirmation(memory),
            "かしこまりました。中生ビール1つですね。ご注文内容として控えました。",
        )

    def test_ambiguous_followups_confirm_recent_product(self):
        memory = {
            "current_entity": "中生ビール",
            "last_assistant_action": "answered_product_existence",
        }

        self.assertTrue(is_short_order_confirmation("それ", memory))
        self.assertTrue(is_short_order_confirmation("同じの", memory))
        self.assertTrue(is_short_order_confirmation("もう一つ", memory))
        self.assertTrue(is_short_order_confirmation("さっきの", memory))

    def test_short_order_confirmation_requires_recent_product_context(self):
        self.assertFalse(is_short_order_confirmation("じゃあ一つ", {}))
        self.assertFalse(
            is_short_order_confirmation(
                "じゃあ一つ",
                {"current_entity": "中生ビール", "last_assistant_action": "other"},
            )
        )

    def test_repeat_order_after_confirmed_item_uses_recent_item(self):
        memory = {
            "recently_confirmed_item": "中生ビール",
            "last_assistant_action": "confirmed_order_item",
        }

        self.assertEqual(get_recent_item_name(memory), "中生ビール")
        self.assertTrue(is_short_order_confirmation("もう一つ", memory))
        self.assertEqual(
            format_short_order_confirmation(memory),
            "かしこまりました。中生ビールをもう1つですね。",
        )

    def test_contextual_price_request_uses_recent_item(self):
        class Item:
            name = "中生ビール"
            price = 528

        memory = {
            "current_entity": "中生ビール",
            "last_assistant_action": "answered_product_existence",
        }

        self.assertTrue(is_contextual_price_request("いくら？", memory))
        self.assertEqual(
            format_contextual_price_reply("中生ビール", [Item()]),
            "中生ビールは528円です。",
        )

    def test_contextual_price_request_requires_context(self):
        self.assertFalse(is_contextual_price_request("いくら？", {}))

    def test_today_business_request_is_compact(self):
        self.assertTrue(is_today_business_request("今日やってる？"))
        reply = format_today_business_reply()

        self.assertIn("11時", reply)
        self.assertIn("17時", reply)
        self.assertNotIn("LINE", reply)
        self.assertNotIn("電話", reply)
        self.assertLessEqual(reply.count("。"), 3)

    def test_party_size_without_context_starts_reservation_clarification(self):
        self.assertTrue(is_party_size_without_context("4人なんだけど", {}))
        reply = format_party_size_without_context_reply()

        self.assertIn("予約", reply)
        self.assertIn("日にち", reply)
        self.assertIn("時間", reply)
        self.assertLessEqual(reply.count("。"), 3)

    def test_party_size_does_not_override_reservation_context(self):
        self.assertFalse(
            is_party_size_without_context(
                "4人なんだけど",
                {"pending_flow": "reservation", "active_topic": "reservation"},
            )
        )

    def test_night_visit_request_starts_reservation_clarification(self):
        self.assertTrue(is_night_visit_request("夜行きたい", {}))
        reply = format_night_visit_reply()

        self.assertIn("夜", reply)
        self.assertIn("日にち", reply)
        self.assertIn("人数", reply)
        self.assertLessEqual(reply.count("。"), 3)

    def test_cancel_request_clears_order_context(self):
        memory = {
            "pending_flow": "order",
            "recently_confirmed_item": "中生ビール",
        }

        self.assertTrue(is_cancel_request("やっぱりやめる", memory))
        reply = format_cancel_request_reply(memory)

        self.assertIn("中生ビール", reply)
        self.assertIn("取り消", reply)
        self.assertLessEqual(reply.count("。"), 3)

    def test_reservation_correction_requires_reservation_context(self):
        memory = {"pending_flow": "reservation", "active_topic": "reservation"}

        self.assertTrue(is_reservation_correction("予約じゃなくて質問です", memory))
        self.assertFalse(is_reservation_correction("予約じゃなくて質問です", {}))
        reply = format_reservation_correction_reply()

        self.assertIn("予約", reply)
        self.assertIn("質問", reply)
        self.assertLessEqual(reply.count("。"), 3)

    def test_accept_proposal_uses_recent_item(self):
        memory = {"current_entity": "刺身定食"}

        self.assertTrue(is_accept_proposal_request("それでお願いします", memory))
        self.assertEqual(
            format_accept_proposal_reply(memory),
            "かしこまりました。刺身定食で承ります。",
        )

    def test_previous_price_request_uses_recent_item(self):
        memory = {"current_entity": "刺身定食"}

        self.assertTrue(is_previous_price_request("さっきのいくら？", memory))
        self.assertFalse(is_previous_price_request("さっきのいくら？", {}))

    def test_other_recommendation_is_compact(self):
        memory = {"active_topic": "recommendation", "current_entity": "刺身定食"}

        self.assertTrue(is_other_recommendation_request("他には？", memory))
        reply = format_other_recommendation_reply()

        self.assertIn("唐揚げ定食", reply)
        self.assertNotIn("LINE", reply)
        self.assertLessEqual(reply.count("。"), 2)

    def test_what_available_depends_on_context(self):
        memory = {"active_topic": "menu"}

        self.assertTrue(is_what_available_request("何がある？", memory))
        self.assertFalse(is_what_available_request("何がある？", {}))
        reply = format_what_available_reply()

        self.assertIn("定食", reply)
        self.assertNotIn("LINE", reply)
        self.assertLessEqual(reply.count("。"), 3)

    def test_store_info_reply_is_normalized_for_voice(self):
        answer = normalize_customer_reply(
            "ランチは11時～１４時です。夜は、１７時～２１時までの営業になります。\n"
            "火曜日は定休日をもらっていますので、よろしくお願いいたします。"
        )

        self.assertEqual(
            answer,
            "ランチは11時から14時です。夜は17時から21時です。\n火曜日は定休日です。",
        )


if __name__ == "__main__":
    unittest.main()
