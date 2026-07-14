import tempfile
import unittest
from pathlib import Path

from core.customer_memory import (
    CONSENT_ACCEPTED,
    CONSENT_DENIED,
    CONSENT_GRANTED,
    CONSENT_UNKNOWN,
    EVENT_ORDER_CANCELLED,
    EVENT_ORDER_CONFIRMED,
    EVENT_RECOMMENDATION_CONVERTED,
    EVENT_RECOMMENDATION_DECLINED,
    EVENT_RECOMMENDATION_SHOWN,
    CustomerMemoryRepository,
    generate_anonymous_customer_id,
    is_valid_anonymous_customer_id,
)


class CustomerMemoryTests(unittest.TestCase):
    def test_generates_valid_anonymous_customer_id(self):
        customer_id = generate_anonymous_customer_id()

        self.assertTrue(is_valid_anonymous_customer_id(customer_id))
        self.assertTrue(customer_id.startswith("anon_"))

    def test_identify_creates_pseudonymous_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            profile = repository.identify(consent_accepted=False)

            self.assertTrue(is_valid_anonymous_customer_id(profile.anonymous_customer_id))
            self.assertEqual(profile.consent_status, CONSENT_UNKNOWN)
            self.assertEqual(profile.visit_count, 1)
            self.assertEqual(profile.favorite_items, ())
            self.assertEqual(profile.avoided_items, ())

    def test_identify_reuses_existing_profile_and_keeps_consent(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            first = repository.identify(consent_accepted=True)
            second = repository.identify(first.anonymous_customer_id, consent_accepted=False)

            self.assertEqual(second.anonymous_customer_id, first.anonymous_customer_id)
            self.assertEqual(second.consent_status, CONSENT_ACCEPTED)
            self.assertEqual(second.visit_count, 2)

    def test_update_consent_accepts_granted_and_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify()

            granted = repository.update_consent(
                anonymous_customer_id=profile.anonymous_customer_id,
                consent_status=CONSENT_GRANTED,
            )
            denied = repository.update_consent(
                anonymous_customer_id=profile.anonymous_customer_id,
                consent_status=CONSENT_DENIED,
            )

            self.assertEqual(granted.consent_status, CONSENT_GRANTED)
            self.assertEqual(denied.consent_status, CONSENT_DENIED)

    def test_update_consent_rejects_invalid_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify()

            self.assertIsNone(
                repository.update_consent(
                    anonymous_customer_id=profile.anonymous_customer_id,
                    consent_status="invalid",
                )
            )
            self.assertIsNone(
                repository.update_consent(
                    anonymous_customer_id="not-anonymous",
                    consent_status=CONSENT_GRANTED,
                )
            )

    def test_invalid_customer_id_is_not_reused(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            profile = repository.identify("customer_named_value", consent_accepted=True)

            self.assertNotEqual(profile.anonymous_customer_id, "customer_named_value")
            self.assertTrue(is_valid_anonymous_customer_id(profile.anonymous_customer_id))

    def test_get_rejects_invalid_customer_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            self.assertIsNone(repository.get("not-anonymous"))

    def test_link_session_reuses_same_customer_and_rejects_reassignment(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            first = repository.identify()
            second = repository.identify()

            initial = repository.link_session(
                session_id="session_001",
                anonymous_customer_id=first.anonymous_customer_id,
            )
            reassigned = repository.link_session(
                session_id="session_001",
                anonymous_customer_id=second.anonymous_customer_id,
            )

            self.assertIsNotNone(initial)
            self.assertIsNotNone(reassigned)
            self.assertEqual(reassigned.anonymous_customer_id, first.anonymous_customer_id)

    def test_same_customer_can_have_multiple_sessions(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify()

            repository.link_session(
                session_id="session_001",
                anonymous_customer_id=profile.anonymous_customer_id,
            )
            repository.link_session(
                session_id="session_002",
                anonymous_customer_id=profile.anonymous_customer_id,
            )
            summary = repository.get_admin_summary(profile.anonymous_customer_id)

            self.assertEqual(summary["linked_session_count"], 2)

    def test_order_event_updates_last_ordered_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify()

            event = repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="中生ビール",
                quantity=1,
            )
            updated = repository.get(profile.anonymous_customer_id)

            self.assertIsNotNone(event)
            self.assertEqual(updated.last_ordered_items, ("中生ビール",))
            self.assertEqual(updated.favorite_items, ())

    def test_recommendation_event_updates_last_recommended_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify()

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="刺身定食",
                strategy_id="strategy_001",
            )
            updated = repository.get(profile.anonymous_customer_id)

            self.assertEqual(updated.last_recommended_items, ("刺身定食",))
            self.assertEqual(updated.recommendation_history, ("刺身定食",))

    def test_recommendation_decline_is_separate_from_order_cancel(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify()

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_DECLINED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="刺身定食",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CANCELLED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="中生ビール",
            )
            updated = repository.get(profile.anonymous_customer_id)

            self.assertEqual(updated.declined_products, ("刺身定食",))
            self.assertEqual(updated.avoided_items, ())

    def test_invalid_customer_event_is_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            event = repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id="not-anonymous",
                session_id="session_001",
                product_name="中生ビール",
            )

            self.assertIsNone(event)

    def test_build_context_uses_confirmed_orders_and_separates_cancellations(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="中生ビール",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_002",
                product_name="中生ビール",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CANCELLED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_003",
                product_name="刺身定食",
            )
            context = repository.build_context(profile.anonymous_customer_id)

            self.assertEqual(context.consent_status, CONSENT_GRANTED)
            self.assertEqual(context.recent_ordered_items, ("中生ビール",))
            self.assertEqual(context.order_counts["中生ビール"], 2)
            self.assertEqual(context.order_cancelled_product_names, ("刺身定食",))

    def test_build_context_tracks_recommendations_and_declines(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="刺身定食",
            )
            repository.record_event(
                event_type=EVENT_RECOMMENDATION_DECLINED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="刺身定食",
            )
            context = repository.build_context(profile.anonymous_customer_id)

            self.assertEqual(context.recent_recommended_items, ("刺身定食",))
            self.assertEqual(context.declined_product_names, ("刺身定食",))

    def test_order_after_recommendation_records_conversion(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            shown = repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
                metadata={
                    "recommendation_source": "personalized_strategy",
                    "used_customer_memory": True,
                },
            )
            order = repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
            )
            events = repository._load_events(profile.anonymous_customer_id)
            conversions = [
                event
                for event in events
                if event.event_type == EVENT_RECOMMENDATION_CONVERTED
            ]

            self.assertIsNotNone(shown)
            self.assertIsNotNone(order)
            self.assertEqual(len(conversions), 1)
            self.assertEqual(
                conversions[0].metadata["source_recommendation_event_id"],
                shown.event_id,
            )
            self.assertEqual(conversions[0].metadata["conversion_type"], EVENT_ORDER_CONFIRMED)
            self.assertTrue(conversions[0].metadata["used_customer_memory"])

    def test_order_for_different_product_does_not_convert_recommendation(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="karaage_set",
                product_name="Karaage set",
            )
            performance = repository.aggregate_performance()

            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["summary"]["converted"], 0)
            self.assertEqual(performance["summary"]["conversion_rate"], 0.0)

    def test_order_with_product_name_only_converts_matching_recommendation(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="Sashimi set",
            )
            performance = repository.aggregate_performance()

            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["summary"]["converted"], 1)

    def test_recommendation_conversion_is_not_duplicated(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
            )
            performance = repository.aggregate_performance()

            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["summary"]["converted"], 1)

    def test_aggregate_performance_groups_by_product_and_strategy(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
            )
            performance = repository.aggregate_performance(strategy_id="strategy_001")

            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["summary"]["converted"], 1)
            self.assertEqual(performance["summary"]["conversion_rate"], 1.0)
            self.assertEqual(performance["products"][0]["product_id"], "sashimi_set")
            self.assertEqual(performance["products"][0]["converted"], 1)
            self.assertEqual(performance["strategies"][0]["strategy_id"], "strategy_001")

    def test_aggregate_performance_filters_used_customer_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                metadata={"used_customer_memory": True},
            )
            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_002",
                product_id="karaage_set",
                product_name="Karaage set",
                metadata={"used_customer_memory": False},
            )

            with_memory = repository.aggregate_performance(used_customer_memory=True)
            without_memory = repository.aggregate_performance(used_customer_memory=False)

            self.assertEqual(with_memory["summary"]["shown"], 1)
            self.assertEqual(with_memory["products"][0]["product_id"], "sashimi_set")
            self.assertEqual(without_memory["summary"]["shown"], 1)
            self.assertEqual(without_memory["products"][0]["product_id"], "karaage_set")


if __name__ == "__main__":
    unittest.main()
