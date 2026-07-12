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
SNACK_RECOMMENDATION_KEYWORDS = (
    "\u3064\u307e\u307f",
    "\u304a\u3064\u307e\u307f",
    "\u80b4",
)
DRINK_PAIRING_KEYWORDS = (
    "\u30d3\u30fc\u30eb",
    "\u9152",
    "\u304a\u9152",
    "\u30a2\u30eb\u30b3\u30fc\u30eb",
)
SNACK_RECOMMENDATION_REPLY = (
    "\u30d3\u30fc\u30eb\u306b\u5408\u308f\u305b\u308b\u306a\u3089\u3001\u5510\u63da\u3052\u304c\u304a\u3059\u3059\u3081\u3067\u3059\u3002\n"
    "\u8efd\u304f\u3064\u307e\u3080\u306a\u3089\u51b7\u5974\u3082\u3042\u308a\u307e\u3059\u3088\u3002"
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


def is_reservation_followup_request(message: str, memory: Dict[str, Any]) -> bool:
    if not message or not memory:
        return False
    return (
        memory.get("pending_flow") == "reservation"
        or memory.get("active_topic") == "reservation"
    )


def format_reservation_followup_reply(memory: Dict[str, Any]) -> str:
    slots = memory.get("reservation_slots") or {}
    people = slots.get("people")
    date = slots.get("date")
    time_value = slots.get("time")

    details = []
    if people:
        details.append(f"{people}\u540d\u69d8")
    if date:
        details.append(str(date))
    if time_value:
        details.append(str(time_value))

    missing = []
    if not date:
        missing.append("\u65e5\u306b\u3061")
    if not time_value:
        missing.append("\u6642\u9593")
    if not people:
        missing.append("\u4eba\u6570")

    if missing:
        prefix = "\u627f\u77e5\u3057\u307e\u3057\u305f"
        if details:
            prefix = f"{'、'.join(details)}\u3067\u3059\u306d"
        return f"{prefix}\u3002\n{'\u3068'.join(missing)}\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"

    return (
        f"{'、'.join(details)}\u3067\u304a\u9810\u304b\u308a\u3057\u307e\u3059\u3002\n"
        "\u5ff5\u306e\u305f\u3081\u3001\u304a\u540d\u524d\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
    )


def is_snack_recommendation_request(message: str) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    has_snack = any(keyword in text for keyword in SNACK_RECOMMENDATION_KEYWORDS)
    has_drink = any(keyword in text for keyword in DRINK_PAIRING_KEYWORDS)
    return has_snack and has_drink


def format_snack_recommendation_reply() -> str:
    return SNACK_RECOMMENDATION_REPLY


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
