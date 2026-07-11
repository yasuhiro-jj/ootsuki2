"""Helpers for keeping customer-facing replies short and natural."""

from typing import Any, Dict

CONTACT_GUIDANCE_TERMS = (
    "お問い合わせ",
    "問い合わせ",
    "お電話",
    "電話",
    "LINE",
    "予約",
    "宴会",
    "空き",
    "在庫",
    "仕入れ",
    "アレルギー",
    "担当",
    "折り返し",
    "スタッフまで",
    "確認が必要",
)

SHORT_ORDER_CONFIRMATION_TERMS = (
    "じゃあ一つ",
    "じゃあ1つ",
    "じゃあひとつ",
    "一つ",
    "1つ",
    "ひとつ",
    "一杯",
    "1杯",
    "ください",
    "お願いします",
    "お願い",
    "にする",
)


def should_append_line_contact_footer(message: str) -> bool:
    """Only add contact guidance when the reply says human contact is needed."""
    if not message:
        return False
    return any(term in message for term in CONTACT_GUIDANCE_TERMS)


def is_short_order_confirmation(message: str, memory: Dict[str, Any]) -> bool:
    """Return True when a short follow-up confirms the just-mentioned item."""
    if not message or not memory:
        return False
    if memory.get("last_assistant_action") != "answered_product_existence":
        return False
    if not memory.get("current_entity"):
        return False

    normalized = message.strip().replace("　", "")
    if not normalized:
        return False
    if len(normalized) > 24:
        return False

    return any(term in normalized for term in SHORT_ORDER_CONFIRMATION_TERMS)


def format_short_order_confirmation(memory: Dict[str, Any]) -> str:
    item_name = str(memory.get("current_entity") or "ご注文").strip()
    return f"かしこまりました。{item_name}1つですね。"
