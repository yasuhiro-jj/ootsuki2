"""Helpers for keeping customer-facing replies short and natural."""

import re
from typing import Any, Dict, Optional

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
SHORT_STORE_FAQ_RULES = {
    "parking": {
        "keywords": ("\u99d0\u8eca\u5834", "\u8eca", "\u505c\u3081"),
        "reply": "\u306f\u3044\u3001\u99d0\u8eca\u5834\u304c\u3042\u308a\u307e\u3059\u3002\n\u5e97\u8217\u306e\u88cf\u5074\u306b5\u53f0\u5206\u306e\u30b9\u30da\u30fc\u30b9\u304c\u3042\u308a\u307e\u3059\u3002",
    },
    "payment": {
        "keywords": ("\u652f\u6255", "\u652f\u6255\u3044", "\u73fe\u91d1", "\u30ab\u30fc\u30c9", "QR", "PayPay", "\u30ad\u30e3\u30c3\u30b7\u30e5\u30ec\u30b9"),
        "reply": "\u73fe\u91d1\u3067\u306e\u304a\u652f\u6255\u3044\u304c\u3067\u304d\u307e\u3059\u3002\n\u30ab\u30fc\u30c9\u3084QR\u6c7a\u6e08\u306f\u3001\u5e97\u982d\u3067\u3054\u78ba\u8a8d\u304f\u3060\u3055\u3044\u3002",
    },
    "children": {
        "keywords": ("\u5b50\u9023\u308c", "\u5b50\u3069\u3082", "\u5b50\u4f9b", "\u304a\u5b50\u69d8", "\u5bb6\u65cf"),
        "reply": "\u306f\u3044\u3001\u304a\u5b50\u69d8\u9023\u308c\u3067\u3082\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u3059\u3002\n\u4eba\u6570\u304c\u591a\u3044\u5834\u5408\u306f\u3001\u3054\u6765\u5e97\u524d\u306b\u5e2d\u3092\u3054\u76f8\u8ac7\u304f\u3060\u3055\u3044\u3002",
    },
    "private_room": {
        "keywords": ("\u500b\u5ba4", "\u5ea7\u6577", "\u5e2d"),
        "reply": "\u500b\u5ba4\u3084\u5e2d\u306e\u3054\u5e0c\u671b\u306f\u3001\u65e5\u306b\u3061\u30fb\u6642\u9593\u30fb\u4eba\u6570\u3067\u78ba\u8a8d\u3057\u307e\u3059\u3002\n\u3054\u5e0c\u671b\u306e\u6761\u4ef6\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002",
    },
    "takeout": {
        "keywords": ("\u30c6\u30a4\u30af\u30a2\u30a6\u30c8", "\u6301\u3061\u5e30\u308a", "\u304a\u6301\u3061\u5e30\u308a", "\u5f01\u5f53"),
        "reply": "\u306f\u3044\u3001\u30c6\u30a4\u30af\u30a2\u30a6\u30c8\u3082\u3067\u304d\u307e\u3059\u3002\n\u304a\u5f01\u5f53\u3084\u4e00\u54c1\u6599\u7406\u3092\u3054\u7528\u610f\u3057\u3066\u3044\u307e\u3059\u3002",
    },
}
SHORT_STORE_FAQ_INQUIRY_TERMS = (
    "\u3042\u308a\u307e\u3059",
    "\u3042\u308b",
    "\u3067\u304d\u307e\u3059",
    "\u3067\u304d\u308b",
    "\u5927\u4e08\u592b",
    "\u6559\u3048\u3066",
    "\u4f7f\u3048",
    "\u53ef\u80fd",
    "\u5e0c\u671b",
    "\u3044\u3044",
    "\u3069\u3046",
    "\u3069\u3093\u306a",
    "\u4f55",
    "?",
    "\uff1f",
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
        missing_text = "\u3068".join(missing)
        return f"{prefix}\u3002\n{missing_text}\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"

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


def detect_short_store_faq_key(message: str) -> Optional[str]:
    text = (message or "").strip()
    if not text:
        return None
    if not any(term in text for term in SHORT_STORE_FAQ_INQUIRY_TERMS):
        return None
    for key, rule in SHORT_STORE_FAQ_RULES.items():
        if any(keyword in text for keyword in rule["keywords"]):
            return key
    return None


def format_short_store_faq_reply(faq_key: str) -> str:
    rule = SHORT_STORE_FAQ_RULES.get(faq_key)
    if not rule:
        return ""
    return str(rule["reply"])


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
