"""Combine manually managed strategies with AI Manager generated ones.

手動戦略（JSON ファイル）が有効な間は、そちらだけを見せる。
自動戦略が人の判断を上書きしないようにするための優先順位。
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional, Protocol

from .schemas import SalesStrategy

logger = logging.getLogger(__name__)

MANUAL_GENERATED_BY = "manual"


class StrategySource(Protocol):
    def list(self, include_inactive: bool = True) -> List[SalesStrategy]: ...

    def get(self, strategy_id: str) -> Optional[SalesStrategy]: ...


def _parse_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def is_currently_valid(strategy: SalesStrategy, now: Optional[datetime] = None) -> bool:
    if not strategy.active:
        return False
    current_time = now or datetime.now(timezone.utc)
    valid_from = _parse_datetime(strategy.valid_from)
    valid_until = _parse_datetime(strategy.valid_until)
    if valid_from is None or valid_until is None:
        return False
    return valid_from <= current_time <= valid_until


class CompositeSalesStrategyRepository:
    """Manual strategies win; automatic ones are used only as a fallback."""

    def __init__(self, manual: StrategySource, automatic: StrategySource) -> None:
        self.manual = manual
        self.automatic = automatic

    def list(self, include_inactive: bool = True) -> List[SalesStrategy]:
        manual_strategies = self._safe_list(self.manual, "manual")
        if any(
            strategy.generated_by == MANUAL_GENERATED_BY and is_currently_valid(strategy)
            for strategy in manual_strategies
        ):
            # 有効な手動戦略があるので自動戦略は使わない。
            return manual_strategies if include_inactive else [
                strategy for strategy in manual_strategies if strategy.active
            ]

        automatic_strategies = self._safe_list(self.automatic, "automatic")
        combined = [*manual_strategies, *automatic_strategies]
        if include_inactive:
            return combined
        return [strategy for strategy in combined if strategy.active]

    def get(self, strategy_id: str) -> Optional[SalesStrategy]:
        for strategy in self.list(include_inactive=True):
            if strategy.strategy_id == strategy_id:
                return strategy
        return None

    def _safe_list(self, source: StrategySource, label: str) -> List[SalesStrategy]:
        try:
            return list(source.list(include_inactive=True))
        except Exception as exc:
            logger.warning(
                "[SalesStrategy] %s source unavailable (%s)",
                label,
                exc.__class__.__name__,
            )
            return []
