"""Conversation routing helpers.

The bot should feel conversational first, and only reach for restaurant data
when the user is actually asking about the shop, menu, booking, or ordering.
These rules are intentionally conservative so existing restaurant flows keep
their current behavior.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class ConversationRoute:
    kind: str
    reason: str


STORE_KEYWORDS = (
    "おおつき",
    "大月",
    "食事処",
    "店",
    "店舗",
    "メニュー",
    "定食",
    "ランチ",
    "刺身",
    "寿司",
    "焼き鳥",
    "天ぷら",
    "揚げ物",
    "ビール",
    "酒",
    "お酒",
    "日本酒",
    "焼酎",
    "ハイボール",
    "酎ハイ",
    "チューハイ",
    "サワー",
    "つまみ",
    "おつまみ",
    "弁当",
    "テイクアウト",
    "持ち帰り",
    "宴会",
    "コース",
    "予約",
    "飲み放題",
    "営業時間",
    "営業",
    "何時",
    "休み",
    "定休日",
    "場所",
    "住所",
    "アクセス",
    "駐車場",
    "電話",
    "LINE",
    "値段",
    "価格",
    "料金",
    "何円",
    "おすすめ",
    "注文",
    "席",
    "個室",
    "喫煙",
    "禁煙",
    "支払い",
    "カード",
    "現金",
)

LATEST_INFO_KEYWORDS = (
    "今日の天気",
    "天気",
    "ニュース",
    "最新",
    "株価",
    "為替",
    "試合",
    "結果",
    "大谷",
)

TIME_WORDS = (
    "昨日",
    "今日",
    "明日",
    "今朝",
    "今夜",
    "さっき",
)

EXTERNAL_INFO_KEYWORDS = (
    "天気",
    "ニュース",
    "株価",
    "為替",
    "試合",
    "結果",
    "大谷",
    "速報",
    "順位",
)

RESERVATION_FLOW_KEYWORDS = (
    "予約",
    "宴会",
    "コース",
    "飲み放題",
    "個室",
    "席",
    "人数",
    "20人",
    "10人",
)

MENU_TOPIC_KEYWORDS = (
    "メニュー",
    "定食",
    "ランチ",
    "刺身",
    "寿司",
    "焼き鳥",
    "天ぷら",
    "揚げ物",
    "値段",
    "価格",
    "料金",
    "何円",
)

RECOMMENDATION_TOPIC_KEYWORDS = (
    "おすすめ",
    "どれがいい",
    "選んで",
    "迷って",
    "相談",
)

ORDER_FLOW_KEYWORDS = (
    "注文",
    "ください",
    "下さい",
    "お願い",
    "お願いします",
    "頼む",
    "頼みたい",
    "一つ",
    "1つ",
    "ひとつ",
    "にする",
    "それで",
    "弁当",
    "テイクアウト",
    "持ち帰り",
)

FOLLOWUP_MARKERS = (
    "それ",
    "その",
    "さっき",
    "さっきの",
    "続き",
    "件",
    "話",
    "じゃあ",
    "じゃ",
    "あと",
    "それで",
    "ちなみに",
    "で、",
    "それなら",
    "この前",
)

FLOW_SLOT_KEYWORDS = (
    "人",
    "名",
    "円",
    "月",
    "日",
    "時",
    "夜",
    "昼",
    "個室",
    "席",
    "飲み放題",
    "コース",
    "予算",
    "大人",
    "子ども",
)

TOPIC_SHIFT_KEYWORDS = (
    "話変わる",
    "話を変える",
    "別件",
    "ところで",
    "それは置いといて",
    "関係ないけど",
    "予約の話はまた後で",
    "また後で",
)

CANCEL_FLOW_KEYWORDS = (
    "やっぱりやめる",
    "やめます",
    "キャンセル",
    "取り消し",
    "中止",
    "なしで",
    "また今度",
)

SMALLTALK_KEYWORDS = (
    "こんにちは",
    "こんばんは",
    "おはよう",
    "ありがとう",
    "ありがと",
    "暑い",
    "寒い",
    "疲れた",
    "眠い",
    "元気",
    "雑談",
    "話そう",
    "聞いて",
    "うれしい",
    "悲しい",
    "すごい",
    "なるほど",
)

GENERAL_HELP_KEYWORDS = (
    "とは",
    "どう思う",
    "教えて",
    "説明して",
    "相談",
    "アイデア",
    "文章",
    "メール",
    "翻訳",
    "要約",
)

QUESTION_MARKERS = (
    "?",
    "？",
    "ある",
    "あります",
    "できる",
    "できます",
    "ですか",
    "ますか",
    "何",
    "どこ",
    "いつ",
    "いくら",
    "何円",
    "教えて",
    "知りたい",
    "見せて",
)

CASUAL_STATUS_PATTERNS = (
    "待って",
    "待ってる",
    "待っています",
    "向かって",
    "向かいます",
    "着いた",
    "着きました",
    "います",
    "いるよ",
    "いるね",
    "前にいる",
    "行くね",
    "行きます",
    "あとで",
    "また",
)

RESERVATION_SLOT_KEYS = (
    "date",
    "time",
    "people",
    "course",
    "budget",
    "room_preference",
    "name",
    "phone",
)


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    lower_text = text.lower()
    return any(keyword.lower() in lower_text for keyword in keywords)


def _history_contains_any(
    messages: Iterable[str] | None,
    keywords: tuple[str, ...],
) -> bool:
    if not messages:
        return False
    return any(_contains_any(message or "", keywords) for message in messages)


def _is_latest_information_request(text: str) -> bool:
    if _contains_any(text, LATEST_INFO_KEYWORDS):
        return True
    return _contains_any(text, TIME_WORDS) and _contains_any(
        text, EXTERNAL_INFO_KEYWORDS
    )


def _is_contextual_followup(text: str) -> bool:
    if _contains_any(text, FOLLOWUP_MARKERS):
        return True
    if len(text) <= 24 and not _contains_any(text, QUESTION_MARKERS):
        return True
    return False


def _is_flow_slot_message(text: str) -> bool:
    return _contains_any(text, FLOW_SLOT_KEYWORDS)


def _is_explicit_natural_turn(text: str) -> bool:
    return _contains_any(text, SMALLTALK_KEYWORDS) or _contains_any(
        text, TOPIC_SHIFT_KEYWORDS
    )


def _is_flow_cancel_or_pause(text: str) -> bool:
    return _contains_any(text, CANCEL_FLOW_KEYWORDS) or _contains_any(
        text, TOPIC_SHIFT_KEYWORDS
    )


def _default_reservation_slots() -> dict[str, Any]:
    return {key: None for key in RESERVATION_SLOT_KEYS}


def extract_reservation_slots(message: str) -> dict[str, Any]:
    """Extract lightweight reservation details without pretending to be NLP."""
    text = (message or "").strip()
    slots: dict[str, Any] = {}

    people_match = re.search(r"(\d+)\s*(?:人|名)", text)
    if people_match:
        slots["people"] = int(people_match.group(1))

    budget_match = re.search(r"(\d{1,3}(?:,\d{3})+|\d{3,6})\s*円", text)
    if budget_match:
        slots["budget"] = int(budget_match.group(1).replace(",", ""))

    date_match = re.search(r"(\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*日)", text)
    if date_match:
        slots["date"] = re.sub(r"\s+", "", date_match.group(1))
    elif _contains_any(text, ("今日", "明日", "明後日", "今週", "来週")):
        for keyword in ("今日", "明日", "明後日", "今週", "来週"):
            if keyword in text:
                slots["date"] = keyword
                break

    time_match = re.search(r"(\d{1,2})\s*時", text)
    if time_match:
        slots["time"] = f"{int(time_match.group(1))}時"
    elif _contains_any(text, ("昼", "夜", "夕方", "ランチ")):
        for keyword in ("昼", "夜", "夕方", "ランチ"):
            if keyword in text:
                slots["time"] = keyword
                break

    if "個室" in text:
        slots["room_preference"] = "個室"

    course_match = re.search(r"(\d{3,5})\s*円\s*コース", text)
    if course_match:
        slots["course"] = f"{int(course_match.group(1))}円コース"
    elif "飲み放題" in text:
        slots["course"] = "飲み放題"

    phone_match = re.search(r"0\d{1,4}-?\d{1,4}-?\d{3,4}", text)
    if phone_match:
        slots["phone"] = phone_match.group(0)

    return slots


def classify_conversation_route(
    message: str,
    recent_messages: Iterable[str] | None = None,
    active_topic: str | None = None,
    pending_flow: str | None = None,
) -> ConversationRoute:
    """Classify whether a user turn needs restaurant tools or natural chat."""
    text = (message or "").strip()
    if not text:
        return ConversationRoute("empty", "empty_message")

    flow = (pending_flow or "").strip().lower()
    topic = (active_topic or "").strip().lower()

    if flow in {"reservation", "banquet", "order", "takeout"}:
        if _is_flow_cancel_or_pause(text) and _is_latest_information_request(text):
            return ConversationRoute("latest", f"topic_shift_latest_from:{flow}")
        if _is_flow_cancel_or_pause(text):
            return ConversationRoute("natural", f"flow_paused:{flow}")
        if _is_explicit_natural_turn(text):
            return ConversationRoute("natural", f"topic_shift_from:{flow}")
        if _is_contextual_followup(text) or _is_flow_slot_message(text):
            return ConversationRoute("store", f"pending_flow:{flow}")

    if topic in {"reservation", "banquet", "order", "takeout"}:
        if _is_flow_cancel_or_pause(text) and _is_latest_information_request(text):
            return ConversationRoute("latest", f"topic_shift_latest_from:{topic}")
        if _is_flow_cancel_or_pause(text):
            return ConversationRoute("natural", f"flow_paused:{topic}")
        if _is_explicit_natural_turn(text):
            return ConversationRoute("natural", f"topic_shift_from:{topic}")
        if _is_contextual_followup(text) or _is_flow_slot_message(text):
            return ConversationRoute("store", f"active_topic:{topic}")

    if topic in {"restaurant", "menu", "recommendation"} and _is_contextual_followup(
        text
    ):
        return ConversationRoute("store", f"active_topic:{topic}")

    if topic == "natural" and _is_contextual_followup(text):
        return ConversationRoute("natural", "active_topic:natural")

    if topic == "latest" and _is_contextual_followup(text):
        return ConversationRoute("latest", "active_topic:latest")

    if _history_contains_any(recent_messages, ("予約", "宴会", "コース", "人数")):
        if _contains_any(text, ("人", "名", "円", "月", "日", "夜", "昼", "個室")):
            return ConversationRoute("store", "recent_store_consultation")

    has_store_keyword = _contains_any(text, STORE_KEYWORDS)
    has_question_marker = _contains_any(text, QUESTION_MARKERS)

    if (
        has_store_keyword
        and not has_question_marker
        and _contains_any(text, CASUAL_STATUS_PATTERNS)
    ):
        return ConversationRoute("natural", "store_keyword_in_status_update")

    if has_store_keyword:
        return ConversationRoute("store", "store_keyword")

    if _is_explicit_natural_turn(text):
        return ConversationRoute("natural", "smalltalk_keyword")

    if _is_latest_information_request(text):
        return ConversationRoute("latest", "latest_info_keyword")

    if _contains_any(text, GENERAL_HELP_KEYWORDS):
        return ConversationRoute("natural", "general_help_keyword")

    # Short utterances without a shop keyword are usually conversational turns.
    if len(text) <= 30 and not any(mark in text for mark in ("?", "？")):
        return ConversationRoute("natural", "short_non_question")

    # Keep ambiguous questions in the existing store/RAG pipeline. That is safer
    # for a restaurant bot because many user questions are menu questions.
    return ConversationRoute("store", "fallback_existing_pipeline")


def should_use_natural_chat(
    message: str,
    recent_messages: Iterable[str] | None = None,
    active_topic: str | None = None,
    pending_flow: str | None = None,
) -> bool:
    return (
        classify_conversation_route(
            message,
            recent_messages=recent_messages,
            active_topic=active_topic,
            pending_flow=pending_flow,
        ).kind
        == "natural"
    )


def should_search_standard_answer(
    message: str,
    recent_messages: Iterable[str] | None = None,
    active_topic: str | None = None,
    pending_flow: str | None = None,
) -> bool:
    """Return true only for clear restaurant FAQ-style questions."""
    route = classify_conversation_route(
        message,
        recent_messages=recent_messages,
        active_topic=active_topic,
        pending_flow=pending_flow,
    )
    if route.kind != "store":
        return False
    text = (message or "").strip()
    return _contains_any(text, QUESTION_MARKERS)


def infer_memory_updates(
    message: str,
    route: ConversationRoute,
    current_memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return lightweight state updates for the next routing decision."""
    text = (message or "").strip()
    updates: dict[str, Any] = {}
    current_memory = current_memory or {}

    if route.reason.startswith(("flow_paused:", "topic_shift_from:")):
        updates["active_topic"] = "natural"
        updates["pending_flow"] = ""
        return updates

    if route.reason.startswith("topic_shift_latest_from:"):
        updates["active_topic"] = "latest"
        updates["pending_flow"] = ""
        return updates

    if route.kind == "store" and _contains_any(text, RESERVATION_FLOW_KEYWORDS):
        updates["active_topic"] = "reservation"
        updates["pending_flow"] = "reservation"
        slots = dict(
            current_memory.get("reservation_slots") or _default_reservation_slots()
        )
        slots.update(extract_reservation_slots(text))
        updates["reservation_slots"] = slots
    elif route.kind == "store" and _contains_any(text, ORDER_FLOW_KEYWORDS):
        updates["active_topic"] = "order"
        updates["pending_flow"] = "order"
    elif route.kind == "store" and (
        current_memory.get("pending_flow") == "reservation"
        or current_memory.get("active_topic") == "reservation"
        or route.reason.startswith(("pending_flow:reservation", "active_topic:reservation"))
    ):
        updates["active_topic"] = "reservation"
        updates["pending_flow"] = "reservation"
        slots = dict(
            current_memory.get("reservation_slots") or _default_reservation_slots()
        )
        slots.update(extract_reservation_slots(text))
        updates["reservation_slots"] = slots
    elif route.kind == "store" and _contains_any(text, MENU_TOPIC_KEYWORDS):
        updates["active_topic"] = "menu"
    elif route.kind == "store" and _contains_any(text, RECOMMENDATION_TOPIC_KEYWORDS):
        updates["active_topic"] = "recommendation"
    elif route.kind == "store":
        updates["active_topic"] = "restaurant"
    elif route.kind == "natural":
        updates["active_topic"] = "natural"
        updates["pending_flow"] = ""
    elif route.kind == "latest":
        updates["active_topic"] = route.kind
        updates["pending_flow"] = ""

    return updates
