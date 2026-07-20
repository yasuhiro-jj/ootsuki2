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
    PublicNotionKnowledgeCandidateBuilder,
    PublicNotionKnowledgeRepository,
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


if __name__ == "__main__":
    unittest.main()
