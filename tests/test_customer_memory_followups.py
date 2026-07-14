import unittest

from core.customer_memory import (
    CONSENT_DENIED,
    CONSENT_GRANTED,
    CONSENT_UNKNOWN,
    CustomerMemoryContext,
)
from core.customer_memory_followups import (
    INTENT_DIFFERENT_FROM_PREVIOUS,
    INTENT_PREVIOUS_ORDER,
    INTENT_PREVIOUS_RECOMMENDATION,
    INTENT_USUAL_ITEM,
    build_customer_memory_followup_reply,
    detect_customer_memory_followup_intent,
)


class CustomerMemoryFollowupTests(unittest.TestCase):
    def test_detects_explicit_memory_followup_intents(self):
        self.assertEqual(
            detect_customer_memory_followup_intent("前回何を頼んだ？"),
            INTENT_PREVIOUS_ORDER,
        )
        self.assertEqual(
            detect_customer_memory_followup_intent("前におすすめされたものは？"),
            INTENT_PREVIOUS_RECOMMENDATION,
        )
        self.assertEqual(
            detect_customer_memory_followup_intent("いつものは？"),
            INTENT_USUAL_ITEM,
        )
        self.assertEqual(
            detect_customer_memory_followup_intent("前とは違うものがいい"),
            INTENT_DIFFERENT_FROM_PREVIOUS,
        )
        self.assertEqual(detect_customer_memory_followup_intent("生ビールある？"), "")

    def test_unknown_consent_does_not_show_previous_order(self):
        reply = build_customer_memory_followup_reply(
            "前回何を頼んだ？",
            CustomerMemoryContext(
                consent_status=CONSENT_UNKNOWN,
                recent_ordered_items=("中生ビール",),
                memory_available=True,
            ),
        )

        self.assertIn("同意", reply.message)
        self.assertNotIn("中生ビール", reply.message)

    def test_denied_consent_does_not_show_previous_recommendation(self):
        reply = build_customer_memory_followup_reply(
            "前におすすめされたものは？",
            CustomerMemoryContext(
                consent_status=CONSENT_DENIED,
                recent_recommended_items=("刺身定食",),
                memory_available=True,
            ),
        )

        self.assertIn("利用していません", reply.message)
        self.assertNotIn("刺身定食", reply.message)

    def test_granted_previous_order_uses_two_items_max(self):
        reply = build_customer_memory_followup_reply(
            "前回の注文は？",
            CustomerMemoryContext(
                consent_status=CONSENT_GRANTED,
                recent_ordered_items=("中生ビール", "刺身定食", "冷奴"),
                memory_available=True,
            ),
        )

        self.assertIn("中生ビールと刺身定食", reply.message)
        self.assertNotIn("冷奴", reply.message)

    def test_granted_previous_recommendation_is_separate_from_order(self):
        reply = build_customer_memory_followup_reply(
            "前回何をおすすめされた？",
            CustomerMemoryContext(
                consent_status=CONSENT_GRANTED,
                recent_ordered_items=("中生ビール",),
                recent_recommended_items=("刺身定食",),
                memory_available=True,
            ),
        )

        self.assertIn("刺身定食", reply.message)
        self.assertNotIn("中生ビール", reply.message)

    def test_usual_item_requires_at_least_two_orders(self):
        reply = build_customer_memory_followup_reply(
            "いつものは？",
            CustomerMemoryContext(
                consent_status=CONSENT_GRANTED,
                order_counts={"中生ビール": 1},
                memory_available=True,
            ),
        )

        self.assertIn("まだ", reply.message)
        self.assertNotIn("こちらでよろしいですか", reply.message)

    def test_usual_item_candidate_does_not_confirm_order(self):
        reply = build_customer_memory_followup_reply(
            "いつものは？",
            CustomerMemoryContext(
                consent_status=CONSENT_GRANTED,
                order_counts={"中生ビール": 2},
                memory_available=True,
            ),
        )

        self.assertIn("中生ビール", reply.message)
        self.assertIn("こちらでよろしいですか", reply.message)
        self.assertNotIn("控えました", reply.message)

    def test_different_from_previous_excludes_recent_and_declined(self):
        reply = build_customer_memory_followup_reply(
            "前とは違うものがいい",
            CustomerMemoryContext(
                consent_status=CONSENT_GRANTED,
                recent_ordered_items=("唐揚げ定食",),
                recent_recommended_items=("豚肉のにんにく炒め",),
                declined_product_names=("焼魚定食",),
                order_cancelled_product_names=("冷奴",),
                memory_available=True,
            ),
        )

        self.assertIn("冷奴", reply.message)
        self.assertNotIn("唐揚げ定食", reply.message)


if __name__ == "__main__":
    unittest.main()
