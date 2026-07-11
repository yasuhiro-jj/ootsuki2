import unittest
from types import SimpleNamespace

from core.menu_existence import (
    format_direct_menu_existence_answer,
    is_direct_menu_existence_question,
)
from core.menu_service import MenuService


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
        self.assertIn(
            "刺身盛り合わせ",
            service.extract_menu_name_candidates("刺身ありますか？"),
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


if __name__ == "__main__":
    unittest.main()
