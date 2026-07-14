"""Safety rules for using AI manager sales policy inside chatbot replies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from .schemas import ConversationSalesContext, PriorityProduct, SalesStrategy


BLOCKED_PENDING_FLOWS = frozenset({"reservation", "banquet", "allergy", "order_confirm"})
BLOCKED_ASSISTANT_ACTIONS = frozenset(
    {"confirmed_order_item", "answered_product_existence"}
)


def normalize_key(value: str) -> str:
    return value.strip().lower()


def product_was_declined(product: PriorityProduct, declined_products: Iterable[str]) -> bool:
    declined = {normalize_key(item) for item in declined_products}
    return normalize_key(product.product_id) in declined or normalize_key(product.name) in declined


def product_was_proposed(product: PriorityProduct, proposed_items: Iterable[str]) -> bool:
    proposed = {normalize_key(item) for item in proposed_items}
    return normalize_key(product.product_id) in proposed or normalize_key(product.name) in proposed


def product_was_avoided(product: PriorityProduct, avoided_items: Iterable[str]) -> bool:
    avoided = {normalize_key(item) for item in avoided_items}
    return normalize_key(product.product_id) in avoided or normalize_key(product.name) in avoided


def product_matches_any(product: PriorityProduct, values: Iterable[str]) -> bool:
    keys = {normalize_key(value) for value in values if normalize_key(value)}
    product_keys = {normalize_key(product.product_id), normalize_key(product.name)}
    if product_keys & keys:
        return True
    return any(
        key and product_key and (key in product_key or product_key in key)
        for key in keys
        for product_key in product_keys
    )


@dataclass(frozen=True)
class CandidateScore:
    product: PriorityProduct
    final_score: int
    adjustments: tuple[str, ...] = ()


def trigger_matches(
    product: PriorityProduct, context: ConversationSalesContext, strategy: SalesStrategy
) -> bool:
    if not product.suggest_when and not product.trigger_item_ids:
        return context.recommendation_requested

    signals = {
        normalize_key(context.message),
        normalize_key(context.active_topic),
        normalize_key(context.detected_intent),
        normalize_key(context.current_entity),
        normalize_key(context.time_slot),
    }
    signals.update(normalize_key(item) for item in context.ordered_items)
    signals.update(normalize_key(item) for item in context.last_ordered_items)

    for trigger in (*product.suggest_when, *product.trigger_item_ids):
        key = normalize_key(trigger)
        if key in signals:
            return True
        if key and any(key in signal or signal in key for signal in signals if signal):
            return True
    return False


def score_candidate(
    product: PriorityProduct,
    context: ConversationSalesContext,
) -> CandidateScore:
    score = int(product.priority_score or 0)
    adjustments: list[str] = [f"base_strategy_priority:{score}"]

    if product_matches_any(product, context.last_ordered_items):
        score += 12
        adjustments.append("repeat_order_affinity:+12")
    if product_matches_any(product, context.last_recommended_items):
        score -= 6
        adjustments.append("recent_recommendation_penalty:-6")
    if product_matches_any(product, context.recommendation_history):
        score -= 4
        adjustments.append("recommendation_history_penalty:-4")
    for item, count in context.order_counts_by_product.items():
        if product_matches_any(product, (item,)) and int(count or 0) > 1:
            bonus = min(12, 4 * int(count or 0))
            score += bonus
            adjustments.append(f"repeat_count_affinity:+{bonus}")
            break
    if context.current_entity and trigger_matches(product, context, SalesStrategy(strategy_id="_")):
        score += 8
        adjustments.append("topic_relevance:+8")
    if context.different_from_previous_requested:
        score += 5
        adjustments.append("different_from_previous_bonus:+5")

    return CandidateScore(
        product=product,
        final_score=score,
        adjustments=tuple(adjustments),
    )


def find_eligible_product(
    context: ConversationSalesContext, strategy: SalesStrategy
) -> Optional[PriorityProduct]:
    scored_products: list[CandidateScore] = []
    for product in strategy.priority_products:
        if context.detected_intent and context.detected_intent in product.excluded_intents:
            continue
        if product_was_declined(product, context.declined_products):
            continue
        if product_was_declined(product, context.customer_memory_declined_products):
            continue
        if product_was_avoided(product, context.avoided_items):
            continue
        if product_was_proposed(product, context.proposed_items):
            continue
        if context.different_from_previous_requested and product_matches_any(
            product,
            (*context.last_ordered_items[:2], *context.last_recommended_items[:2]),
        ):
            continue
        if not trigger_matches(product, context, strategy):
            continue
        scored_products.append(score_candidate(product, context))
    if not scored_products:
        return None
    scored_products.sort(
        key=lambda candidate: (
            candidate.final_score,
            candidate.product.priority_score,
            candidate.product.product_id,
        ),
        reverse=True,
    )
    return scored_products[0].product
