"""Management service for manual AI manager sales strategies."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from .repository import SalesStrategyRepository
from .schemas import PriorityProduct, SalesStrategy


class SalesStrategyValidationError(ValueError):
    """Raised when a manual sales strategy is not valid."""


class SalesStrategyManagementService:
    def __init__(self, repository: SalesStrategyRepository) -> None:
        self.repository = repository

    def create(self, data: Dict[str, Any]) -> SalesStrategy:
        now = _now_iso()
        payload = dict(data)
        payload.setdefault("strategy_id", f"strategy_{uuid4().hex[:12]}")
        payload.setdefault("created_at", now)
        payload["updated_at"] = now
        strategy = self._strategy_from_payload(payload)
        self._validate(strategy)
        return self.repository.save(strategy)

    def update(self, strategy_id: str, data: Dict[str, Any]) -> SalesStrategy:
        existing = self.repository.get(strategy_id)
        if not existing:
            raise KeyError(strategy_id)
        merged = _strategy_to_payload(existing)
        merged.update(data)
        merged["strategy_id"] = strategy_id
        merged["created_at"] = existing.created_at
        merged["updated_at"] = _now_iso()
        strategy = self._strategy_from_payload(merged)
        self._validate(strategy)
        return self.repository.save(strategy)

    def set_active(self, strategy_id: str, active: bool) -> SalesStrategy:
        return self.update(strategy_id, {"active": active})

    def list(self, include_inactive: bool = True) -> List[SalesStrategy]:
        return self.repository.list(include_inactive=include_inactive)

    def get(self, strategy_id: str) -> Optional[SalesStrategy]:
        return self.repository.get(strategy_id)

    def get_current(self, now: Optional[datetime] = None) -> Optional[SalesStrategy]:
        current_time = now or datetime.now(timezone.utc)
        candidates = [
            strategy
            for strategy in self.repository.list(include_inactive=False)
            if self._is_current(strategy, current_time)
        ]
        if not candidates:
            return None
        return sorted(
            candidates,
            key=lambda strategy: (
                max((product.priority_score for product in strategy.priority_products), default=0),
                strategy.updated_at,
                strategy.valid_from,
            ),
            reverse=True,
        )[0]

    def _strategy_from_payload(self, data: Dict[str, Any]) -> SalesStrategy:
        return SalesStrategy(
            strategy_id=str(data.get("strategy_id", "")),
            name=str(data.get("name", "")),
            priority_products=tuple(_products_from_payload(data.get("priority_products", []))),
            sales_goal=str(data.get("sales_goal", "")),
            active=bool(data.get("active", True)),
            valid_from=str(data.get("valid_from", "")),
            valid_until=str(data.get("valid_until", "")),
            max_suggestions_per_session=int(data.get("max_suggestions_per_session", 1) or 1),
            allowed_topics=tuple(data.get("allowed_topics", ()) or ()),
            blocked_intents=tuple(data.get("blocked_intents", ()) or ()),
            generated_by=str(data.get("generated_by", "manual")),
            created_at=str(data.get("created_at", "")),
            updated_at=str(data.get("updated_at", "")),
        )

    def _validate(self, strategy: SalesStrategy) -> None:
        if not strategy.strategy_id.strip():
            raise SalesStrategyValidationError("strategy_id is required")
        if not strategy.name.strip():
            raise SalesStrategyValidationError("name is required")
        if strategy.max_suggestions_per_session < 1:
            raise SalesStrategyValidationError("max_suggestions_per_session must be at least 1")
        valid_from = _parse_datetime(strategy.valid_from, "valid_from")
        valid_until = _parse_datetime(strategy.valid_until, "valid_until")
        if valid_until <= valid_from:
            raise SalesStrategyValidationError("valid_until must be after valid_from")
        if not strategy.priority_products:
            raise SalesStrategyValidationError("priority_products is required")

        seen_product_ids = set()
        for product in strategy.priority_products:
            if not product.product_id.strip():
                raise SalesStrategyValidationError("product_id is required")
            if not product.name.strip():
                raise SalesStrategyValidationError("product_name is required")
            if not 0 <= product.priority_score <= 100:
                raise SalesStrategyValidationError("priority must be between 0 and 100")
            if product.max_suggestions < 1:
                raise SalesStrategyValidationError("product max_suggestions must be at least 1")
            if product.product_id in seen_product_ids:
                raise SalesStrategyValidationError("duplicate product_id in strategy")
            seen_product_ids.add(product.product_id)

    def _is_current(self, strategy: SalesStrategy, now: datetime) -> bool:
        if not strategy.active:
            return False
        valid_from = _parse_datetime(strategy.valid_from, "valid_from")
        valid_until = _parse_datetime(strategy.valid_until, "valid_until")
        return valid_from <= _ensure_aware(now) <= valid_until


def _products_from_payload(products: Iterable[Dict[str, Any]]) -> List[PriorityProduct]:
    parsed = []
    for product in products or []:
        parsed.append(
            PriorityProduct(
                product_id=str(product.get("product_id", "")),
                name=str(product.get("name") or product.get("product_name") or ""),
                priority_score=int(product.get("priority_score", product.get("priority", 0)) or 0),
                reason=str(product.get("reason", "")),
                suggest_when=tuple(product.get("suggest_when", ()) or ()),
                trigger_item_ids=tuple(product.get("trigger_item_ids", ()) or ()),
                excluded_intents=tuple(product.get("excluded_intents", ()) or ()),
                max_suggestions=int(product.get("max_suggestions", 1) or 1),
                inventory_priority=product.get("inventory_priority"),
                gross_margin_rank=product.get("gross_margin_rank"),
            )
        )
    return parsed


def _strategy_to_payload(strategy: SalesStrategy) -> Dict[str, Any]:
    return {
        "strategy_id": strategy.strategy_id,
        "name": strategy.name,
        "priority_products": [
            {
                "product_id": product.product_id,
                "product_name": product.name,
                "priority": product.priority_score,
                "reason": product.reason,
                "suggest_when": list(product.suggest_when),
                "trigger_item_ids": list(product.trigger_item_ids),
                "excluded_intents": list(product.excluded_intents),
                "max_suggestions": product.max_suggestions,
                "inventory_priority": product.inventory_priority,
                "gross_margin_rank": product.gross_margin_rank,
            }
            for product in strategy.priority_products
        ],
        "sales_goal": strategy.sales_goal,
        "active": strategy.active,
        "valid_from": strategy.valid_from,
        "valid_until": strategy.valid_until,
        "max_suggestions_per_session": strategy.max_suggestions_per_session,
        "allowed_topics": list(strategy.allowed_topics),
        "blocked_intents": list(strategy.blocked_intents),
        "generated_by": strategy.generated_by,
        "created_at": strategy.created_at,
        "updated_at": strategy.updated_at,
    }


def _parse_datetime(value: str, field_name: str) -> datetime:
    if not value:
        raise SalesStrategyValidationError(f"{field_name} is required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SalesStrategyValidationError(f"{field_name} must be ISO 8601") from exc
    return _ensure_aware(parsed)


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
