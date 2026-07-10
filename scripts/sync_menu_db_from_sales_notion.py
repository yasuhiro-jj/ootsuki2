"""Sync the public menu DB from a Notion sales/ABC source database.

Default mode is dry-run. Use --apply to update the menu database.

By default, the source database is treated as the canonical current menu list.
Financial/register analysis fields such as 商品コード, 平均単価, 想定原価, and
売上数量 are used only for matching or optional enrichment, not written into the
chatbot menu database.

This is intended for the source DB:
おおつき商品別売り上げ（ABC）（原価記入と粗利）１月から３月
https://app.notion.com/p/332e9a7ee5b780cd9b3be7494fba7f70
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from notion_client import Client


DEFAULT_SOURCE_DB_ID = "332e9a7e-e5b7-80cd-9b3b-e7494fba7f70"
DEFAULT_MENU_DB_ID = "258e9a7e-e5b7-8054-922d-e365bec99064"

EXCLUDE_NAMES = {
    "food",
    "軽減税率対象(内税)",
    "軽減税率対象",
    "内税",
    "税",
}

CATEGORY_MAP = {
    "定食": "ランチ",
    "ドリンク": "ドリンク",
    "持帰": "テイクアウト",
    "寿司": "フード",
    "単品": "フード",
    "その他": "その他",
}

SUBCATEGORY_MAP = {
    "ランチ": "おすすめランチ",
    "夜定食": "夜定食980円～",
    "ビール": "ビール",
    "サワー/ハイボール": "ハイボール",
    "弁当": "弁当・仕出し・持ち帰り",
    "サイド": "逸品料理",
    "その他": "その他",
}

REVENUE_RANK_TO_RECOMMENDATION = {
    "A": "★★★",
    "B": "★★",
    "C": "★",
}


@dataclass
class Stats:
    source_rows: int = 0
    skipped: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    archived: int = 0


def normalize(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).lower()


def rich_text(value: str) -> dict[str, Any]:
    return {"rich_text": [{"text": {"content": value[:2000]}}]}


def title(value: str) -> dict[str, Any]:
    return {"title": [{"text": {"content": value[:2000]}}]}


def number(value: Any) -> dict[str, Any] | None:
    if value in (None, ""):
        return None
    try:
        return {"number": float(value)}
    except (TypeError, ValueError):
        return None


def select(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    return {"select": {"name": str(value)[:100]}}


def status(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    return {"status": {"name": str(value)[:100]}}


def checkbox(value: bool) -> dict[str, Any]:
    return {"checkbox": value}


def prop_plain(prop: dict[str, Any] | None) -> Any:
    if not prop:
        return None
    prop_type = prop.get("type")
    if prop_type == "title":
        return "".join(item.get("plain_text", "") for item in prop.get("title", []))
    if prop_type == "rich_text":
        return "".join(item.get("plain_text", "") for item in prop.get("rich_text", []))
    if prop_type == "number":
        return prop.get("number")
    if prop_type == "select":
        return (prop.get("select") or {}).get("name")
    if prop_type == "status":
        return (prop.get("status") or {}).get("name")
    if prop_type == "checkbox":
        return prop.get("checkbox")
    return None


def payload_plain(payload: dict[str, Any]) -> Any:
    if "title" in payload:
        return "".join(item.get("text", {}).get("content", "") for item in payload["title"])
    if "rich_text" in payload:
        return "".join(item.get("text", {}).get("content", "") for item in payload["rich_text"])
    if "number" in payload:
        return payload["number"]
    if "select" in payload:
        return (payload.get("select") or {}).get("name")
    if "status" in payload:
        return (payload.get("status") or {}).get("name")
    if "checkbox" in payload:
        return payload["checkbox"]
    return None


def page_value(page: dict[str, Any], name: str) -> Any:
    return prop_plain(page.get("properties", {}).get(name))


def query_all(notion: Client, database_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    cursor = None
    while True:
        kwargs: dict[str, Any] = {"database_id": database_id, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        response = notion.databases.query(**kwargs)
        rows.extend(response.get("results", []))
        if not response.get("has_more"):
            return rows
        cursor = response.get("next_cursor")


def index_menu_pages(menu_pages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for page in menu_pages:
        for prop_name in ("メニューID", "レジAPI連携ID", "Name", "短縮名"):
            value = page_value(page, prop_name)
            key = normalize(value)
            if key:
                index.setdefault(key, page)
    return index


def should_skip_source(page: dict[str, Any], include_calculation_excluded: bool) -> tuple[bool, str]:
    name = str(page_value(page, "商品名") or "").strip()
    if not name:
        return True, "missing product name"
    if name in EXCLUDE_NAMES:
        return True, "excluded non-menu row"
    if not include_calculation_excluded and page_value(page, "計算対象外") is True:
        return True, "calculation excluded"
    return False, ""


def source_to_menu_props(
    page: dict[str, Any],
    menu_schema: dict[str, Any],
    sync_price_fields: bool = False,
) -> dict[str, Any]:
    product_name = str(page_value(page, "商品名") or "").strip()
    product_code = page_value(page, "商品コード")
    average_price = page_value(page, "平均単価")
    cost = page_value(page, "想定原価")
    sales_qty = page_value(page, "売上数量")
    rank = page_value(page, "ランク")
    category1 = page_value(page, "カテゴリ1")
    category2 = page_value(page, "カテゴリ2")

    desired: dict[str, Any] = {}

    def set_if_exists(prop_name: str, payload: dict[str, Any] | None) -> None:
        if payload is not None and prop_name in menu_schema:
            desired[prop_name] = payload

    set_if_exists("Name", title(product_name))
    set_if_exists("Category", select(CATEGORY_MAP.get(str(category1), str(category1 or ""))))
    set_if_exists("Subcategory", select(SUBCATEGORY_MAP.get(str(category2), str(category2 or ""))))
    set_if_exists("おすすめ度", status(REVENUE_RANK_TO_RECOMMENDATION.get(str(rank), None)))
    set_if_exists("おすすめ優先度", number({"A": 5, "B": 3, "C": 1}.get(str(rank), 1)))
    set_if_exists("表示優先度", number({"A": 100, "B": 60, "C": 30}.get(str(rank), 10)))
    set_if_exists("表示ON/OFF", checkbox(True))
    set_if_exists("提供可能", checkbox(True))
    set_if_exists("在庫あり", checkbox(True))

    if sync_price_fields:
        set_if_exists("Price", number(average_price))
        set_if_exists("メニューID", rich_text(str(int(product_code))) if product_code is not None else None)
        set_if_exists("レジAPI連携ID", rich_text(str(int(product_code))) if product_code is not None else None)
        set_if_exists("月間注文数", number(sales_qty))
        set_if_exists("原価(円)", number(cost))

        intro_parts = []
        if rank:
            intro_parts.append(f"売上ランク{rank}")
        if sales_qty is not None:
            intro_parts.append(f"売上数量 {int(sales_qty)}")
        if intro_parts:
            set_if_exists("おすすめ理由", rich_text(" / ".join(intro_parts)))

    return desired


def find_match(source_page: dict[str, Any], index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    code = page_value(source_page, "商品コード")
    name = page_value(source_page, "商品名")
    for key in (normalize(code), normalize(name)):
        if key and key in index:
            return index[key]
    return None


def diff_page(menu_page: dict[str, Any], desired: dict[str, Any]) -> dict[str, Any]:
    changes: dict[str, Any] = {}
    current = menu_page.get("properties", {})
    for prop_name, payload in desired.items():
        before = prop_plain(current.get(prop_name))
        after = payload_plain(payload)
        if before != after:
            changes[prop_name] = {"before": before, "after": after, "payload": payload}
    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Ootsuki menu DB from sales Notion DB")
    parser.add_argument("--source-db", default=os.getenv("NOTION_SOURCE_MENU_SALES_DB") or DEFAULT_SOURCE_DB_ID)
    parser.add_argument("--menu-db", default=os.getenv("NOTION_DATABASE_ID_MENU") or os.getenv("NOTION_DB_MENU") or DEFAULT_MENU_DB_ID)
    parser.add_argument("--apply", action="store_true", help="Actually update Notion")
    parser.add_argument("--no-create", action="store_true", help="Do not create menu rows that do not exist")
    parser.add_argument("--archive-missing", action="store_true", help="Archive menu rows not present in the source DB")
    parser.add_argument("--include-calculation-excluded", action="store_true", help="Import rows marked 計算対象外")
    parser.add_argument("--sync-price-fields", action="store_true", help="Also sync register/price fields such as 平均単価, 商品コード, 想定原価, 売上数量")
    parser.add_argument("--report", default="outputs/menu_sales_sync_report.json")
    args = parser.parse_args()

    load_dotenv()
    token = os.getenv("NOTION_API_KEY") or os.getenv("NOTION_API_TOKEN") or os.getenv("NOTION_TOKEN")
    if not token:
        print("ERROR: NOTION_API_KEY / NOTION_API_TOKEN / NOTION_TOKEN is not set.", file=sys.stderr)
        return 2

    notion = Client(auth=token)
    source_pages = query_all(notion, args.source_db)
    menu_pages = query_all(notion, args.menu_db)
    menu_schema = notion.databases.retrieve(database_id=args.menu_db).get("properties", {})
    menu_index = index_menu_pages(menu_pages)

    stats = Stats(source_rows=len(source_pages))
    seen_menu_page_ids: set[str] = set()
    seen_source_keys: set[str] = set()
    report: dict[str, Any] = {
        "mode": "apply" if args.apply else "dry-run",
        "source_db": args.source_db,
        "menu_db": args.menu_db,
        "rows": [],
        "archive_missing": [],
    }

    for source_page in source_pages:
        skip, reason = should_skip_source(source_page, args.include_calculation_excluded)
        product_name = str(page_value(source_page, "商品名") or "")
        product_code = page_value(source_page, "商品コード")
        if skip:
            stats.skipped += 1
            report["rows"].append({"action": "skipped", "name": product_name, "reason": reason})
            continue

        if product_code is not None:
            seen_source_keys.add(normalize(product_code))
        seen_source_keys.add(normalize(product_name))

        desired = source_to_menu_props(
            source_page,
            menu_schema,
            sync_price_fields=args.sync_price_fields,
        )
        match = find_match(source_page, menu_index)
        if match:
            seen_menu_page_ids.add(match["id"])
            changes = diff_page(match, desired)
            if not changes:
                stats.unchanged += 1
                report["rows"].append({"action": "unchanged", "name": product_name, "page_id": match["id"]})
                continue
            stats.updated += 1
            if args.apply:
                notion.pages.update(
                    page_id=match["id"],
                    properties={name: item["payload"] for name, item in changes.items()},
                )
            report["rows"].append(
                {
                    "action": "updated",
                    "name": product_name,
                    "page_id": match["id"],
                    "changes": {name: {"before": item["before"], "after": item["after"]} for name, item in changes.items()},
                }
            )
            continue

        if args.no_create:
            stats.skipped += 1
            report["rows"].append({"action": "skipped", "name": product_name, "reason": "not found and --no-create"})
            continue

        stats.created += 1
        created_id = None
        if args.apply:
            created = notion.pages.create(
                parent={"database_id": args.menu_db},
                properties=desired,
            )
            created_id = created.get("id")
        report["rows"].append({"action": "created", "name": product_name, "page_id": created_id})

    if args.archive_missing:
        for menu_page in menu_pages:
            if menu_page["id"] in seen_menu_page_ids:
                continue
            keys = [normalize(page_value(menu_page, prop)) for prop in ("メニューID", "レジAPI連携ID", "Name", "短縮名")]
            if any(key in seen_source_keys for key in keys if key):
                continue
            stats.archived += 1
            if args.apply:
                notion.pages.update(page_id=menu_page["id"], archived=True)
            report["archive_missing"].append(
                {"page_id": menu_page["id"], "name": page_value(menu_page, "Name")}
            )

    report["stats"] = stats.__dict__
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    print(f"Report: {report_path}")
    if not args.apply:
        print("Dry-run only. Re-run with --apply to update Notion.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
