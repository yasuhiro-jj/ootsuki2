import unittest
from pathlib import Path
from types import SimpleNamespace

from core.menu_existence import (
    format_direct_menu_existence_answer,
    is_direct_menu_existence_question,
)
from core.menu_service import MenuItemView, MenuService


class MenuExistenceTests(unittest.TestCase):
    def test_beer_existence_question_is_direct_menu_lookup(self):
        self.assertTrue(is_direct_menu_existence_question("中生ビールある？"))
        self.assertTrue(is_direct_menu_existence_question("瓶ビールありますか？"))
        self.assertTrue(is_direct_menu_existence_question("生ビールある？"))
        self.assertTrue(is_direct_menu_existence_question("生ビールありますか？"))
        self.assertTrue(is_direct_menu_existence_question("レモンサワー置いてますか？"))
        self.assertTrue(is_direct_menu_existence_question("日本酒ある？"))
        self.assertTrue(is_direct_menu_existence_question("刺身ありますか？"))

    def test_snack_recommendation_is_not_direct_menu_lookup(self):
        self.assertFalse(is_direct_menu_existence_question("ビールに合うつまみある？"))
        self.assertFalse(is_direct_menu_existence_question("おつまみありますか？"))
        self.assertFalse(is_direct_menu_existence_question("ビールに合うつまみは？"))
        self.assertFalse(is_direct_menu_existence_question("酒のつまみを教えて"))

    def test_direct_menu_lookup_precedes_natural_route(self):
        source = Path("core/api.py").read_text(encoding="utf-8")

        self.assertLess(
            source.index("if is_direct_menu_existence_question(user_message):"),
            source.index('if conversation_route.kind == "natural":'),
        )

    def test_extracts_specific_menu_candidate(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        self.assertEqual(
            service.extract_menu_name_candidates("中生ビールある？")[0],
            "中生ビール",
        )
        self.assertIn(
            "レモン酎ハイ",
            service.extract_menu_name_candidates("レモンサワー置いてますか？"),
        )
        self.assertEqual(
            service.extract_menu_name_candidates("刺身ありますか？"),
            ["刺身"],
        )

    def test_formats_short_existence_answer(self):
        answer = format_direct_menu_existence_answer(
            [SimpleNamespace(name="中生ビール", price=650)],
        )
        self.assertEqual(answer, "はい、中生ビール（650円）ありますよ。")

    def test_formats_multiple_existence_hits_without_large_candidate_list(self):
        answer = format_direct_menu_existence_answer(
            [
                SimpleNamespace(name="中生ビール", price=650),
                SimpleNamespace(name="大生ビール", price=880),
                SimpleNamespace(name="小生ビール", price=0),
                SimpleNamespace(name="ノンアルコールビール", price=380),
            ],
        )

        self.assertEqual(answer, "はい、中生ビール（650円）ありますよ。")
        self.assertNotIn("ノンアルコールビール", answer)
        self.assertNotIn("どれになさいますか", answer)

    def test_exact_product_name_wins_over_partial_sashimi_product(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        service.fetch_menu_items = lambda _keyword, limit=5: [
            MenuItemView(name="せんべろセットA（刺身盛合わせ）", price=1000),
            MenuItemView(name="刺身定食", price=1200),
        ][:limit]

        items = service.search_menu_items_for_existence("刺身定食ある？")

        self.assertEqual([item.name for item in items], ["刺身定食"])
        self.assertLessEqual(items[0].match_rank, 3)
        self.assertNotIn("せんべろセットA", format_direct_menu_existence_answer(items))

    def test_generic_sashimi_question_does_not_confirm_one_product(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        service.fetch_menu_items = lambda _keyword, limit=5: [
            MenuItemView(name="せんべろセットA（刺身盛合わせ）", price=1000),
            MenuItemView(name="刺身定食", price=1200),
            MenuItemView(name="刺身盛り合わせ", price=900),
        ][:limit]

        items = service.search_menu_items_for_existence("刺身ある？")
        answer = format_direct_menu_existence_answer(items)

        self.assertGreater(len(items), 1)
        self.assertGreater(items[0].match_rank, 3)
        self.assertIn("刺身という商品は確認できませんでした", answer)
        self.assertNotEqual(items[0].match_type, "exact_name")

    def test_sashimi_platter_uses_formal_matching_product(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        service.fetch_menu_items = lambda _keyword, limit=5: [
            MenuItemView(name="せんべろセットA（刺身盛合わせ）", price=1000),
            MenuItemView(name="刺身盛り合わせ", price=900),
        ][:limit]

        items = service.search_menu_items_for_existence("刺身盛合わせある？")

        self.assertEqual(items[0].name, "刺身盛り合わせ")
        self.assertLessEqual(items[0].match_rank, 3)

    def test_senbero_set_a_exact_match_wins(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        service.fetch_menu_items = lambda _keyword, limit=5: [
            MenuItemView(name="せんべろセットB", price=1000),
            MenuItemView(name="せんべろセットA", price=1000),
        ][:limit]

        items = service.search_menu_items_for_existence("せんべろセットAある？")

        self.assertEqual(items[0].name, "せんべろセットA")
        self.assertLessEqual(items[0].match_rank, 3)

    def test_karaage_set_does_not_select_single_karaage(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        service.fetch_menu_items = lambda _keyword, limit=5: [
            MenuItemView(name="唐揚げ", price=600),
        ][:limit]

        items = service.search_menu_items_for_existence("唐揚げ定食ある？")
        answer = format_direct_menu_existence_answer(items)

        self.assertGreater(items[0].match_rank, 3)
        self.assertIn("唐揚げ定食という商品は確認できませんでした", answer)
        self.assertNotEqual(answer, "はい、唐揚げ（600円）ありますよ。")

    def test_beer_uses_registered_alias_rule(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        service.fetch_menu_items = lambda _keyword, limit=5: [
            MenuItemView(name="中生ビール", price=650),
        ][:limit]

        items = service.search_menu_items_for_existence("生ビールある？")

        self.assertEqual(items[0].name, "中生ビール")
        self.assertLessEqual(items[0].match_rank, 3)


if __name__ == "__main__":
    unittest.main()
