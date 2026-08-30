"""Phone-number based customer profile storage backed by a Notion database.

Unlike ``core.customer_memory`` (pseudonymous, browser-session scoped, stored
in a local JSON file), this service identifies a customer by phone number so
that their preferences survive across devices and visits, and persists them
in Notion so restaurant staff can also see/edit the data.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

PROP_NAME = "お名前"
PROP_PHONE = "電話番号"
PROP_VISIT_COUNT = "来店回数"
PROP_FIRST_VISIT = "初回来店日"
PROP_LAST_VISIT = "最終来店日"
PROP_FAVORITE_MENU = "好きなメニュー"
PROP_DISLIKES = "苦手なもの_アレルギー"
PROP_PREFERENCE_NOTES = "好みメモ_AI要約"
PROP_RECENT_ORDERS = "最近の注文"

_MAX_TEXT_LEN = 1900


def normalize_phone_number(value: Optional[str]) -> str:
    """Keep only digits (and a leading +) so formatting differences don't split records."""
    raw = str(value or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    return digits


@dataclass
class CustomerProfile:
    page_id: str
    phone_number: str
    name: str
    visit_count: int = 0
    first_visit_at: Optional[str] = None
    last_visit_at: Optional[str] = None
    favorite_menu: str = ""
    dislikes_allergies: str = ""
    preference_notes: str = ""
    recent_orders: str = ""

    def as_prompt_context(self) -> str:
        """Render this profile as a short block the LLM can use to personalize replies."""
        lines = [
            f"お客様「{self.name}」様はログイン中です（来店{self.visit_count}回目）。",
        ]
        if self.favorite_menu:
            lines.append(f"過去に好んでいたメニュー: {self.favorite_menu}")
        if self.dislikes_allergies:
            lines.append(f"苦手なもの・アレルギー（必ず避けて提案すること）: {self.dislikes_allergies}")
        if self.preference_notes:
            lines.append(f"その他の好みメモ: {self.preference_notes}")
        if self.recent_orders:
            lines.append(f"直近の注文: {self.recent_orders}")
        lines.append("これらの情報を踏まえ、押しつけがましくならない範囲で自然に活用してください。")
        return "\n".join(lines)


class CustomerProfileService:
    """Looks up / creates / updates customer profiles in the Notion customer profile DB."""

    def __init__(self, notion_client: Any, database_id: Optional[str]):
        self.notion_client = notion_client
        self.database_id = database_id

    @property
    def is_available(self) -> bool:
        return bool(
            self.notion_client
            and getattr(self.notion_client, "client", None)
            and self.database_id
        )

    def find_by_phone(self, phone_number: str) -> Optional[CustomerProfile]:
        phone = normalize_phone_number(phone_number)
        if not phone or not self.is_available:
            return None
        try:
            response = self.notion_client._query_database_compat(
                database_id=self.database_id,
                filter={"property": PROP_PHONE, "phone_number": {"equals": phone}},
            )
        except Exception as exc:
            logger.error("[CustomerProfile] 検索エラー: %s", exc)
            return None

        pages = (response or {}).get("results", [])
        if not pages:
            return None
        return self._page_to_profile(pages[0])

    def login(self, phone_number: str, name: str) -> Optional[CustomerProfile]:
        """Look up an existing profile by phone, or create a new one. Bumps visit_count."""
        phone = normalize_phone_number(phone_number)
        display_name = str(name or "").strip() or "お客様"
        if not phone or not self.is_available:
            return None

        now = datetime.now(timezone.utc).isoformat()
        existing = self.find_by_phone(phone)

        if existing:
            update_properties: Dict[str, Any] = {
                PROP_VISIT_COUNT: {"number": (existing.visit_count or 0) + 1},
                PROP_LAST_VISIT: {"date": {"start": now}},
            }
            if display_name and display_name != existing.name:
                update_properties[PROP_NAME] = {
                    "title": [{"text": {"content": display_name}}]
                }
            self.notion_client.update_page(existing.page_id, update_properties)
            existing.visit_count += 1
            existing.last_visit_at = now
            existing.name = display_name
            return existing

        properties = {
            PROP_NAME: {"title": [{"text": {"content": display_name}}]},
            PROP_PHONE: {"phone_number": phone},
            PROP_VISIT_COUNT: {"number": 1},
            PROP_FIRST_VISIT: {"date": {"start": now}},
            PROP_LAST_VISIT: {"date": {"start": now}},
        }
        page = self.notion_client.create_page(self.database_id, properties)
        page_id = (page or {}).get("id", "")
        if not page_id:
            logger.error("[CustomerProfile] 新規プロフィールの作成に失敗しました: phone=%s", phone)
            return None

        return CustomerProfile(
            page_id=page_id,
            phone_number=phone,
            name=display_name,
            visit_count=1,
            first_visit_at=now,
            last_visit_at=now,
        )

    def save_preferences(
        self,
        page_id: str,
        *,
        favorite_menu: Optional[str] = None,
        dislikes_allergies: Optional[str] = None,
        preference_notes: Optional[str] = None,
        recent_orders: Optional[str] = None,
    ) -> None:
        if not page_id or not self.is_available:
            return

        properties: Dict[str, Any] = {}
        if favorite_menu is not None:
            properties[PROP_FAVORITE_MENU] = _rich_text(favorite_menu)
        if dislikes_allergies is not None:
            properties[PROP_DISLIKES] = _rich_text(dislikes_allergies)
        if preference_notes is not None:
            properties[PROP_PREFERENCE_NOTES] = _rich_text(preference_notes)
        if recent_orders is not None:
            properties[PROP_RECENT_ORDERS] = _rich_text(recent_orders)

        if properties:
            self.notion_client.update_page(page_id, properties)

    def _page_to_profile(self, page: Dict[str, Any]) -> CustomerProfile:
        extract = self.notion_client._extract_property_value
        return CustomerProfile(
            page_id=page.get("id", ""),
            phone_number=_extract_phone(page),
            name=extract(page, PROP_NAME, "お客様") or "お客様",
            visit_count=int(extract(page, PROP_VISIT_COUNT, 0) or 0),
            first_visit_at=_extract_date(page, PROP_FIRST_VISIT),
            last_visit_at=_extract_date(page, PROP_LAST_VISIT),
            favorite_menu=extract(page, PROP_FAVORITE_MENU, "") or "",
            dislikes_allergies=extract(page, PROP_DISLIKES, "") or "",
            preference_notes=extract(page, PROP_PREFERENCE_NOTES, "") or "",
            recent_orders=extract(page, PROP_RECENT_ORDERS, "") or "",
        )


def _rich_text(value: str) -> Dict[str, Any]:
    return {"rich_text": [{"text": {"content": str(value or "")[:_MAX_TEXT_LEN]}}]}


def _extract_phone(page: Dict[str, Any]) -> str:
    try:
        return page["properties"][PROP_PHONE]["phone_number"] or ""
    except Exception:
        return ""


def _extract_date(page: Dict[str, Any], property_name: str) -> Optional[str]:
    try:
        date_prop = page["properties"][property_name]["date"]
        return date_prop["start"] if date_prop else None
    except Exception:
        return None


def merge_preference_text(existing: str, new_item: str, *, max_len: int = 300) -> str:
    """Append a newly-learned preference note, skipping near-duplicates and keeping it short."""
    new_item = str(new_item or "").strip()
    if not new_item:
        return existing or ""
    existing = str(existing or "").strip()
    if not existing:
        return new_item[:max_len]
    if new_item in existing:
        return existing
    merged = f"{existing}、{new_item}"
    if len(merged) <= max_len:
        return merged
    # 古いものから落として直近の情報を優先する
    parts = [p.strip() for p in merged.split("、") if p.strip()]
    while len(parts) > 1 and len("、".join(parts)) > max_len:
        parts.pop(0)
    return "、".join(parts)[-max_len:]


def extract_preference_signal(llm: Any, user_message: str) -> Optional[Dict[str, str]]:
    """Ask the LLM whether the customer's message reveals a food preference or allergy.

    Returns {"type": "preference"|"allergy", "content": "..."} or None when nothing
    worth remembering was said. Best-effort: any error is swallowed and treated as
    "nothing to remember" so this never breaks the main chat flow.
    """
    text = str(user_message or "").strip()
    if not text or len(text) > 400:
        return None
    try:
        from langchain_core.messages import HumanMessage

        prompt = (
            "以下はレストランのチャットボットに対するお客様の発言です。\n"
            "この発言から、次回以降の来店でも活用できる「好きな食べ物・味の好み」または"
            "「苦手な食べ物・アレルギー」の情報が読み取れるか判定してください。\n\n"
            f"発言: 「{text}」\n\n"
            "読み取れる場合は次のどちらかの形式で1行だけ出力してください（20文字程度に要約）:\n"
            "PREFERENCE: <好みの内容>\n"
            "ALLERGY: <苦手なもの・アレルギーの内容>\n\n"
            "読み取れない場合は NONE とだけ出力してください。挨拶や注文の確定、店舗情報の質問などは"
            "NONEです。"
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        raw = str(getattr(response, "content", "") or "").strip()
        if not raw or raw.upper().startswith("NONE"):
            return None
        if ":" not in raw:
            return None
        label, _, content = raw.partition(":")
        label = label.strip().upper()
        content = content.strip()
        if not content:
            return None
        if label == "PREFERENCE":
            return {"type": "preference", "content": content}
        if label == "ALLERGY":
            return {"type": "allergy", "content": content}
        return None
    except Exception as exc:
        logger.debug("[CustomerProfile] preference_extraction_skipped error=%s", exc)
        return None


def maybe_learn_and_save_preference(
    *,
    llm: Any,
    service: "CustomerProfileService",
    page_id: str,
    user_message: str,
    current_favorite_menu: str = "",
    current_dislikes_allergies: str = "",
) -> None:
    """Background-task entry point: detect + persist a preference signal, best-effort."""
    if not page_id or not service.is_available:
        return
    signal = extract_preference_signal(llm, user_message)
    if not signal:
        return

    try:
        if signal["type"] == "allergy":
            service.save_preferences(
                page_id,
                dislikes_allergies=merge_preference_text(
                    current_dislikes_allergies, signal["content"]
                ),
            )
        else:
            service.save_preferences(
                page_id,
                favorite_menu=merge_preference_text(
                    current_favorite_menu, signal["content"]
                ),
            )
        logger.info(
            "[CustomerProfile] preference_saved page_id=%s type=%s",
            page_id[:8],
            signal["type"],
        )
    except Exception as exc:
        logger.warning("[CustomerProfile] preference_save_failed error=%s", exc)
