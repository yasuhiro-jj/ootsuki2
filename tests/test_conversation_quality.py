import json
import tempfile
import unittest
from pathlib import Path

from core.conversation_quality import (
    ConversationQualityLog,
    ConversationQualityLogger,
    anonymize_identifier,
    mask_sensitive_text,
)


class ConversationQualityTests(unittest.TestCase):
    def test_masks_phone_email_and_api_like_tokens(self):
        text = "電話は0545-52-2124、mail test@example.com、key ntn_abcdefghijklmnopqrstuvwxyz"
        masked = mask_sensitive_text(text)

        self.assertIn("[MASKED_PHONE]", masked)
        self.assertIn("[MASKED_EMAIL]", masked)
        self.assertIn("[MASKED_SECRET]", masked)
        self.assertNotIn("0545-52-2124", masked)
        self.assertNotIn("test@example.com", masked)
        self.assertNotIn("ntn_abcdefghijklmnopqrstuvwxyz", masked)

    def test_identifier_hash_is_stable_and_not_raw_value(self):
        first = anonymize_identifier("customer-123")
        second = anonymize_identifier("customer-123")

        self.assertEqual(first, second)
        self.assertNotEqual(first, "customer-123")
        self.assertEqual(len(first), 16)

    def test_quality_logger_writes_jsonl(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "quality.jsonl"
            logger = ConversationQualityLogger(str(path), enabled=True)
            log = ConversationQualityLog.from_turn(
                session_id="session-1",
                user_id="user-1",
                user_message="生ビールありますか？",
                ai_response="はい、ありますよ。",
                recent_history=[{"role": "user", "content": "電話 09012345678"}],
                active_topic="menu",
                pending_flow="",
                detected_intent="question",
                route="store",
                route_reason="menu_keyword",
                node="direct_menu_existence",
                referenced_sources={"menu_hits": 1},
                latency_ms=123,
            )

            self.assertTrue(logger.save(log))
            saved = json.loads(path.read_text(encoding="utf-8").strip())

            self.assertEqual(saved["session_id"], "session-1")
            self.assertEqual(saved["route"], "store")
            self.assertEqual(saved["referenced_sources"]["menu_hits"], 1)
            self.assertIn("[MASKED_PHONE]", saved["recent_history"][0]["content"])

    def test_quality_logger_failure_does_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory_path = Path(tmp) / "not_a_file"
            directory_path.mkdir()
            logger = ConversationQualityLogger(str(directory_path), enabled=True)
            log = ConversationQualityLog.from_turn(
                session_id="session-1",
                user_id="user-1",
                user_message="こんにちは",
                ai_response="こんにちは。",
            )

            self.assertFalse(logger.save(log))


if __name__ == "__main__":
    unittest.main()

