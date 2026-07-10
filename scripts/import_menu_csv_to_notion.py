"""Import a menu CSV into the Ootsuki Notion menu database.

Default mode is dry-run. Use --apply to update Notion.

Examples:
    python scripts/import_menu_csv_to_notion.py --csv menu.csv
    python scripts/import_menu_csv_to_notion.py --csv menu.csv --apply
    python scripts/import_menu_csv_to_notion.py --csv menu.csv --apply --archive-missing
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from notion_client import Client


DEFAULT_MENU_DB_ID = "258e9a7e-e5b7-8054-922d-e365bec99064"

HEADER_ALIASES = {
    "Name": ["Name", "メニュー名", "商品名", "品名", "名称", "名前"],
    "メニューID": ["メニューID", "menu_id", "id", "ID", "商品コード", "コード"],
    "Price": ["Price", "価格", "金額", "税込価格", "値段"],
    "税抜価格": ["税抜価格", "税抜", "本体価格"],
    "Category": ["Category", "カテゴリ", "大分類"],
    "Subcategory": ["Subcategory", "サブカテゴリ", "中分類", "小分類"],
    "Tags": ["Tags", "タグ", "検索タグ"],
    "Description": ["Description", "説明", "概要"],
    "一言紹介": ["一言紹介", "短い説明", "紹介文", "キャッチコピー"],
    "詳細説明": ["詳細説明", "詳細", "内容", "メニュー内容"],
    "おすすめ理由": ["おすすめ理由", "推し理由"],
    "おすすめ度": ["おすすめ度", "おすすめランク"],
    "おすすめ優先度": ["おすすめ優先度", "優先度", "優先", "表示優先"],
    "表示優先度": ["表示優先度", "表示順", "並び順", "順番"],
    "表示ON/OFF": ["表示ON/OFF", "表示", "公開", "掲載", "表示対象"],
    "提供可能": ["提供可能", "販売中", "提供中", "販売可"],
    "在庫あり": ["在庫あり", "在庫", "有効", "available"],
    "テイクアウト可": ["テイクアウト可", "持ち帰り可", "テイクアウト"],
    "Pre-order": ["Pre-order", "事前予約", "予約必要", "要予約"],
    "今日のランチおすすめ": ["今日のランチおすすめ", "ランチおすすめ"],
    "今夜のおすすめ": ["今夜のおすすめ", "夜おすすめ", "本日のおすすめ"],
    "大人数向け": ["大人数向け", "団体向け", "宴会向け"],
    "アルコールに合う": ["アルコールに合う", "酒に合う", "つまみ向け"],
    "アレルギー対応": ["アレルギー対応", "アレルギー"],
    "アレルゲン": ["アレルゲン", "アレルギー品目"],
    "主な食材": ["主な食材", "食材", "材料"],
    "読み方": ["読み方", "ふりがな", "よみがな"],
    "短縮名": ["短縮名", "略称"],
    "メイン画像URL": ["メイン画像URL", "画像URL", "写真URL"],
    "Image URL": ["Image URL", "image_url"],
}

TRUE_VALUES = {"1", "true", "yes", "y", "on", "○", "〇", "あり", "有", "はい", "表示", "掲載", "販売中", "提供中", "可"}
FALSE_VALUES = {"0", "false", "no", "n", "off", "×", "なし", "無", "いいえ", "非表示", "停止", "不可"}


@dataclass
class ImportStats:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    archived: int = 0


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    for encoding in ("utf-8-sig", "cp932", "utf-8"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                reader = csv.DictReader(f)
                return [
                    {str(k or "").strip(): str(v or "").strip() for k, v in row.items()}
                    for row in reader
                ]
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("csv", b"", 0, 1, "Unable to decode CSV as utf-8-sig/cp932/utf-8")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value or "").lower()


def parse_number(value: str) -> float | int | None:
    cleaned = re.sub(r"[^\d.\-]", "", value or "")
    if not cleaned:
        return None
    number = float(cleaned)
    return int(number) if number.is_integer() else number


def parse_checkbox(value: str) -> bool | None:
    normalized = normalize_text(value)
    if not normalized:
        return None
    if normalized in {normalize_text(v) for v in TRUE_VALUES}:
        return True
    if normalized in {normalize_text(v) for v in FALSE_VALUES}:
        return False
    return None


def split_multi(value: str) -> list[str]:
    if not value:
        return []
    parts = re.split(r"[,、/／;；\n]+", value)
    return [part.strip() for part in parts if part.strip()]


def property_value_to_plain(prop: dict[str, Any]) -> Any:
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
    if prop_type == "multi_select":
        return [item.get("name") for item in prop.get("multi_select", [])]
    if prop_type == "checkbox":
        return prop.get("checkbox")
    if prop_type == "url":
        return prop.get("url")
    if prop_type == "phone_number":
        return prop.get("phone_number")
    return None


def find_csv_value(row: dict[str, str], notion_prop_name: str) -> str | None:
    aliases = HEADER_ALIASES.get(notion_prop_name, [notion_prop_name])
    by_normalized_header = {normalize_text(key): value for key, value in row.items()}
    for alias in aliases:
        value = by_normalized_header.get(normalize_text(alias))
        if value is not None and value != "":
            return value
    return None


def build_property_payload(prop_type: str, value: str) -> dict[str, Any] | None:
    if prop_type == "title":
        return {"title": [{"text": {"content": value[:2000]}}]}
    if prop_type == "rich_text":
        return {"rich_text": [{"text": {"content": value[:2000]}}]}
    if prop_type == "number":
        number = parse_number(value)
        return {"number": number} if number is not None else None
    if prop_type == "select":
        return {"select": {"name": value[:100]}}
    if prop_type == "status":
        return {"status": {"name": value[:100]}}
    if prop_type == "multi_select":
        options = [{"name": item[:100]} for item in split_multi(value)]
        return {"multi_select": options}
    if prop_type == "checkbox":
        parsed = parse_checkbox(value)
        return {"checkbox": parsed} if parsed is not None else None
    if prop_type == "url":
        return {"url": value or None}
    if prop_type == "phone_number":
        return {"phone_number": value or None}
    return None


def load_existing_pages(notion: Client, database_id: str) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    cursor = None
    while True:
        kwargs: dict[str, Any] = {"database_id": database_id, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        response = notion.databases.query(**kwargs)
        pages.extend(response.get("results", []))
        if not response.get("has_more"):
            return pages
        cursor = response.get("next_cursor")


def build_existing_index(pages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for page in pages:
        props = page.get("properties", {})
        for key in ("メニューID", "Name", "短縮名"):
            prop = props.get(key)
            if not prop:
                continue
            plain = property_value_to_plain(prop)
            if isinstance(plain, list):
                continue
            normalized = normalize_text(str(plain or ""))
            if normalized:
                index.setdefault(normalized, page)
    return index


def build_row_properties(
    row: dict[str, str],
    schema: dict[str, Any],
) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for prop_name, prop_schema in schema.items():
        if prop_schema.get("type") in {"created_time", "last_edited_time", "formula", "rollup", "relation"}:
            continue
        value = find_csv_value(row, prop_name)
        if value is None:
            continue
        payload = build_property_payload(prop_schema.get("type"), value)
        if payload is not None:
            props[prop_name] = payload
    return props


def resolve_match_key(row: dict[str, str]) -> str:
    for prop_name in ("メニューID", "Name", "短縮名"):
        value = find_csv_value(row, prop_name)
        if value:
            return normalize_text(value)
    return ""


def diff_properties(page: dict[str, Any], desired: dict[str, Any]) -> dict[str, Any]:
    changed: dict[str, Any] = {}
    current_props = page.get("properties", {})
    for prop_name, payload in desired.items():
        before = property_value_to_plain(current_props.get(prop_name, {}))
        after = desired_payload_to_plain(payload)
        if before != after:
            changed[prop_name] = {"before": before, "after": after, "payload": payload}
    return changed


def desired_payload_to_plain(payload: dict[str, Any]) -> Any:
    if "title" in payload:
        return "".join(item.get("text", {}).get("content", "") for item in payload["title"])
    if "rich_text" in payload:
        return "".join(item.get("text", {}).get("content", "") for item in payload["rich_text"])
    if "number" in payload:
        return payload["number"]
    if "select" in payload:
        return (payload["select"] or {}).get("name")
    if "status" in payload:
        return (payload["status"] or {}).get("name")
    if "multi_select" in payload:
        return [item.get("name") for item in payload["multi_select"]]
    if "checkbox" in payload:
        return payload["checkbox"]
    if "url" in payload:
        return payload["url"]
    if "phone_number" in payload:
        return payload["phone_number"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Import menu CSV into Notion menu DB")
    parser.add_argument("--csv", required=True, help="Path to the source CSV")
    parser.add_argument("--database-id", default=os.getenv("NOTION_DATABASE_ID_MENU") or os.getenv("NOTION_DB_MENU") or DEFAULT_MENU_DB_ID)
    parser.add_argument("--apply", action="store_true", help="Actually write changes to Notion")
    parser.add_argument("--archive-missing", action="store_true", help="Archive existing Notion menu rows that are not in the CSV")
    parser.add_argument("--no-create", action="store_true", help="Do not create rows missing from Notion")
    parser.add_argument("--report", default="outputs/menu_csv_import_report.json", help="Path for JSON report")
    args = parser.parse_args()

    load_dotenv()
    token = os.getenv("NOTION_API_KEY") or os.getenv("NOTION_API_TOKEN") or os.getenv("NOTION_TOKEN")
    if not token:
        print("ERROR: NOTION_API_KEY / NOTION_API_TOKEN / NOTION_TOKEN is not set.", file=sys.stderr)
        return 2

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}", file=sys.stderr)
        return 2

    notion = Client(auth=token)
    rows = read_csv_rows(csv_path)
    db = notion.databases.retrieve(database_id=args.database_id)
    schema = db.get("properties", {})
    existing_pages = load_existing_pages(notion, args.database_id)
    existing_index = build_existing_index(existing_pages)

    stats = ImportStats()
    report: dict[str, Any] = {
        "mode": "apply" if args.apply else "dry-run",
        "csv": str(csv_path),
        "database_id": args.database_id,
        "rows": [],
        "archive_missing": [],
    }
    seen_keys: set[str] = set()

    for row_number, row in enumerate(rows, start=2):
        key = resolve_match_key(row)
        title = find_csv_value(row, "Name") or ""
        if not key:
            stats.skipped += 1
            report["rows"].append({"row": row_number, "action": "skipped", "reason": "missing Name/menu id", "title": title})
            continue

        seen_keys.add(key)
        desired_props = build_row_properties(row, schema)
        if "Name" not in desired_props:
            stats.skipped += 1
            report["rows"].append({"row": row_number, "action": "skipped", "reason": "missing Name property", "title": title})
            continue

        page = existing_index.get(key)
        if page:
            changes = diff_properties(page, desired_props)
            if not changes:
                stats.unchanged += 1
                report["rows"].append({"row": row_number, "action": "unchanged", "title": title, "page_id": page.get("id")})
                continue

            stats.updated += 1
            if args.apply:
                notion.pages.update(
                    page_id=page["id"],
                    properties={name: item["payload"] for name, item in changes.items()},
                )
            report["rows"].append(
                {
                    "row": row_number,
                    "action": "updated",
                    "title": title,
                    "page_id": page.get("id"),
                    "changes": {name: {"before": item["before"], "after": item["after"]} for name, item in changes.items()},
                }
            )
        else:
            if args.no_create:
                stats.skipped += 1
                report["rows"].append({"row": row_number, "action": "skipped", "reason": "not found and --no-create", "title": title})
                continue

            stats.created += 1
            created_id = None
            if args.apply:
                created = notion.pages.create(
                    parent={"database_id": args.database_id},
                    properties=desired_props,
                )
                created_id = created.get("id")
            report["rows"].append({"row": row_number, "action": "created", "title": title, "page_id": created_id})

    if args.archive_missing:
        for page in existing_pages:
            props = page.get("properties", {})
            keys = []
            for prop_name in ("メニューID", "Name", "短縮名"):
                plain = property_value_to_plain(props.get(prop_name, {}))
                if plain and not isinstance(plain, list):
                    keys.append(normalize_text(str(plain)))
            if keys and any(key in seen_keys for key in keys):
                continue
            stats.archived += 1
            if args.apply:
                notion.pages.update(page_id=page["id"], archived=True)
            report["archive_missing"].append(
                {
                    "page_id": page.get("id"),
                    "name": property_value_to_plain(props.get("Name", {})),
                }
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
