"""手動戦略と AI Manager 自動戦略の併用（優先順位・障害時の挙動）のテスト。"""

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from core.integrations.chatbot_ai_manager.composite_repository import (
    CompositeSalesStrategyRepository,
)
from core.integrations.chatbot_ai_manager.schemas import PriorityProduct, SalesStrategy
from core.integrations.chatbot_ai_manager.strategy_service import (
    SalesStrategyManagementService,
)
from core.integrations.chatbot_ai_manager.supabase_repository import (
    SupabaseSalesStrategyRepository,
)


def iso(offset_hours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=offset_hours)).isoformat()


def make_strategy(
    strategy_id: str,
    generated_by: str,
    *,
    active: bool = True,
    valid_from_hours: int = -1,
    valid_until_hours: int = 1,
    priority_score: int = 50,
) -> SalesStrategy:
    return SalesStrategy(
        strategy_id=strategy_id,
        name=strategy_id,
        active=active,
        valid_from=iso(valid_from_hours),
        valid_until=iso(valid_until_hours),
        generated_by=generated_by,
        priority_products=(
            PriorityProduct(
                product_id=f"{strategy_id}_product",
                name=f"{strategy_id} の商品",
                priority_score=priority_score,
            ),
        ),
    )


class StubSource:
    def __init__(self, strategies=(), should_raise: bool = False):
        self.strategies = list(strategies)
        self.should_raise = should_raise

    def list(self, include_inactive: bool = True):
        if self.should_raise:
            raise RuntimeError("source unavailable")
        if include_inactive:
            return list(self.strategies)
        return [strategy for strategy in self.strategies if strategy.active]

    def get(self, strategy_id: str):
        for strategy in self.strategies:
            if strategy.strategy_id == strategy_id:
                return strategy
        return None


class CompositeRepositoryTests(unittest.TestCase):
    def test_valid_manual_strategy_hides_automatic_one(self):
        manual = StubSource([make_strategy("manual_1", "manual")])
        automatic = StubSource([make_strategy("auto_1", "ai_manager_auto", priority_score=90)])
        repository = CompositeSalesStrategyRepository(manual, automatic)

        strategy_ids = [strategy.strategy_id for strategy in repository.list()]
        self.assertEqual(strategy_ids, ["manual_1"])

    def test_manual_strategy_wins_even_with_lower_priority(self):
        manual = StubSource([make_strategy("manual_1", "manual", priority_score=10)])
        automatic = StubSource([make_strategy("auto_1", "ai_manager_auto", priority_score=90)])
        service = SalesStrategyManagementService(
            CompositeSalesStrategyRepository(manual, automatic)
        )

        current = service.get_current()
        self.assertIsNotNone(current)
        self.assertEqual(current.strategy_id, "manual_1")

    def test_expired_manual_strategy_falls_back_to_automatic(self):
        expired_manual = make_strategy(
            "manual_old", "manual", valid_from_hours=-48, valid_until_hours=-24
        )
        manual = StubSource([expired_manual])
        automatic = StubSource([make_strategy("auto_1", "ai_manager_auto")])
        service = SalesStrategyManagementService(
            CompositeSalesStrategyRepository(manual, automatic)
        )

        current = service.get_current()
        self.assertIsNotNone(current)
        self.assertEqual(current.strategy_id, "auto_1")

    def test_inactive_manual_strategy_falls_back_to_automatic(self):
        manual = StubSource([make_strategy("manual_1", "manual", active=False)])
        automatic = StubSource([make_strategy("auto_1", "ai_manager_auto")])
        service = SalesStrategyManagementService(
            CompositeSalesStrategyRepository(manual, automatic)
        )

        current = service.get_current()
        self.assertIsNotNone(current)
        self.assertEqual(current.strategy_id, "auto_1")

    def test_expired_automatic_strategy_is_not_used(self):
        manual = StubSource([])
        automatic = StubSource(
            [
                make_strategy(
                    "auto_old",
                    "ai_manager_auto",
                    valid_from_hours=-48,
                    valid_until_hours=-24,
                )
            ]
        )
        service = SalesStrategyManagementService(
            CompositeSalesStrategyRepository(manual, automatic)
        )

        self.assertIsNone(service.get_current())

    def test_automatic_source_failure_keeps_manual_working(self):
        manual = StubSource([make_strategy("manual_1", "manual")])
        automatic = StubSource(should_raise=True)
        service = SalesStrategyManagementService(
            CompositeSalesStrategyRepository(manual, automatic)
        )

        current = service.get_current()
        self.assertIsNotNone(current)
        self.assertEqual(current.strategy_id, "manual_1")

    def test_both_sources_failing_returns_none(self):
        service = SalesStrategyManagementService(
            CompositeSalesStrategyRepository(
                StubSource(should_raise=True), StubSource(should_raise=True)
            )
        )

        self.assertIsNone(service.get_current())


class SupabaseRepositoryFallbackTests(unittest.TestCase):
    def test_disabled_without_dsn(self):
        repository = SupabaseSalesStrategyRepository(dsn="", tenant_key="ootsuki")
        self.assertFalse(repository.enabled)
        self.assertEqual(repository.list(), [])

    def test_uses_last_known_good_cache_when_fetch_fails(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache_path = Path(tmp_dir) / "auto_cache.json"
            cache_path.write_text(
                json.dumps(
                    {
                        "strategies": [
                            {
                                "strategy_id": "auto_cached",
                                "name": "cached",
                                "valid_from": iso(-1),
                                "valid_until": iso(1),
                                "generated_by": "ai_manager_auto",
                                "priority_products": [
                                    {
                                        "product_id": "p1",
                                        "product_name": "キャッシュ商品",
                                        "priority": 80,
                                    }
                                ],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            repository = SupabaseSalesStrategyRepository(
                dsn="postgresql://unused", tenant_key="ootsuki", cache_path=cache_path
            )

            def fail():
                raise RuntimeError("connection refused")

            repository._fetch_payloads = fail  # type: ignore[assignment]

            strategies = repository.list()
            self.assertEqual(len(strategies), 1)
            self.assertEqual(strategies[0].strategy_id, "auto_cached")
            self.assertEqual(strategies[0].priority_products[0].name, "キャッシュ商品")

    def test_returns_empty_when_no_cache_and_fetch_fails(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = SupabaseSalesStrategyRepository(
                dsn="postgresql://unused",
                tenant_key="ootsuki",
                cache_path=Path(tmp_dir) / "missing.json",
            )

            def fail():
                raise RuntimeError("connection refused")

            repository._fetch_payloads = fail  # type: ignore[assignment]

            self.assertEqual(repository.list(), [])


if __name__ == "__main__":
    unittest.main()
