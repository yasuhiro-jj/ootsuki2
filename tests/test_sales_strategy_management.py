import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from core.integrations.chatbot_ai_manager import (
    SalesStrategyManagementService,
    SalesStrategyRepository,
    SalesStrategyValidationError,
)


def make_payload(**overrides):
    payload = {
        "strategy_id": "strategy_test_dinner",
        "name": "Dinner sashimi pairing",
        "active": True,
        "valid_from": "2026-07-11T17:00:00+09:00",
        "valid_until": "2026-07-11T21:00:00+09:00",
        "sales_goal": "Move one priority sake item during dinner",
        "max_suggestions_per_session": 1,
        "priority_products": [
            {
                "product_id": "sake_fuji_001",
                "product_name": "Fuji sake",
                "priority": 90,
                "reason": "High margin and pairs with sashimi",
                "trigger_item_ids": ["sashimi_001"],
                "excluded_intents": ["faq", "availability_check"],
            }
        ],
    }
    payload.update(overrides)
    return payload


class SalesStrategyManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = Path(self.temp_dir.name) / "sales_strategies.json"
        self.repository = SalesStrategyRepository(self.path)
        self.service = SalesStrategyManagementService(self.repository)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_create_sales_strategy(self):
        strategy = self.service.create(make_payload())

        self.assertEqual(strategy.strategy_id, "strategy_test_dinner")
        self.assertEqual(strategy.name, "Dinner sashimi pairing")
        self.assertEqual(strategy.priority_products[0].product_id, "sake_fuji_001")
        self.assertEqual(strategy.priority_products[0].priority_score, 90)
        self.assertTrue(self.path.exists())

    def test_get_sales_strategy(self):
        self.service.create(make_payload())

        strategy = self.service.get("strategy_test_dinner")

        self.assertIsNotNone(strategy)
        self.assertEqual(strategy.strategy_id, "strategy_test_dinner")

    def test_update_sales_strategy(self):
        self.service.create(make_payload())

        updated = self.service.update(
            "strategy_test_dinner",
            {"name": "Updated dinner strategy", "max_suggestions_per_session": 2},
        )

        self.assertEqual(updated.name, "Updated dinner strategy")
        self.assertEqual(updated.max_suggestions_per_session, 2)
        self.assertEqual(updated.priority_products[0].product_id, "sake_fuji_001")

    def test_deactivate_sales_strategy(self):
        self.service.create(make_payload())

        strategy = self.service.set_active("strategy_test_dinner", False)

        self.assertFalse(strategy.active)
        self.assertEqual(self.service.list(include_inactive=False), [])

    def test_expired_strategy_is_not_current(self):
        self.service.create(
            make_payload(
                valid_from="2026-07-10T17:00:00+09:00",
                valid_until="2026-07-10T21:00:00+09:00",
            )
        )

        strategy = self.service.get_current(
            now=datetime.fromisoformat("2026-07-11T18:00:00+09:00")
        )

        self.assertIsNone(strategy)

    def test_future_strategy_is_not_current(self):
        self.service.create(
            make_payload(
                valid_from="2099-07-11T17:00:00+09:00",
                valid_until="2099-07-11T21:00:00+09:00",
            )
        )

        strategy = self.service.get_current(
            now=datetime.fromisoformat("2026-07-11T18:00:00+09:00")
        )

        self.assertIsNone(strategy)

    def test_inactive_strategy_is_not_current(self):
        self.service.create(make_payload(active=False))

        strategy = self.service.get_current(
            now=datetime.fromisoformat("2026-07-11T18:00:00+09:00")
        )

        self.assertIsNone(strategy)

    def test_valid_japan_time_window_returns_current(self):
        self.service.create(make_payload())

        strategy = self.service.get_current(
            now=datetime.fromisoformat("2026-07-11T18:00:00+09:00")
        )

        self.assertIsNotNone(strategy)
        self.assertEqual(strategy.strategy_id, "strategy_test_dinner")

    def test_valid_until_must_be_after_valid_from(self):
        with self.assertRaises(SalesStrategyValidationError):
            self.service.create(
                make_payload(
                    valid_from="2026-07-11T21:00:00+09:00",
                    valid_until="2026-07-11T17:00:00+09:00",
                )
            )

    def test_rejects_duplicate_product_id(self):
        payload = make_payload()
        payload["priority_products"].append(dict(payload["priority_products"][0]))

        with self.assertRaises(SalesStrategyValidationError):
            self.service.create(payload)

    def test_rejects_missing_product_name(self):
        payload = make_payload()
        payload["priority_products"][0]["product_name"] = ""

        with self.assertRaises(SalesStrategyValidationError):
            self.service.create(payload)

    def test_storage_failure_does_not_touch_chatbot_runtime(self):
        directory_path = Path(self.temp_dir.name) / "not_a_file"
        directory_path.mkdir()
        broken_service = SalesStrategyManagementService(
            SalesStrategyRepository(directory_path)
        )

        with self.assertRaises(Exception):
            broken_service.create(make_payload())


if __name__ == "__main__":
    unittest.main()
