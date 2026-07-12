import unittest

from core.response_compactness import (
    format_initial_reservation_reply,
    format_short_order_confirmation,
    is_initial_reservation_request,
    is_short_order_confirmation,
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
