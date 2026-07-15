import json
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
    STRATEGY_ID_FALLBACK,
    STRATEGY_ID_UNATTRIBUTED,
    CustomerMemoryRepository,
    generate_anonymous_customer_id,
    is_valid_anonymous_customer_id,
    normalize_product_name,
    session_event_customer_id,
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

    def test_session_fallback_records_recommendation_event_without_customer_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            event = repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id="",
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
                allow_session_fallback=True,
            )
            performance = repository.aggregate_performance()
            fallback_id = session_event_customer_id("session_001")
            profile = repository.get(fallback_id)

            self.assertIsNotNone(event)
            self.assertEqual(event.anonymous_customer_id, fallback_id)
            self.assertIsNotNone(profile)
            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["products"][0]["product_id"], "sashimi_set")

    def test_session_fallback_converts_same_session_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id="",
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
                allow_session_fallback=True,
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id="",
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
                allow_session_fallback=True,
            )
            performance = repository.aggregate_performance()

            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["summary"]["converted"], 1)

    def test_fallback_recommendation_uses_non_empty_strategy_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            event = repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                metadata={"recommendation_source": "short_fallback"},
            )
            performance = repository.aggregate_performance()

            self.assertIsNotNone(event)
            self.assertEqual(event.strategy_id, STRATEGY_ID_FALLBACK)
            self.assertEqual(performance["strategies"][0]["strategy_id"], STRATEGY_ID_FALLBACK)

    def test_missing_strategy_id_is_grouped_as_unattributed(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            event = repository.record_event(
                event_type=EVENT_ORDER_CANCELLED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_name="Beer",
            )
            performance = repository.aggregate_performance()

            self.assertIsNotNone(event)
            self.assertEqual(event.strategy_id, STRATEGY_ID_UNATTRIBUTED)
            self.assertEqual(performance["strategies"][0]["strategy_id"], STRATEGY_ID_UNATTRIBUTED)

    def test_conversion_inherits_strategy_id_from_shown_event(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            shown = repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_original",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CONFIRMED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_current",
            )
            events = repository._load_events(profile.anonymous_customer_id)
            conversions = [
                event
                for event in events
                if event.event_type == EVENT_RECOMMENDATION_CONVERTED
            ]
            performance = repository.aggregate_performance(strategy_id="strategy_original")

            self.assertEqual(conversions[0].strategy_id, "strategy_original")
            self.assertEqual(
                conversions[0].metadata["source_recommendation_event_id"],
                shown.event_id,
            )
            self.assertEqual(performance["summary"]["shown"], 1)
            self.assertEqual(performance["summary"]["converted"], 1)

    def test_declined_and_cancelled_strategy_groups_are_non_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_DECLINED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
            )
            repository.record_event(
                event_type=EVENT_ORDER_CANCELLED,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                strategy_id="strategy_001",
            )
            performance = repository.aggregate_performance(strategy_id="strategy_001")

            self.assertEqual(performance["summary"]["declined"], 1)
            self.assertEqual(performance["summary"]["cancelled"], 1)
            self.assertEqual(performance["strategies"][0]["strategy_id"], "strategy_001")

    def test_diagnostics_reports_event_storage_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id="",
                session_id="session_001",
                product_id="sashimi_set",
                product_name="Sashimi set",
                allow_session_fallback=True,
            )
            diagnostics = repository.diagnostics()

            self.assertEqual(diagnostics["repository_type"], "jsonl")
            self.assertEqual(diagnostics["event_count"], 1)
            self.assertEqual(diagnostics["latest_event_type"], EVENT_RECOMMENDATION_SHOWN)
            self.assertEqual(diagnostics["latest_product_id"], "sashimi_set")
            self.assertTrue(diagnostics["persistence_path_configured"])

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


    def test_normalize_product_name_keeps_valid_values(self):
        sashimi_set = "\u523a\u8eab\u5b9a\u98df"
        beer = "\u4e2d\u751f\u30d3\u30fc\u30eb"

        self.assertEqual(normalize_product_name(sashimi_set), sashimi_set)
        self.assertEqual(normalize_product_name(beer), beer)
        self.assertEqual(normalize_product_name("Sashimi Set"), "Sashimi Set")
        self.assertEqual(normalize_product_name(None), "")
        self.assertEqual(normalize_product_name(""), "")

    def test_normalize_product_name_repairs_latin1_mojibake(self):
        sashimi_set = "\u523a\u8eab\u5b9a\u98df"
        beer = "\u4e2d\u751f\u30d3\u30fc\u30eb"

        self.assertEqual(
            normalize_product_name(sashimi_set.encode("utf-8").decode("latin-1")),
            sashimi_set,
        )
        self.assertEqual(
            normalize_product_name(beer.encode("utf-8").decode("latin-1")),
            beer,
        )

    def test_record_event_normalizes_product_name_before_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)
            sashimi_set = "\u523a\u8eab\u5b9a\u98df"
            broken_name = sashimi_set.encode("utf-8").decode("latin-1")

            event = repository.record_event(
                event_type=EVENT_RECOMMENDATION_SHOWN,
                anonymous_customer_id=profile.anonymous_customer_id,
                session_id="session_001",
                product_id="sashimi_set",
                product_name=broken_name,
            )
            updated = repository.get(profile.anonymous_customer_id)
            events = repository._load_events(profile.anonymous_customer_id)

            self.assertIsNotNone(event)
            self.assertEqual(event.product_name, sashimi_set)
            self.assertEqual(events[0].product_name, sashimi_set)
            self.assertEqual(updated.last_recommended_items, (sashimi_set,))

    def test_aggregate_performance_normalizes_existing_mojibake_display(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))
            profile = repository.identify(consent_accepted=True)
            beer = "\u4e2d\u751f\u30d3\u30fc\u30eb"
            broken_name = beer.encode("utf-8").decode("latin-1")
            event = {
                "event_type": EVENT_ORDER_CANCELLED,
                "anonymous_customer_id": profile.anonymous_customer_id,
                "session_id": "session_001",
                "product_id": "beer_001",
                "product_name": broken_name,
                "quantity": 1,
                "strategy_id": "strategy_001",
                "occurred_at": "2026-07-14T00:00:00+00:00",
                "event_id": "event_001",
                "metadata": {},
            }
            repository.events_path.parent.mkdir(parents=True, exist_ok=True)
            repository.events_path.write_text(
                json.dumps(event, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

            performance = repository.aggregate_performance()

            self.assertEqual(performance["summary"]["cancelled"], 1)
            self.assertEqual(performance["summary"]["shown"], 0)
            self.assertEqual(performance["products"][0]["product_id"], "beer_001")
            self.assertEqual(performance["products"][0]["product_name"], beer)
            self.assertEqual(performance["products"][0]["cancelled"], 1)


if __name__ == "__main__":
    unittest.main()
