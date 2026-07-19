"""Read-only Notion knowledge sync normalization and validation.

This module intentionally does not mutate Notion.  It converts the existing
Ootsuki menu and store-info databases into stable local records that can be
validated in CI before later phases feed them into RAG or application caches.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any, Callable, Iterable, Literal, Optional


MENU_DB_ID = "262e9a7e-e5b7-801e-8a67-d962ab454c70"
STORE_DB_ID = "262e9a7e-e5b7-806e-911c-e966a0ccf7fe"

DEFAULT_OUTPUT_DIR = "outputs/notion_sync"

MENU_PROP_ALIASES = {
    "name": ("名前", "Name"),
    "price": ("販売単価", "Price"),
    "description": ("商品説明", "Description", "詳細説明"),
    "category": ("カテゴリー", "Category"),
    "subcategory": ("サブカテゴリー", "Subcategory"),
    "tags": ("タグ", "Tags"),
    "requires_reservation": ("事前予約", "要予約"),
    "serving_size": ("対応人数", "人数目安"),
    "image_url": ("画像　URL", "画像 URL", "Image URL", "メイン画像URL"),
}

STORE_PROP_ALIASES = {
    "key": ("項目名", "Name", "title"),
    "answer": ("内容", "標準回答", "answer"),
    "category": ("カテゴリ", "FAQカテゴリ"),
    "payment_methods": ("決済",),
    "parking": ("parking", "駐車場"),
    "takeout": ("テイクアウト対応",),
    "seats": ("席数",),
    "valid_from": ("有効期間開始",),
    "valid_until": ("有効期間終了",),
    "priority": ("表示優先度", "優先度"),
    "address": ("address", "住所"),
    "phone": ("phone", "電話番号"),
    "website": ("website",),
    "google_map": ("google_map", "Google Map"),
    "holidays": ("holidays", "定休日"),
    "access": ("access", "アクセス"),
    "features": ("features", "特徴"),
    "reservation_method": ("reservation_method", "予約方法"),
    "notes": ("備考", "メモ"),
}


@dataclass(frozen=True)
class NormalizedMenuItem:
    source_page_id: str
    source_url: str
    name: str
    price: Optional[float] = None
    description: str = ""
    category: str = ""
    subcategory: str = ""
    tags: list[str] = field(default_factory=list)
    requires_reservation: bool = False
    serving_size: str = ""
    image_url: str = ""


@dataclass(frozen=True)
class NormalizedStoreFaq:
    source_page_id: str
    source_url: str
    key: str
    answer: str = ""
    category: str = ""
    payment_methods: list[str] = field(default_factory=list)
    parking: Optional[bool] = None
    takeout: Optional[bool] = None
    seats: Optional[float] = None
    valid_from: str = ""
    valid_until: str = ""
    priority: Optional[float] = None
    address: str = ""
    phone: str = ""
    website: str = ""
    google_map: str = ""
    holidays: str = ""
    access: str = ""
    features: str = ""
    reservation_method: str = ""
    notes: str = ""


@dataclass
class ValidationIssue:
    target: Literal["menu", "store"]
    severity: Literal["error", "warning"]
    code: str
    message: str
    source_page_id: str = ""
    field: str = ""


@dataclass
class SyncReport:
    mode: str
    target: str
    created_at: str
    menu_db_id: str
    store_db_id: str
    menu_count: int = 0
    store_count: int = 0
    issues: list[ValidationIssue] = field(default_factory=list)
    outputs: dict[str, str] = field(default_factory=dict)

    @property
    def error_count(self) -> int:
        return sum(1 for issue in self.issues if issue.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for issue in self.issues if issue.severity == "warning")

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["error_count"] = self.error_count
        data["warning_count"] = self.warning_count
        return data


class NotionReadOnlyClient:
    """Small adapter around notion-client that only queries pages."""

    def __init__(self, token: Optional[str] = None) -> None:
        self.token = token or notion_token_from_env()
        if not self.token:
            raise RuntimeError("NOTION_API_KEY or NOTION_API_TOKEN is required")
        from notion_client import Client

        self.client = Client(auth=self.token)

    def query_all_pages(self, database_id: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        cursor = None
        while True:
            kwargs: dict[str, Any] = {"database_id": database_id, "page_size": 100}
            if cursor:
                kwargs["start_cursor"] = cursor
            response = self.client.databases.query(**kwargs)
            rows.extend(response.get("results", []))
            if not response.get("has_more"):
                return rows
            cursor = response.get("next_cursor")


def notion_token_from_env() -> str:
    return (
        os.getenv("NOTION_API_KEY")
        or os.getenv("NOTION_API_TOKEN")
        or os.getenv("NOTION_TOKEN")
        or ""
    )


def database_id_from_env(target: Literal["menu", "store"], default: str = "") -> str:
    if target == "menu":
        return (
            os.getenv("NOTION_CHATBOT_MENU_DB_ID")
            or os.getenv("NOTION_DATABASE_ID_MENU")
            or default
            or MENU_DB_ID
        )
    return (
        os.getenv("NOTION_CHATBOT_STORE_KNOWLEDGE_DB_ID")
        or os.getenv("NOTION_DATABASE_ID_STORE")
        or default
        or STORE_DB_ID
    )


def normalize_menu_pages(pages: Iterable[dict[str, Any]]) -> list[NormalizedMenuItem]:
    return [normalize_menu_page(page) for page in pages]


def normalize_store_pages(pages: Iterable[dict[str, Any]]) -> list[NormalizedStoreFaq]:
    return [normalize_store_page(page) for page in pages]


def normalize_menu_page(page: dict[str, Any]) -> NormalizedMenuItem:
    props = page.get("properties", {})
    return NormalizedMenuItem(
        source_page_id=page.get("id", ""),
        source_url=page.get("url", ""),
        name=str(_value_by_alias(props, MENU_PROP_ALIASES["name"]) or "").strip(),
        price=_float_or_none(_value_by_alias(props, MENU_PROP_ALIASES["price"])),
        description=str(
            _value_by_alias(props, MENU_PROP_ALIASES["description"]) or ""
        ).strip(),
        category=str(_value_by_alias(props, MENU_PROP_ALIASES["category"]) or "").strip(),
        subcategory=str(
            _value_by_alias(props, MENU_PROP_ALIASES["subcategory"]) or ""
        ).strip(),
        tags=_list_value(_value_by_alias(props, MENU_PROP_ALIASES["tags"])),
        requires_reservation=bool(
            _value_by_alias(props, MENU_PROP_ALIASES["requires_reservation"]) or False
        ),
        serving_size=str(
            _value_by_alias(props, MENU_PROP_ALIASES["serving_size"]) or ""
        ).strip(),
        image_url=str(_value_by_alias(props, MENU_PROP_ALIASES["image_url"]) or "").strip(),
    )


def normalize_store_page(page: dict[str, Any]) -> NormalizedStoreFaq:
    props = page.get("properties", {})
    return NormalizedStoreFaq(
        source_page_id=page.get("id", ""),
        source_url=page.get("url", ""),
        key=str(_value_by_alias(props, STORE_PROP_ALIASES["key"]) or "").strip(),
        answer=str(_value_by_alias(props, STORE_PROP_ALIASES["answer"]) or "").strip(),
        category=str(_value_by_alias(props, STORE_PROP_ALIASES["category"]) or "").strip(),
        payment_methods=_list_value(
            _value_by_alias(props, STORE_PROP_ALIASES["payment_methods"])
        ),
        parking=_bool_or_none(_value_by_alias(props, STORE_PROP_ALIASES["parking"])),
        takeout=_bool_or_none(_value_by_alias(props, STORE_PROP_ALIASES["takeout"])),
        seats=_float_or_none(_value_by_alias(props, STORE_PROP_ALIASES["seats"])),
        valid_from=str(_value_by_alias(props, STORE_PROP_ALIASES["valid_from"]) or ""),
        valid_until=str(_value_by_alias(props, STORE_PROP_ALIASES["valid_until"]) or ""),
        priority=_float_or_none(_value_by_alias(props, STORE_PROP_ALIASES["priority"])),
        address=str(_value_by_alias(props, STORE_PROP_ALIASES["address"]) or "").strip(),
        phone=str(_value_by_alias(props, STORE_PROP_ALIASES["phone"]) or "").strip(),
        website=str(_value_by_alias(props, STORE_PROP_ALIASES["website"]) or "").strip(),
        google_map=str(_value_by_alias(props, STORE_PROP_ALIASES["google_map"]) or "").strip(),
        holidays=str(_value_by_alias(props, STORE_PROP_ALIASES["holidays"]) or "").strip(),
        access=str(_value_by_alias(props, STORE_PROP_ALIASES["access"]) or "").strip(),
        features=str(_value_by_alias(props, STORE_PROP_ALIASES["features"]) or "").strip(),
        reservation_method=str(
            _value_by_alias(props, STORE_PROP_ALIASES["reservation_method"]) or ""
        ).strip(),
        notes=str(_value_by_alias(props, STORE_PROP_ALIASES["notes"]) or "").strip(),
    )


def validate_menu_items(items: list[NormalizedMenuItem]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen_names: dict[str, str] = {}
    for item in items:
        normalized_name = _normalize_key(item.name)
        if not item.name:
            issues.append(
                ValidationIssue(
                    target="menu",
                    severity="error",
                    code="menu.missing_name",
                    message="Menu item is missing a product name.",
                    source_page_id=item.source_page_id,
                    field="name",
                )
            )
        elif normalized_name in seen_names:
            issues.append(
                ValidationIssue(
                    target="menu",
                    severity="warning",
                    code="menu.duplicate_name",
                    message=f"Duplicate menu product name: {item.name}",
                    source_page_id=item.source_page_id,
                    field="name",
                )
            )
        else:
            seen_names[normalized_name] = item.source_page_id

        if item.price is None:
            issues.append(
                ValidationIssue(
                    target="menu",
                    severity="warning",
                    code="menu.missing_price",
                    message=f"Menu item has no price: {item.name or item.source_page_id}",
                    source_page_id=item.source_page_id,
                    field="price",
                )
            )
        elif item.price < 0 or item.price > 100000:
            issues.append(
                ValidationIssue(
                    target="menu",
                    severity="warning",
                    code="menu.abnormal_price",
                    message=f"Menu item has an abnormal price: {item.name}={item.price}",
                    source_page_id=item.source_page_id,
                    field="price",
                )
            )

        if not item.category and not item.subcategory:
            issues.append(
                ValidationIssue(
                    target="menu",
                    severity="warning",
                    code="menu.uncategorized",
                    message=f"Menu item is uncategorized: {item.name or item.source_page_id}",
                    source_page_id=item.source_page_id,
                    field="category",
                )
            )
    return issues


def validate_store_faqs(items: list[NormalizedStoreFaq]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen_keys: dict[str, str] = {}
    for item in items:
        normalized_key = _normalize_key(item.key)
        if not item.key:
            issues.append(
                ValidationIssue(
                    target="store",
                    severity="error",
                    code="store.missing_key",
                    message="Store info row is missing an item key.",
                    source_page_id=item.source_page_id,
                    field="key",
                )
            )
        elif normalized_key in seen_keys:
            issues.append(
                ValidationIssue(
                    target="store",
                    severity="warning",
                    code="store.duplicate_key",
                    message=f"Duplicate store info key: {item.key}",
                    source_page_id=item.source_page_id,
                    field="key",
                )
            )
        else:
            seen_keys[normalized_key] = item.source_page_id

        if not _has_store_answer_material(item):
            issues.append(
                ValidationIssue(
                    target="store",
                    severity="warning",
                    code="store.missing_answer_material",
                    message=f"Store info row has no answer material: {item.key or item.source_page_id}",
                    source_page_id=item.source_page_id,
                    field="answer",
                )
            )

        if not item.category:
            issues.append(
                ValidationIssue(
                    target="store",
                    severity="warning",
                    code="store.uncategorized",
                    message=f"Store info row is uncategorized: {item.key or item.source_page_id}",
                    source_page_id=item.source_page_id,
                    field="category",
                )
            )
    return issues


def build_sync_report(
    *,
    target: str,
    menu_db_id: str,
    store_db_id: str,
    menu_items: list[NormalizedMenuItem],
    store_items: list[NormalizedStoreFaq],
    outputs: Optional[dict[str, str]] = None,
) -> SyncReport:
    issues: list[ValidationIssue] = []
    if target in {"all", "menu"}:
        issues.extend(validate_menu_items(menu_items))
    if target in {"all", "store"}:
        issues.extend(validate_store_faqs(store_items))
    return SyncReport(
        mode="dry-run",
        target=target,
        created_at=datetime.now().isoformat(),
        menu_db_id=menu_db_id,
        store_db_id=store_db_id,
        menu_count=len(menu_items),
        store_count=len(store_items),
        issues=issues,
        outputs=outputs or {},
    )


def sync_notion_knowledge(
    *,
    target: str = "all",
    menu_db_id: Optional[str] = None,
    store_db_id: Optional[str] = None,
    output_dir: str = DEFAULT_OUTPUT_DIR,
    query_pages: Optional[Callable[[str], list[dict[str, Any]]]] = None,
) -> SyncReport:
    if target not in {"all", "menu", "store"}:
        raise ValueError("target must be one of: all, menu, store")

    resolved_menu_db_id = database_id_from_env("menu", menu_db_id or MENU_DB_ID)
    resolved_store_db_id = database_id_from_env("store", store_db_id or STORE_DB_ID)

    if query_pages is None:
        client = NotionReadOnlyClient()
        query_pages = client.query_all_pages

    menu_items: list[NormalizedMenuItem] = []
    store_items: list[NormalizedStoreFaq] = []

    if target in {"all", "menu"}:
        menu_items = normalize_menu_pages(query_pages(resolved_menu_db_id))
    if target in {"all", "store"}:
        store_items = normalize_store_pages(query_pages(resolved_store_db_id))

    outputs = write_sync_outputs(
        output_dir=output_dir,
        target=target,
        menu_items=menu_items,
        store_items=store_items,
    )
    report = build_sync_report(
        target=target,
        menu_db_id=resolved_menu_db_id,
        store_db_id=resolved_store_db_id,
        menu_items=menu_items,
        store_items=store_items,
        outputs=outputs,
    )
    report_path = Path(output_dir) / "report.json"
    report.outputs["report"] = str(report_path)
    report_path.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report


def write_sync_outputs(
    *,
    output_dir: str,
    target: str,
    menu_items: list[NormalizedMenuItem],
    store_items: list[NormalizedStoreFaq],
) -> dict[str, str]:
    base = Path(output_dir)
    base.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, str] = {}
    if target in {"all", "menu"}:
        menu_path = base / "menu.normalized.jsonl"
        _write_jsonl(menu_path, [asdict(item) for item in menu_items])
        outputs["menu"] = str(menu_path)
    if target in {"all", "store"}:
        store_path = base / "store_faq.normalized.jsonl"
        _write_jsonl(store_path, [asdict(item) for item in store_items])
        outputs["store"] = str(store_path)
    return outputs


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _value_by_alias(properties: dict[str, Any], aliases: Iterable[str]) -> Any:
    for alias in aliases:
        if alias in properties:
            return _plain_property_value(properties[alias])
    return None


def _plain_property_value(prop: dict[str, Any]) -> Any:
    prop_type = prop.get("type")
    if prop_type == "title":
        return "".join(part.get("plain_text", "") for part in prop.get("title", []))
    if prop_type == "rich_text":
        return "".join(part.get("plain_text", "") for part in prop.get("rich_text", []))
    if prop_type == "number":
        return prop.get("number")
    if prop_type == "select":
        selected = prop.get("select")
        return selected.get("name") if selected else ""
    if prop_type == "multi_select":
        return [item.get("name", "") for item in prop.get("multi_select", [])]
    if prop_type == "checkbox":
        return bool(prop.get("checkbox"))
    if prop_type == "url":
        return prop.get("url") or ""
    if prop_type == "phone_number":
        return prop.get("phone_number") or ""
    if prop_type == "date":
        date_value = prop.get("date")
        return date_value.get("start") if date_value else ""
    if prop_type == "status":
        status = prop.get("status")
        return status.get("name") if status else ""
    if prop_type == "formula":
        return _plain_property_value(prop.get("formula", {}))
    return None


def _list_value(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    return [text] if text else []


def _float_or_none(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _bool_or_none(value: Any) -> Optional[bool]:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "yes", "1", "__yes__"}:
        return True
    if text in {"false", "no", "0", "__no__"}:
        return False
    return None


def _normalize_key(value: str) -> str:
    return "".join(str(value or "").lower().split())


def _has_store_answer_material(item: NormalizedStoreFaq) -> bool:
    return any(
        value not in (None, "", [])
        for value in (
            item.answer,
            item.payment_methods,
            item.parking,
            item.takeout,
            item.address,
            item.phone,
            item.website,
            item.google_map,
            item.holidays,
            item.access,
            item.features,
            item.reservation_method,
            item.notes,
        )
    )
