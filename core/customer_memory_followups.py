"""Explicit customer-memory follow-up replies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .customer_memory import (
    CONSENT_DENIED,
    CONSENT_GRANTED,
    CONSENT_UNKNOWN,
    CustomerMemoryContext,
)


INTENT_PREVIOUS_ORDER = "previous_order_query"
INTENT_PREVIOUS_RECOMMENDATION = "previous_recommendation_query"
INTENT_USUAL_ITEM = "usual_item_query"
INTENT_DIFFERENT_FROM_PREVIOUS = "different_from_previous_request"

DIFFERENT_ITEM_CANDIDATES = (
    "唐揚げ定食",
    "豚肉のにんにく炒め",
    "焼魚定食",
    "冷奴",
)


@dataclass(frozen=True)
class CustomerMemoryFollowupReply:
    intent: str
    message: str
    memory_used: bool = False


def detect_customer_memory_followup_intent(message: str) -> str:
    text = (message or "").strip()
    if not text:
        return ""
    if any(
        term in text
        for term in (
            "前回何を頼んだ",
            "前に頼んだ",
            "前回の注文",
            "前回頼んだ",
        )
    ):
        return INTENT_PREVIOUS_ORDER
    if any(
        term in text
        for term in (
            "前におすすめされた",
            "前回何をおすすめ",
            "前回おすすめ",
            "前のおすすめ",
        )
    ):
        return INTENT_PREVIOUS_RECOMMENDATION
    if "いつもの" in text:
        return INTENT_USUAL_ITEM
    if any(
        term in text
        for term in (
            "前とは違う",
            "前回とは別",
            "前と違う",
            "別のものがいい",
        )
    ):
        return INTENT_DIFFERENT_FROM_PREVIOUS
    return ""


def build_customer_memory_followup_reply(
    message: str,
    context: CustomerMemoryContext,
    session_memory: Optional[Dict[str, object]] = None,
) -> Optional[CustomerMemoryFollowupReply]:
    intent = detect_customer_memory_followup_intent(message)
    if not intent:
        return None
    if not context.memory_available:
        return CustomerMemoryFollowupReply(intent, "前回の履歴を今は確認できません。")
    if context.consent_status == CONSENT_UNKNOWN:
        return CustomerMemoryFollowupReply(
            intent,
            "前回のご利用内容を会話に使うには、履歴利用への同意が必要です。",
        )
    if context.consent_status == CONSENT_DENIED:
        return CustomerMemoryFollowupReply(
            intent,
            "過去のご利用内容は、現在の設定では会話に利用していません。",
        )
    if context.consent_status != CONSENT_GRANTED:
        return CustomerMemoryFollowupReply(intent, "前回の履歴を今は確認できません。")

    if intent == INTENT_PREVIOUS_ORDER:
        return CustomerMemoryFollowupReply(
            intent,
            _previous_order_message(context),
            memory_used=bool(context.recent_ordered_items),
        )
    if intent == INTENT_PREVIOUS_RECOMMENDATION:
        return CustomerMemoryFollowupReply(
            intent,
            _previous_recommendation_message(context),
            memory_used=bool(context.recent_recommended_items),
        )
    if intent == INTENT_USUAL_ITEM:
        return CustomerMemoryFollowupReply(
            intent,
            _usual_item_message(context),
            memory_used=True,
        )
    if intent == INTENT_DIFFERENT_FROM_PREVIOUS:
        return CustomerMemoryFollowupReply(
            intent,
            _different_from_previous_message(context, session_memory or {}),
            memory_used=True,
        )
    return None


def _previous_order_message(context: CustomerMemoryContext) -> str:
    items = tuple(context.recent_ordered_items[:2])
    if not items:
        return "前回の注文履歴は、まだ確認できません。"
    return f"前回は{_join_items(items)}をご注文いただいています。"


def _previous_recommendation_message(context: CustomerMemoryContext) -> str:
    items = tuple(context.recent_recommended_items[:2])
    if not items:
        return "前回のおすすめ履歴は、まだ確認できません。"
    return f"前回は{_join_items(items)}をご案内しています。"


def _usual_item_message(context: CustomerMemoryContext) -> str:
    if not context.order_counts:
        return "まだ「いつもの」と言えるほどの履歴はありません。\nご希望の商品を教えてください。"
    top_count = max(context.order_counts.values())
    top_items = [item for item, count in context.order_counts.items() if count == top_count]
    if top_count < 2:
        return "まだ「いつもの」と言えるほどの履歴はありません。\nご希望の商品を教えてください。"
    if len(top_items) > 1:
        return "よくご注文いただいている候補が複数あります。\nご希望の商品を教えてください。"
    return f"よくご注文いただいているのは{top_items[0]}です。\nこちらでよろしいですか？"


def _different_from_previous_message(
    context: CustomerMemoryContext,
    session_memory: Dict[str, object],
) -> str:
    excluded = set(context.recent_ordered_items[:2])
    excluded.update(context.recent_recommended_items[:2])
    excluded.update(context.declined_product_names)
    session_suggestions = session_memory.get("suggested_product_ids") or ()
    excluded.update(str(item) for item in session_suggestions)
    for candidate in DIFFERENT_ITEM_CANDIDATES:
        if candidate not in excluded:
            return f"前回とは別でしたら、{candidate}がおすすめです。"
    return "前回と違う候補をすぐには絞れませんでした。\n魚料理かお肉料理か教えてください。"


def _join_items(items: tuple[str, ...]) -> str:
    if len(items) == 1:
        return items[0]
    return "と".join(items)
