import json
import tempfile
import unittest
from pathlib import Path

from core.notion_sync import (
    build_sync_report,
    normalize_menu_pages,
    normalize_store_pages,
    public_menu_exclusion_reason,
    public_menu_items,
    public_store_faq_exclusion_reason,
    public_store_faqs,
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


def date_prop(value):
    return {"type": "date", "date": {"start": value}}


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

    def test_public_menu_filter_includes_only_ai_public_available_items(self):
        items = normalize_menu_pages(
            [
                {
                    "id": "included",
                    "properties": {
                        "Name": title("生ビール"),
                        "Price": number(650),
                        "AI公開": checkbox(True),
                        "提供状態": select("提供中"),
                        "別名検索語": text("生, 生中、ビール\nbeer"),
                    },
                },
                {
                    "id": "seasonal",
                    "properties": {
                        "Name": title("季節の刺身"),
                        "Price": number(1200),
                        "AI公開": checkbox(True),
                        "提供状態": select("季節限定"),
                    },
                },
                {
                    "id": "private",
                    "properties": {
                        "Name": title("非公開品"),
                        "Price": number(500),
                        "AI公開": checkbox(False),
                        "提供状態": select("提供中"),
                    },
                },
                {
                    "id": "sold-out",
                    "properties": {
                        "Name": title("売切れ品"),
                        "Price": number(500),
                        "AI公開": checkbox(True),
                        "提供状態": select("売切れ"),
                    },
                },
                {
                    "id": "copy",
                    "properties": {
                        "Name": title("コピー"),
                        "Price": number(500),
                        "AI公開": checkbox(True),
                        "提供状態": select("提供中"),
                    },
                },
            ]
        )

        self.assertEqual([item.source_page_id for item in public_menu_items(items)], ["included", "seasonal"])
        self.assertEqual(items[0].aliases, ["生", "生中", "ビール", "beer"])
        self.assertEqual(public_menu_exclusion_reason(items[2]), "not_ai_public")
        self.assertEqual(public_menu_exclusion_reason(items[3]), "not_available_for_public_ai")
        self.assertEqual(public_menu_exclusion_reason(items[4]), "placeholder_name")

    def test_public_menu_filter_falls_back_to_no_public_rows_without_new_props(self):
        items = normalize_menu_pages(
            [
                {
                    "id": "legacy",
                    "properties": {
                        "Name": title("生ビール"),
                        "Price": number(650),
                    },
                }
            ]
        )

        self.assertEqual(public_menu_items(items), [])
        self.assertEqual(public_menu_exclusion_reason(items[0]), "not_ai_public")

    def test_public_store_filter_requires_answer_allowed_and_faq_category(self):
        items = normalize_store_pages(
            [
                {
                    "id": "included",
                    "properties": {
                        "Name": title("営業時間"),
                        "answer": text("11時から営業しています"),
                        "FAQカテゴリ": select("営業時間"),
                        "回答可否": checkbox(True),
                    },
                },
                {
                    "id": "not-allowed",
                    "properties": {
                        "Name": title("駐車場"),
                        "answer": text("店舗前にあります"),
                        "FAQカテゴリ": select("駐車場"),
                        "回答可否": checkbox(False),
                    },
                },
                {
                    "id": "missing-category",
                    "properties": {
                        "Name": title("支払い"),
                        "answer": text("現金をご利用いただけます"),
                        "回答可否": checkbox(True),
                    },
                },
                {
                    "id": "expired",
                    "properties": {
                        "Name": title("特別営業時間"),
                        "answer": text("年末だけ営業時間が変わります"),
                        "FAQカテゴリ": select("営業時間"),
                        "回答可否": checkbox(True),
                        "valid_until": date_prop("2000-01-01"),
                    },
                },
            ]
        )

        self.assertEqual([item.source_page_id for item in public_store_faqs(items)], ["included"])
        self.assertEqual(public_store_faq_exclusion_reason(items[1]), "not_answer_allowed")
        self.assertEqual(public_store_faq_exclusion_reason(items[2]), "missing_faq_category")
        self.assertEqual(public_store_faq_exclusion_reason(items[3]), "expired_valid_until")

    def test_sync_outputs_public_files_report_and_duplicate_public_warning(self):
        def query_pages(database_id):
            if database_id == "menu-db":
                return [
                    {
                        "id": "m1",
                        "properties": {
                            "Name": title("生ビール"),
                            "Price": number(650),
                            "AI公開": checkbox(True),
                            "提供状態": select("提供中"),
                        },
                    },
                    {
                        "id": "m2",
                        "properties": {
                            "Name": title("生ビール"),
                            "Price": number(650),
                            "AI公開": checkbox(True),
                            "提供状態": select("提供中"),
                        },
                    },
                ]
            return [
                {
                    "id": "s1",
                    "properties": {
                        "Name": title("営業時間"),
                        "answer": text("11時から営業しています"),
                        "FAQカテゴリ": select("営業時間"),
                        "回答可否": checkbox(True),
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

            self.assertEqual(report.public_menu_count, 2)
            self.assertEqual(report.public_store_faq_count, 1)
            self.assertEqual(
                report.public_knowledge["menu"]["warnings"][0]["code"],
                "menu.public_duplicate_name",
            )
            public_menu_rows = Path(report.outputs["public_menu"]).read_text(encoding="utf-8").splitlines()
            public_store_rows = Path(report.outputs["public_store_faq"]).read_text(encoding="utf-8").splitlines()
            public_report = json.loads(Path(report.outputs["public_knowledge_report"]).read_text(encoding="utf-8"))
            self.assertEqual(len(public_menu_rows), 2)
            self.assertEqual(len(public_store_rows), 1)
            self.assertEqual(public_report["menu"]["included_count"], 2)


if __name__ == "__main__":
    unittest.main()
