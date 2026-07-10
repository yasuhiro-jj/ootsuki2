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

    def test_snack_recommendation_is_not_direct_menu_lookup(self):
        self.assertFalse(is_direct_menu_existence_question("ビールに合うつまみある？"))
        self.assertFalse(is_direct_menu_existence_question("おつまみありますか？"))

    def test_extracts_specific_menu_candidate(self):
        service = MenuService(notion_client=None, menu_db_id="dummy")
        self.assertEqual(
            service.extract_menu_name_candidates("中生ビールある？")[0],
            "中生ビール",
        )

    def test_formats_short_existence_answer(self):
        answer = format_direct_menu_existence_answer(
            [SimpleNamespace(name="中生ビール", price=650)],
        )
        self.assertEqual(answer, "はい、中生ビール（650円）ございます。")


if __name__ == "__main__":
    unittest.main()
