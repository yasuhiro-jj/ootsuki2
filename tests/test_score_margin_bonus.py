"""AI Manager 自動戦略の粗利・売れ筋による加点のテスト。"""

import unittest

from core.integrations.chatbot_ai_manager.recommendation_settings import (
    RecommendationSettings,
    RecommendationSettingsValidationError,
    settings_from_payload,
)
from core.integrations.chatbot_ai_manager.rules import score_candidate
from core.integrations.chatbot_ai_manager.schemas import (
    SEGMENT_GROWTH,
    SEGMENT_SIGNATURE,
    ConversationSalesContext,
    PriorityProduct,
)


def make_context() -> ConversationSalesContext:
    return ConversationSalesContext(
        session_id="session_test",
        detected_intent="product_recommendation",
        recommendation_requested=True,
        question_only=False,
    )


def make_product(**overrides) -> PriorityProduct:
    base = {
        "product_id": "product_001",
        "name": "馬刺し 赤身",
        "priority_score": 0,
    }
    base.update(overrides)
    return PriorityProduct(**base)


def adjustment_value(score, prefix: str):
    for entry in score.adjustments:
        if entry.startswith(f"{prefix}:"):
            return int(entry.split(":", 1)[1])
    return None


class GrossMarginBonusTests(unittest.TestCase):
    def test_top_margin_rank_gets_full_weight(self):
        product = make_product(gross_margin_rank=1, candidate_count=5)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(adjustment_value(score, "gross_margin"), 10)
        self.assertEqual(score.final_score, 10)

    def test_last_margin_rank_gets_no_bonus(self):
        product = make_product(gross_margin_rank=5, candidate_count=5)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(adjustment_value(score, "gross_margin"), 0)
        self.assertEqual(score.final_score, 0)

    def test_middle_margin_rank_gets_half_weight(self):
        product = make_product(gross_margin_rank=3, candidate_count=5)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(adjustment_value(score, "gross_margin"), 5)

    def test_best_seller_rank_is_scored_separately(self):
        product = make_product(
            gross_margin_rank=1, sales_qty_rank=1, candidate_count=5
        )
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(adjustment_value(score, "gross_margin"), 10)
        self.assertEqual(adjustment_value(score, "best_seller"), 6)
        self.assertEqual(score.final_score, 16)

    def test_signature_segment_adds_bonus(self):
        product = make_product(segment=SEGMENT_SIGNATURE)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(adjustment_value(score, "signature_item"), 4)
        self.assertEqual(score.final_score, 4)

    def test_growth_segment_adds_bonus(self):
        product = make_product(segment=SEGMENT_GROWTH)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(adjustment_value(score, "growth_item"), 3)
        self.assertEqual(score.final_score, 3)


class ManualStrategyRegressionTests(unittest.TestCase):
    """順位情報が無い手動戦略では、点数が従来どおり変わらないこと。"""

    def test_product_without_rank_is_unchanged(self):
        product = make_product(priority_score=42)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(score.final_score, 42)
        self.assertIsNone(adjustment_value(score, "gross_margin"))
        self.assertIsNone(adjustment_value(score, "best_seller"))

    def test_candidate_count_below_two_is_ignored(self):
        product = make_product(gross_margin_rank=1, candidate_count=1, priority_score=7)
        score = score_candidate(product, make_context(), RecommendationSettings())
        self.assertEqual(score.final_score, 7)
        self.assertIsNone(adjustment_value(score, "gross_margin"))


class WeightValidationTests(unittest.TestCase):
    def test_new_weights_are_configurable(self):
        settings = settings_from_payload(
            {"strategy_id": "auto", "weights": {"gross_margin_weight": 20}}
        )
        self.assertEqual(settings.weights.gross_margin_weight, 20)

    def test_weight_above_maximum_is_rejected(self):
        with self.assertRaises(RecommendationSettingsValidationError):
            settings_from_payload(
                {"strategy_id": "auto", "weights": {"gross_margin_weight": 101}}
            )

    def test_weight_below_minimum_is_rejected(self):
        with self.assertRaises(RecommendationSettingsValidationError):
            settings_from_payload(
                {"strategy_id": "auto", "weights": {"best_seller_weight": -101}}
            )


if __name__ == "__main__":
    unittest.main()
