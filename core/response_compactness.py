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
CONTEXTUAL_PRICE_TERMS = (
    "\u3044\u304f\u3089",
    "\u5024\u6bb5",
    "\u4fa1\u683c",
    "\u6599\u91d1",
)
TODAY_BUSINESS_TERMS = (
    "\u4eca\u65e5\u3084\u3063\u3066\u308b",
    "\u4eca\u65e5\u55b6\u696d",
    "\u4eca\u65e5\u958b\u3044\u3066",
    "\u4eca\u65e5\u3042\u3044\u3066",
)
PARTY_SIZE_PATTERN = re.compile(r"^\s*([0-9\uff10-\uff19]+)\s*(?:\u4eba|\u540d)")
NIGHT_VISIT_TERMS = (
    "\u591c\u884c\u304d\u305f\u3044",
    "\u591c\u306b\u884c\u304d\u305f\u3044",
    "\u591c\u884c\u304f",
    "\u591c\u3046\u304b\u304c\u3044\u305f\u3044",
)
TODAY_BUSINESS_REPLY = (
    "\u672c\u65e5\u306e\u55b6\u696d\u306f\u3001\u5e97\u8217\u306e\u55b6\u696d\u30ab\u30ec\u30f3\u30c0\u30fc\u3067\u306e\u78ba\u8a8d\u304c\u5fc5\u8981\u3067\u3059\u3002\n"
    "\u901a\u5e38\u306f\u30e9\u30f3\u30c111\u6642\u304b\u308914\u6642\u3001\u591c\u306f17\u6642\u304b\u308921\u6642\u3067\u3059\u3002"
)
PARTY_SIZE_REPLY = (
    "\u3054\u4e88\u7d04\u306e\u4eba\u6570\u3067\u3057\u3087\u3046\u304b\u3002\n"
    "\u65e5\u306b\u3061\u3068\u6642\u9593\u3082\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
)
NIGHT_VISIT_REPLY = (
    "\u591c\u306e\u3054\u6765\u5e97\u3067\u3059\u306d\u3002\n"
    "\u65e5\u306b\u3061\u3068\u4eba\u6570\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
)
CANCEL_REQUEST_TERMS = (
    "\u3084\u3063\u3071\u308a\u3084\u3081\u308b",
    "\u3084\u3081\u308b",
    "\u30ad\u30e3\u30f3\u30bb\u30eb",
    "\u53d6\u308a\u6d88\u3057",
)
RESERVATION_CORRECTION_TERMS = (
    "\u4e88\u7d04\u3058\u3083\u306a\u304f\u3066\u8cea\u554f",
    "\u4e88\u7d04\u3058\u3083\u306a\u3044",
    "\u4e88\u7d04\u3067\u306f\u306a\u3044",
)
ACCEPT_PROPOSAL_TERMS = (
    "\u305d\u308c\u3067\u304a\u9858\u3044",
    "\u305d\u308c\u3067\u304a\u9858\u3044\u3057\u307e\u3059",
    "\u305d\u308c\u306b\u3057\u307e\u3059",
    "\u305d\u308c\u3067",
)
PREVIOUS_PRICE_TERMS = (
    "\u3055\u3063\u304d\u306e\u3044\u304f\u3089",
    "\u3055\u3063\u304d\u306e\u5024\u6bb5",
    "\u305d\u308c\u3044\u304f\u3089",
)
OTHER_RECOMMENDATION_TERMS = (
    "\u4ed6\u306b\u306f",
    "\u307b\u304b\u306b\u306f",
    "\u5225\u306e",
)
WHAT_AVAILABLE_TERMS = (
    "\u4f55\u304c\u3042\u308b",
    "\u306a\u306b\u304c\u3042\u308b",
    "\u3069\u3093\u306a\u306e\u304c\u3042\u308b",
)
OTHER_RECOMMENDATION_REPLY = (
    "\u5225\u3067\u3057\u305f\u3089\u3001\u5510\u63da\u3052\u5b9a\u98df\u3082\u304a\u3059\u3059\u3081\u3067\u3059\u3002"
)
WHAT_AVAILABLE_MENU_REPLY = (
    "\u5b9a\u98df\u3084\u4e00\u54c1\u6599\u7406\u3001\u30c6\u30a4\u30af\u30a2\u30a6\u30c8\u306e\u304a\u5f01\u5f53\u304c\u3042\u308a\u307e\u3059\u3002\n"
    "\u6c17\u306b\u306a\u308b\u7a2e\u985e\u304c\u3042\u308c\u3070\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
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


def get_recent_item_name(memory: Dict[str, Any]) -> str:
    if not memory:
        return ""
    for key in ("recently_confirmed_item", "last_ordered_item", "current_entity"):
        value = str(memory.get(key) or "").strip()
        if value:
            return value
    return ""


def is_contextual_price_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text or len(text) > 24:
        return False
    return any(term in text for term in CONTEXTUAL_PRICE_TERMS) and bool(
        get_recent_item_name(memory)
    )


def format_contextual_price_reply(item_name: str, menu_items: Any) -> str:
    item = menu_items[0] if menu_items else None
    name = getattr(item, "name", None) or item_name
    price = getattr(item, "price", None)
    if isinstance(price, (int, float)) and price > 0:
        return f"{name}\u306f{int(price):,}\u5186\u3067\u3059\u3002"
    return f"{name}\u306e\u5024\u6bb5\u306f\u3001\u5e97\u982d\u3067\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002"


def is_today_business_request(message: str) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    return any(term in text for term in TODAY_BUSINESS_TERMS)


def format_today_business_reply() -> str:
    return TODAY_BUSINESS_REPLY


def is_party_size_without_context(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if memory.get("pending_flow") == "reservation" or memory.get("active_topic") == "reservation":
        return False
    return bool(PARTY_SIZE_PATTERN.search(text))


def format_party_size_without_context_reply() -> str:
    return PARTY_SIZE_REPLY


def is_night_visit_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if memory.get("pending_flow") == "reservation" or memory.get("active_topic") == "reservation":
        return False
    return any(term in text for term in NIGHT_VISIT_TERMS)


def format_night_visit_reply() -> str:
    return NIGHT_VISIT_REPLY


def is_cancel_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if not any(term in text for term in CANCEL_REQUEST_TERMS):
        return False
    return bool(
        memory.get("pending_flow")
        or memory.get("active_topic")
        or get_recent_item_name(memory)
    )


def format_cancel_request_reply(memory: Dict[str, Any]) -> str:
    item_name = get_recent_item_name(memory)
    if item_name and memory.get("pending_flow") == "order":
        return f"\u627f\u77e5\u3057\u307e\u3057\u305f\u3002{item_name}\u306e\u6ce8\u6587\u306f\u53d6\u308a\u6d88\u3057\u307e\u3059\u3002"
    if memory.get("pending_flow") == "reservation" or memory.get("active_topic") == "reservation":
        return "\u627f\u77e5\u3057\u307e\u3057\u305f\u3002\u4e88\u7d04\u306e\u3054\u76f8\u8ac7\u306f\u3044\u3063\u305f\u3093\u6b62\u3081\u307e\u3059\u3002"
    return "\u627f\u77e5\u3057\u307e\u3057\u305f\u3002\u3044\u3063\u305f\u3093\u53d6\u308a\u6d88\u3057\u307e\u3059\u3002"


def is_reservation_correction(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if memory.get("pending_flow") != "reservation" and memory.get("active_topic") != "reservation":
        return False
    return any(term in text for term in RESERVATION_CORRECTION_TERMS)


def format_reservation_correction_reply() -> str:
    return "\u627f\u77e5\u3057\u307e\u3057\u305f\u3002\u4e88\u7d04\u306e\u8a71\u306f\u3044\u3063\u305f\u3093\u5916\u3057\u307e\u3059\u3002\n\u8cea\u554f\u5185\u5bb9\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002"


def is_accept_proposal_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    return any(term in text for term in ACCEPT_PROPOSAL_TERMS) and bool(
        get_recent_item_name(memory)
    )


def format_accept_proposal_reply(memory: Dict[str, Any]) -> str:
    item_name = get_recent_item_name(memory) or "\u305d\u3061\u3089"
    return f"\u304b\u3057\u3053\u307e\u308a\u307e\u3057\u305f\u3002{item_name}\u3067\u627f\u308a\u307e\u3059\u3002"


def is_previous_price_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    return any(term in text for term in PREVIOUS_PRICE_TERMS) and bool(
        get_recent_item_name(memory)
    )


def is_other_recommendation_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if memory.get("active_topic") not in {"recommendation", "menu"}:
        return False
    return any(term in text for term in OTHER_RECOMMENDATION_TERMS)


def format_other_recommendation_reply() -> str:
    return OTHER_RECOMMENDATION_REPLY


def is_what_available_request(message: str, memory: Dict[str, Any]) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if memory.get("active_topic") not in {"recommendation", "menu", "store_info", "restaurant"}:
        return False
    return any(term in text for term in WHAT_AVAILABLE_TERMS)


def format_what_available_reply() -> str:
    return WHAT_AVAILABLE_MENU_REPLY


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
    if memory.get("last_assistant_action") not in {
        "answered_product_existence",
        "confirmed_order_item",
    }:
        return False
    if not get_recent_item_name(memory):
        return False

    normalized = message.strip().replace("　", "")
    if not normalized:
        return False
    if len(normalized) > 24:
        return False

    return any(term in normalized for term in SHORT_ORDER_CONFIRMATION_TERMS)


def format_short_order_confirmation(memory: Dict[str, Any]) -> str:
    item_name = get_recent_item_name(memory) or "ご注文"
    if memory.get("last_assistant_action") == "confirmed_order_item":
        return f"かしこまりました。{item_name}をもう1つですね。"
    return f"かしこまりました。{item_name}1つですね。ご注文内容として控えました。"
