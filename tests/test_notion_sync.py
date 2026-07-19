import json
import tempfile
import unittest
from pathlib import Path

from core.notion_sync import (
    build_sync_report,
    normalize_menu_pages,
    normalize_store_pages,
    sync_notion_knowledge,
    validate_menu_items,
    validate_store_faqs,
)


def title(value):
    return {"type": "title", "title": [{"plain_text": value}]}


def text(value):
    return {"type": "rich_text", "rich_text": [{"plain_text": value}]}


def number(value):
    return {"type": "number", "number": value}


def select(value):
    return {"type": "select", "select": {"name": value}}


def multi(*values):
    return {"type": "multi_select", "multi_select": [{"name": value} for value in values]}


def checkbox(value):
    return {"type": "checkbox", "checkbox": value}


def url(value):
    return {"type": "url", "url": value}


class NotionSyncTests(unittest.TestCase):
    def test_normalizes_menu_existing_japanese_schema(self):
        pages = [
            {
                "id": "page-1",
                "url": "https://example.test/menu/1",
                "properties": {
                    "名前": title("生ビール"),
                    "販売単価": number(650),
                    "商品説明": text("冷えた生ビール"),
                    "カテゴリー": select("ドリンク"),
                    "サブカテゴリー": select("ビール"),
                    "タグ": multi("アルコール"),
                    "事前予約": checkbox(False),
                    "対応人数": select("1人～2人"),
                    "画像　URL": url("https://example.test/beer.jpg"),
                },
            }
        ]

        items = normalize_menu_pages(pages)

        self.assertEqual(items[0].name, "生ビール")
        self.assertEqual(items[0].price, 650)
        self.assertEqual(items[0].category, "ドリンク")
        self.assertEqual(items[0].subcategory, "ビール")
        self.assertEqual(items[0].tags, ["アルコール"])
        self.assertFalse(items[0].requires_reservation)
        self.assertEqual(items[0].image_url, "https://example.test/beer.jpg")

    def test_validates_menu_missing_price_duplicate_and_uncategorized(self):
        items = normalize_menu_pages(
            [
                {"id": "a", "properties": {"名前": title("刺身"), "販売単価": number(1200)}},
                {"id": "b", "properties": {"名前": title("刺身"), "販売単価": number(-10)}},
                {"id": "c", "properties": {"名前": title("唐揚げ")}},
            ]
        )

        codes = {issue.code for issue in validate_menu_items(items)}

        self.assertIn("menu.duplicate_name", codes)
        self.assertIn("menu.abnormal_price", codes)
        self.assertIn("menu.missing_price", codes)
        self.assertIn("menu.uncategorized", codes)

    def test_normalizes_store_faq_existing_schema(self):
        pages = [
            {
                "id": "store-1",
                "url": "https://example.test/store/1",
                "properties": {
                    "項目名": title("駐車場"),
                    "内容": text("店舗前にあります"),
                    "カテゴリ": select("通常情報"),
                    "決済": multi("現金", "クレカ"),
                    "parking": checkbox(True),
                    "テイクアウト対応": checkbox(True),
                    "席数": number(40),
                    "表示優先度": number(10),
                    "address": text("静岡県富士市"),
                },
            }
        ]

        items = normalize_store_pages(pages)

        self.assertEqual(items[0].key, "駐車場")
        self.assertEqual(items[0].answer, "店舗前にあります")
        self.assertEqual(items[0].payment_methods, ["現金", "クレカ"])
        self.assertTrue(items[0].parking)
        self.assertTrue(items[0].takeout)
        self.assertEqual(items[0].seats, 40)
        self.assertEqual(items[0].priority, 10)

    def test_validates_store_missing_answer_and_category(self):
        items = normalize_store_pages(
            [
                {"id": "a", "properties": {"項目名": title("営業時間")}},
                {"id": "b", "properties": {"項目名": title("営業時間"), "内容": text("11時から")}},
            ]
        )

        codes = {issue.code for issue in validate_store_faqs(items)}

        self.assertIn("store.missing_answer_material", codes)
        self.assertIn("store.duplicate_key", codes)
        self.assertIn("store.uncategorized", codes)

    def test_sync_writes_local_outputs_without_notion_mutation(self):
        calls = []

        def query_pages(database_id):
            calls.append(database_id)
            if database_id == "menu-db":
                return [
                    {
                        "id": "m1",
                        "properties": {
                            "名前": title("生ビール"),
                            "販売単価": number(650),
                            "カテゴリー": select("ドリンク"),
                        },
                    }
                ]
            return [
                {
                    "id": "s1",
                    "properties": {
                        "項目名": title("営業時間"),
                        "内容": text("11時からです"),
                        "カテゴリ": select("通常情報"),
                    },
                }
            ]

        with tempfile.TemporaryDirectory() as tmp:
            report = sync_notion_knowledge(
                target="all",
                menu_db_id="menu-db",
                store_db_id="store-db",
                output_dir=tmp,
                query_pages=query_pages,
            )
            menu_path = Path(report.outputs["menu"])
            store_path = Path(report.outputs["store"])
            report_path = Path(report.outputs["report"])

            self.assertEqual(calls, ["menu-db", "store-db"])
            self.assertTrue(menu_path.exists())
            self.assertTrue(store_path.exists())
            self.assertTrue(report_path.exists())
            self.assertEqual(json.loads(menu_path.read_text(encoding="utf-8").splitlines()[0])["name"], "生ビール")
            self.assertEqual(report.error_count, 0)

    def test_build_report_counts_errors(self):
        report = build_sync_report(
            target="menu",
            menu_db_id="menu",
            store_db_id="store",
            menu_items=normalize_menu_pages([{"id": "missing", "properties": {}}]),
            store_items=[],
        )

        self.assertEqual(report.error_count, 1)


if __name__ == "__main__":
    unittest.main()
