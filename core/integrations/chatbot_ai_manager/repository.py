"""File-backed repository for manually managed sales strategies."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from .schemas import PriorityProduct, SalesStrategy


class SalesStrategyRepository:
    """Store sales strategies behind a swappable repository boundary."""

    def __init__(self, path: str | Path = "outputs/ai_manager_sales_strategies.json") -> None:
        self.path = Path(path)

    def list(self, include_inactive: bool = True) -> List[SalesStrategy]:
        strategies = [self._strategy_from_dict(item) for item in self._read_all()]
        if include_inactive:
            return strategies
        return [strategy for strategy in strategies if strategy.active]

    def get(self, strategy_id: str) -> Optional[SalesStrategy]:
        for strategy in self.list(include_inactive=True):
            if strategy.strategy_id == strategy_id:
                return strategy
        return None

    def save(self, strategy: SalesStrategy) -> SalesStrategy:
        items = self._read_all()
        serialized = self._strategy_to_dict(strategy)
        replaced = False
        for index, item in enumerate(items):
            if item.get("strategy_id") == strategy.strategy_id:
                items[index] = serialized
                replaced = True
                break
        if not replaced:
            items.append(serialized)
        self._write_all(items)
        return strategy

    def _read_all(self) -> List[Dict[str, Any]]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            data = data.get("strategies", [])
        if not isinstance(data, list):
            raise ValueError("sales strategy storage must contain a list")
        return [item for item in data if isinstance(item, dict)]

    def _write_all(self, items: List[Dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        payload = {"strategies": items}
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        tmp_path.replace(self.path)

    def _strategy_to_dict(self, strategy: SalesStrategy) -> Dict[str, Any]:
        return asdict(strategy)

    def _strategy_from_dict(self, data: Dict[str, Any]) -> SalesStrategy:
        products = []
        for product in data.get("priority_products", []) or []:
            if not isinstance(product, dict):
                continue
            products.append(
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

        return SalesStrategy(
            strategy_id=str(data.get("strategy_id", "")),
            name=str(data.get("name", "")),
            priority_products=tuple(products),
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
