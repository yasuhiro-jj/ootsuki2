import unittest

from core.response_compactness import (
    format_short_order_confirmation,
    is_short_order_confirmation,
    should_append_line_contact_footer,
)


class ResponseCompactnessTests(unittest.TestCase):
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
            "かしこまりました。中生ビール1つですね。",
        )

    def test_short_order_confirmation_requires_recent_product_context(self):
        self.assertFalse(is_short_order_confirmation("じゃあ一つ", {}))
        self.assertFalse(
            is_short_order_confirmation(
                "じゃあ一つ",
                {"current_entity": "中生ビール", "last_assistant_action": "other"},
            )
        )


if __name__ == "__main__":
    unittest.main()
