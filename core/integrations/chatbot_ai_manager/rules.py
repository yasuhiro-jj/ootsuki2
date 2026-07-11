"""Safety rules for using AI manager sales policy inside chatbot replies."""

from __future__ import annotations

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


def trigger_matches(
    product: PriorityProduct, context: ConversationSalesContext, strategy: SalesStrategy
) -> bool:
    if not product.suggest_when:
        return context.recommendation_requested

    signals = {
        normalize_key(context.active_topic),
        normalize_key(context.detected_intent),
        normalize_key(context.current_entity),
        normalize_key(context.time_slot),
    }

    for trigger in product.suggest_when:
        key = normalize_key(trigger)
        if key in signals:
            return True
        if key and any(key in signal or signal in key for signal in signals if signal):
            return True
    return False


def find_eligible_product(
    context: ConversationSalesContext, strategy: SalesStrategy
) -> Optional[PriorityProduct]:
    ranked_products = sorted(
        strategy.priority_products,
        key=lambda product: product.priority_score,
        reverse=True,
    )
    for product in ranked_products:
        if product_was_declined(product, context.declined_products):
            continue
        if product_was_proposed(product, context.proposed_items):
            continue
        if not trigger_matches(product, context, strategy):
            continue
        return product
    return None
