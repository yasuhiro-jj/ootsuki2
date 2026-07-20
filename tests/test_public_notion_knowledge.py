import json
import tempfile
import unittest
from pathlib import Path

from core.conversation_orchestrator import AutonomousConversationOrchestrator
from core.conversation_planner import (
    INTENT_CANCEL,
    INTENT_PRODUCT_EXISTENCE,
    INTENT_PRODUCT_ORDER,
    INTENT_RESERVATION,
    INTENT_STORE_FAQ,
    ConversationPlan,
)
from core.public_notion_knowledge import (
    PublicKnowledgeCandidate,
    PublicNotionKnowledgeCandidateBuilder,
    PublicNotionKnowledgeRepository,
    PublicNotionResponseGuard,
)


def write_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")


def plan(intent, confidence=0.9):
    return ConversationPlan(
        intent=intent,
        topic="menu" if intent == INTENT_PRODUCT_EXISTENCE else "store_info",
        confidence=confidence,
        reason="test",
    )


class PublicNotionKnowledgeTests(unittest.TestCase):
    def make_builder(self, tmp, enabled=True, min_confidence=0.75):
        return PublicNotionKnowledgeCandidateBuilder(
            PublicNotionKnowledgeRepository(str(tmp)),
            enabled=enabled,
            min_confidence=min_confidence,
        )

    def write_public_knowledge(self, tmp):
        write_jsonl(
            Path(tmp) / "menu.public.jsonl",
            [
                {
                    "name": "\u751f\u30d3\u30fc\u30eb",
                    "price": 650,
                    "aliases": ["\u751f", "\u751f\u4e2d", "\u30d3\u30fc\u30eb"],
                    "source_page_id": "menu-1",
                },
                {
                    "name": "A\u304a\u8089\u30e9\u30f3\u30c1",
                    "price": 1200,
                    "aliases": ["A\u30e9\u30f3\u30c1", "\u304a\u8089\u30e9\u30f3\u30c1"],
                    "source_page_id": "menu-2",
                }
            ],
        )
        write_jsonl(
            Path(tmp) / "store_faq.public.jsonl",
            [
                {
                    "key": "\u55b6\u696d\u6642\u9593",
                    "answer": "11\u6642\u304b\u3089\u55b6\u696d\u3057\u3066\u3044\u307e\u3059\u3002",
                    "faq_category": "\u55b6\u696d\u6642\u9593",
                    "source_page_id": "store-1",
                }
            ],
        )

    def test_feature_flag_false_rejects_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            candidate = self.make_builder(tmp, enabled=False).build(
                "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertFalse(candidate.accepted)
        self.assertEqual(candidate.reason, "feature_disabled")

    def test_builds_public_menu_availability_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            candidate = self.make_builder(tmp).build(
                "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertTrue(candidate.accepted)
        self.assertEqual(candidate.candidate_type, "menu_availability")
        self.assertEqual(candidate.source, "public_notion_menu")
        self.assertEqual(candidate.matched_name, "\u751f\u30d3\u30fc\u30eb")
        self.assertIn("650", candidate.response)

    def test_builds_public_menu_price_candidate_from_alias(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            candidate = self.make_builder(tmp).build(
                "\u751f\u4e2d\u3044\u304f\u3089\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertTrue(candidate.accepted)
        self.assertEqual(candidate.candidate_type, "menu_price")

    def test_builds_public_lunch_availability_and_price_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            builder = self.make_builder(tmp)
            availability = builder.build(
                "A\u304a\u8089\u30e9\u30f3\u30c1\u3042\u308b\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )
            price = builder.build(
                "A\u30e9\u30f3\u30c1\u3044\u304f\u3089\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertTrue(availability.accepted)
        self.assertEqual(availability.candidate_type, "menu_availability")
        self.assertTrue(price.accepted)
        self.assertEqual(price.candidate_type, "menu_price")
        self.assertIn("1,200", price.response)

    def test_builds_business_hours_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            candidate = self.make_builder(tmp).build(
                "\u55b6\u696d\u6642\u9593\u306f\uff1f",
                plan(INTENT_STORE_FAQ),
            )

        self.assertTrue(candidate.accepted)
        self.assertEqual(candidate.candidate_type, "business_hours")
        self.assertEqual(candidate.source, "public_notion_store_faq")

    def test_low_confidence_and_missing_artifacts_reject_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            low_confidence = self.make_builder(tmp).build(
                "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE, confidence=0.4),
            )
            missing_artifact = self.make_builder(tmp).build(
                "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertFalse(low_confidence.accepted)
        self.assertEqual(low_confidence.reason, "low_confidence")
        self.assertFalse(missing_artifact.accepted)
        self.assertEqual(missing_artifact.reason, "no_public_menu_match")

    def test_ambiguous_public_menu_match_rejects_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_jsonl(
                Path(tmp) / "menu.public.jsonl",
                [
                    {"name": "A\u30e9\u30f3\u30c1", "price": 1000, "aliases": ["\u30e9\u30f3\u30c1"]},
                    {"name": "B\u30e9\u30f3\u30c1", "price": 1100, "aliases": ["\u30e9\u30f3\u30c1"]},
                ],
            )
            candidate = self.make_builder(tmp).build(
                "\u30e9\u30f3\u30c1\u306e\u5024\u6bb5\u306f\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertFalse(candidate.accepted)
        self.assertEqual(candidate.reason, "ambiguous_public_menu_match")

    def test_price_question_rejects_missing_price(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_jsonl(
                Path(tmp) / "menu.public.jsonl",
                [{"name": "\u5024\u6bb5\u306a\u3057\u5546\u54c1", "aliases": ["\u5024\u6bb5\u306a\u3057"]}],
            )
            candidate = self.make_builder(tmp).build(
                "\u5024\u6bb5\u306a\u3057\u3044\u304f\u3089\uff1f",
                plan(INTENT_PRODUCT_EXISTENCE),
            )

        self.assertFalse(candidate.accepted)
        self.assertEqual(candidate.reason, "missing_public_menu_price")

    def test_unsafe_intents_reject_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            builder = self.make_builder(tmp)

            for intent in (
                INTENT_PRODUCT_ORDER,
                INTENT_RESERVATION,
                INTENT_CANCEL,
            ):
                candidate = builder.build("\u751f\u30d3\u30fc\u30eb\u304a\u9858\u3044", plan(intent))
                self.assertFalse(candidate.accepted)
                self.assertEqual(candidate.reason, "unsafe_intent")

    def test_orchestrator_keeps_legacy_fallback_with_shadow_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            orchestrator = AutonomousConversationOrchestrator(
                public_knowledge_builder=self.make_builder(tmp)
            )
            decision = orchestrator.inspect(
                "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f",
                session_id="session-1",
                session_memory={},
            )

        self.assertFalse(decision.handled)
        self.assertTrue(decision.fallback_to_legacy)
        self.assertTrue(decision.public_knowledge_candidate.accepted)

    def test_orchestrator_direct_response_flag_false_keeps_legacy(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            orchestrator = AutonomousConversationOrchestrator(
                public_knowledge_builder=self.make_builder(tmp),
                direct_responses_enabled=False,
            )
            decision = orchestrator.inspect(
                "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f",
                session_id="session-1",
                session_memory={},
            )

        self.assertFalse(decision.handled)
        self.assertTrue(decision.fallback_to_legacy)
        self.assertEqual(decision.fallback_reason, "direct_response_disabled")

    def test_orchestrator_direct_response_handles_menu_and_store_when_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            orchestrator = AutonomousConversationOrchestrator(
                public_knowledge_builder=self.make_builder(tmp),
                direct_responses_enabled=True,
                direct_min_confidence=0.8,
            )
            beer = orchestrator.inspect("\u751f\u30d3\u30fc\u30eb\u3044\u304f\u3089\uff1f")
            hours = orchestrator.inspect("\u55b6\u696d\u6642\u9593\u306f\uff1f")

        self.assertTrue(beer.handled)
        self.assertFalse(beer.fallback_to_legacy)
        self.assertIn("650", beer.response)
        self.assertEqual(beer.guard_result, "passed")
        self.assertTrue(hours.handled)
        self.assertEqual(hours.public_knowledge_candidate.candidate_type, "business_hours")

    def test_orchestrator_direct_response_rejects_order_cancel_and_reservation(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            orchestrator = AutonomousConversationOrchestrator(
                public_knowledge_builder=self.make_builder(tmp),
                direct_responses_enabled=True,
                direct_min_confidence=0.7,
            )
            for message in (
                "\u3058\u3083\u30422\u3064",
                "\u3084\u3063\u3071\u308a\u3084\u3081\u308b",
                "\u660e\u65e5\u306e\u591c20\u4eba\u306a\u3093\u3060\u3051\u3069",
            ):
                decision = orchestrator.inspect(
                    message,
                    session_memory={
                        "active_topic": "menu",
                        "current_entity": "\u751f\u30d3\u30fc\u30eb",
                    },
                )
                self.assertFalse(decision.handled)
                self.assertTrue(decision.fallback_to_legacy)

    def test_response_guard_rejects_dangerous_response(self):
        guard = PublicNotionResponseGuard()
        candidate = PublicKnowledgeCandidate(
            True,
            candidate_type="menu_price",
            response="\u3054\u6ce8\u6587\u3092\u627f\u308a\u307e\u3057\u305f\u3002",
            source="public_notion_menu",
        )

        passed, reason = guard.check(candidate)

        self.assertFalse(passed)
        self.assertEqual(reason, "dangerous_response")

    def test_orchestrator_guard_exception_falls_back_to_legacy(self):
        class RaisingGuard(PublicNotionResponseGuard):
            def check(self, candidate):
                raise RuntimeError("guard failed")

        with tempfile.TemporaryDirectory() as tmp:
            self.write_public_knowledge(tmp)
            orchestrator = AutonomousConversationOrchestrator(
                public_knowledge_builder=self.make_builder(tmp),
                public_response_guard=RaisingGuard(),
                direct_responses_enabled=True,
                direct_min_confidence=0.8,
            )
            decision = orchestrator.inspect("\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f")

        self.assertFalse(decision.handled)
        self.assertTrue(decision.fallback_to_legacy)


if __name__ == "__main__":
    unittest.main()
