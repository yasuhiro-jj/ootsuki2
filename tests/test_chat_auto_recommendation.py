"""自動おすすめの在庫・除外チェックとフォールバックの挙動テスト。

/chat エンドポイント全体ではなく、応答文を決める
ExplicitSalesRecommendationConnector の層で検証する。
"""

import unittest

from core.integrations.chatbot_ai_manager import ChatbotAIManagerBridge
from core.integrations.chatbot_ai_manager.explicit_recommendation import (
    SHORT_FALLBACK_PRODUCT_NAME,
    ExplicitSalesRecommendationConnector,
)
from core.integrations.chatbot_ai_manager.schemas import (
    SEGMENT_SIGNATURE,
    PriorityProduct,
    SalesStrategy,
)


class StaticStrategyService:
    def __init__(self, strategy=None, should_raise=False):
        self.strategy = strategy
        self.should_raise = should_raise

    def get_current(self):
        if self.should_raise:
            raise RuntimeError("strategy backend failed")
        return self.strategy


def make_auto_strategy(*products, max_suggestions_per_session=1) -> SalesStrategy:
    return SalesStrategy(
        strategy_id="auto_ootsuki_20261006",
        name="AI Manager 自動戦略",
        active=True,
        valid_from="2026-10-06T00:00:00+09:00",
        valid_until="2099-12-31T00:00:00+09:00",
        generated_by="ai_manager_auto",
        max_suggestions_per_session=max_suggestions_per_session,
        priority_products=products,
    )


def make_product(product_id, name, priority_score, customer_reason="") -> PriorityProduct:
    return PriorityProduct(
        product_id=product_id,
        name=name,
        priority_score=priority_score,
        customer_reason=customer_reason,
        segment=SEGMENT_SIGNATURE,
        gross_margin_rank=1,
        sales_qty_rank=1,
        candidate_count=3,
    )


def recommend(connector, session_memory=None):
    return connector.try_recommend(
        session_id="session_auto_test",
        user_message="おすすめは？",
        intent_value="proposal",
        route_kind="store",
        session_memory=session_memory if session_memory is not None else {},
    )


def make_connector(strategy, is_recommendable=None, should_raise=False):
    return ExplicitSalesRecommendationConnector(
        StaticStrategyService(strategy=strategy, should_raise=should_raise),
        ChatbotAIManagerBridge(),
        is_recommendable=is_recommendable,
    )


TOP = make_product("p_top", "馬刺し 赤身", 90, "よくご注文いただいている一品です。")
SECOND = make_product("p_second", "刺身盛り合わせ", 80, "当店のおすすめの一品です。")


class AutoRecommendationAvailabilityTests(unittest.TestCase):
    def test_in_stock_product_is_recommended_with_customer_reason(self):
        connector = make_connector(
            make_auto_strategy(TOP, SECOND), is_recommendable=lambda _id, _name: True
        )

        result = recommend(connector)

        self.assertIn("馬刺し 赤身", result.message)
        self.assertIn("よくご注文いただいている一品です。", result.message)
        self.assertEqual(result.selected_product_id, "p_top")

    def test_out_of_stock_product_falls_through_to_next_candidate(self):
        def availability(product_id, _name):
            return product_id != "p_top"

        connector = make_connector(
            make_auto_strategy(TOP, SECOND), is_recommendable=availability
        )

        result = recommend(connector)

        self.assertNotIn("馬刺し 赤身", result.message)
        self.assertIn("刺身盛り合わせ", result.message)
        self.assertEqual(result.selected_product_id, "p_second")

    def test_excluded_product_is_not_recommended(self):
        excluded_names = {"馬刺し 赤身"}

        def availability(_product_id, name):
            return name not in excluded_names

        connector = make_connector(
            make_auto_strategy(TOP, SECOND), is_recommendable=availability
        )

        result = recommend(connector)

        self.assertNotIn("馬刺し 赤身", result.message)
        self.assertIn("刺身盛り合わせ", result.message)

    def test_all_candidates_unavailable_falls_back_to_sashimi_teishoku(self):
        def availability(product_id, _name):
            return product_id not in {"p_top", "p_second"}

        connector = make_connector(
            make_auto_strategy(TOP, SECOND), is_recommendable=availability
        )

        result = recommend(connector)

        self.assertIn(SHORT_FALLBACK_PRODUCT_NAME, result.message)
        self.assertNotIn("馬刺し 赤身", result.message)

    def test_no_message_when_fallback_is_also_unavailable(self):
        connector = make_connector(
            make_auto_strategy(TOP, SECOND), is_recommendable=lambda _id, _name: False
        )

        result = recommend(connector)

        self.assertFalse(result.has_message)
        self.assertEqual(result.message, "")

    def test_availability_checker_error_is_treated_as_unavailable(self):
        def availability(_product_id, _name):
            raise RuntimeError("notion unreachable")

        connector = make_connector(
            make_auto_strategy(TOP, SECOND), is_recommendable=availability
        )

        result = recommend(connector)

        self.assertFalse(result.has_message)


class AutoRecommendationFallbackTests(unittest.TestCase):
    def test_missing_strategy_falls_back_without_raising(self):
        connector = make_connector(None, is_recommendable=lambda _id, _name: True)

        result = recommend(connector)

        self.assertIn(SHORT_FALLBACK_PRODUCT_NAME, result.message)

    def test_strategy_backend_error_falls_back_without_raising(self):
        connector = make_connector(
            None, is_recommendable=lambda _id, _name: True, should_raise=True
        )

        result = recommend(connector)

        self.assertIn(SHORT_FALLBACK_PRODUCT_NAME, result.message)


class ModeOffRegressionTests(unittest.TestCase):
    """CHATBOT_AUTO_STRATEGY_MODE=off 相当（チェッカー未注入）で従来どおり動くこと。"""

    def test_without_availability_checker_behaviour_is_unchanged(self):
        product = PriorityProduct(product_id="p_manual", name="日本酒", priority_score=50)
        strategy = SalesStrategy(
            strategy_id="strategy_manual",
            name="手動戦略",
            active=True,
            valid_from="2026-10-06T00:00:00+09:00",
            valid_until="2099-12-31T00:00:00+09:00",
            generated_by="manual",
            priority_products=(product,),
        )
        connector = make_connector(strategy)

        result = recommend(connector)

        self.assertEqual(result.message, "日本酒がおすすめです。")

    def test_manual_product_without_customer_reason_keeps_plain_sentence(self):
        product = PriorityProduct(product_id="p_manual", name="冷奴", priority_score=10)
        connector = make_connector(
            make_auto_strategy(product), is_recommendable=lambda _id, _name: True
        )

        result = recommend(connector)

        self.assertEqual(result.message, "冷奴がおすすめです。")


if __name__ == "__main__":
    unittest.main()
