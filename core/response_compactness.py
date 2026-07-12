"""Helpers for keeping customer-facing replies short and natural."""

import re
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
    "それ一つ",
    "それ1つ",
    "それひとつ",
    "それで",
    "それ",
    "同じの",
    "同じもの",
    "同じやつ",
    "もう一つ",
    "もう1つ",
    "もうひとつ",
    "もう一杯",
    "もう1杯",
    "さっきの",
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

_FULL_WIDTH_DIGIT_TRANSLATION = str.maketrans("０１２３４５６７８９", "0123456789")


INITIAL_RESERVATION_REPLY = (
    "\u306f\u3044\u3001\u5e2d\u306e\u3054\u4e88\u7d04\u304c\u3067\u304d\u307e\u3059\u3002\n"
    "\u65e5\u306b\u3061\u3001\u6642\u9593\u3001\u4eba\u6570\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
)
RESERVATION_REQUEST_KEYWORDS = (
    "\u4e88\u7d04",
    "\u3088\u3084\u304f",
    "\u5e2d",
    "\u5bb4\u4f1a",
    "reserve",
    "reservation",
)


def should_append_line_contact_footer(message: str) -> bool:
    """Only add contact guidance when the reply says human contact is needed."""
    if not message:
        return False
    return any(term in message for term in CONTACT_GUIDANCE_TERMS)


def is_initial_reservation_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False
    if memory.get("pending_flow") == "reservation":
        return False
    if memory.get("active_topic") == "reservation":
        return False
    return any(keyword in text for keyword in RESERVATION_REQUEST_KEYWORDS)


def format_initial_reservation_reply() -> str:
    return INITIAL_RESERVATION_REPLY


def normalize_customer_reply(message: str) -> str:
    """Normalize common store replies so they read well in chat and voice."""
    if not message:
        return message

    normalized = message.translate(_FULL_WIDTH_DIGIT_TRANSLATION)
    normalized = normalized.replace("〜", "～")
    normalized = re.sub(r"(\d{1,2})時\s*[～\-ー]\s*(\d{1,2})時", r"\1時から\2時", normalized)
    normalized = normalized.replace("夜は、", "夜は")
    normalized = normalized.replace("までの営業になります", "です")
    normalized = normalized.replace("まで営業になります", "です")
    normalized = normalized.replace("の営業になります", "です")
    normalized = normalized.replace("営業になります", "です")
    normalized = normalized.replace(
        "火曜日は定休日をもらっていますので、よろしくお願いいたします。",
        "火曜日は定休日です。",
    )
    normalized = normalized.replace(
        "火曜日は定休日をもらっています。",
        "火曜日は定休日です。",
    )
    normalized = normalized.replace("定休日をもらっています", "定休日です")
    normalized = re.sub(r"。\s*よろしくお願いいたします。?$", "。", normalized)
    normalized = re.sub(r"\s+\n", "\n", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


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
    return f"かしこまりました。{item_name}1つですね。ご注文内容として控えました。"
