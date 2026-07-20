import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

langchain_openai_stub = types.ModuleType("langchain_openai")
langchain_openai_stub.ChatOpenAI = object
sys.modules.setdefault("langchain_openai", langchain_openai_stub)

langchain_messages_stub = types.ModuleType("langchain_core.messages")
langchain_messages_stub.HumanMessage = object
langchain_messages_stub.AIMessage = object
langchain_messages_stub.SystemMessage = object
sys.modules.setdefault("langchain_core.messages", langchain_messages_stub)

from core.api import create_app


class FakeConfig:
    app_name = "ootsuki_test"

    def __init__(self, tmp: str):
        self.tmp = tmp
        self.values = {
            "project_name": "ootsuki_test",
            "frontend_title": "ootsuki_test",
            "ai.temperature": 0.7,
            "features.enable_autonomous_conversation_orchestrator": True,
            "features.enable_conversation_quality_logs": True,
            "features.enable_langgraph": False,
            "features.enable_agent_executor": False,
            "features.enable_simple_graph": False,
            "features.enable_scheduler": False,
            "features.save_conversation": False,
            "conversation_quality.log_path": str(Path(tmp) / "quality.jsonl"),
            "ai_manager.sales_strategy_path": str(Path(tmp) / "sales.json"),
            "ai_manager.recommendation_settings_path": str(Path(tmp) / "settings.json"),
            "notion.database_ids.menu_db": "",
            "notion.database_ids.unknown_keywords_db": "",
            "notion.database_ids.conversation_history_db": "",
            "notion.database_ids": {},
        }

    def get(self, key, default=None):
        return self.values.get(key, default)

    def get_ai_model(self):
        return "gpt-4o-mini"

    def get_chroma_persist_dir(self):
        return str(Path(self.tmp) / "chroma")

    def get_knowledge_base_path(self):
        return str(Path(self.tmp) / "knowledge")


def write_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        for row in rows:
            fp.write(json.dumps(row, ensure_ascii=False) + "\n")


class PublicNotionDirectChatTests(unittest.TestCase):
    def test_chat_returns_only_fixed_public_menu_templates_when_flag_enabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            knowledge_dir = Path(tmp) / "public_notion_knowledge"
            write_jsonl(
                knowledge_dir / "menu.public.jsonl",
                [
                    {
                        "name": "\u751f\u30d3\u30fc\u30eb",
                        "price": 528,
                        "aliases": ["\u751f", "\u751f\u4e2d", "\u30d3\u30fc\u30eb"],
                        "source_page_id": "menu-1",
                    },
                    {
                        "name": "A\u304a\u8089\u30e9\u30f3\u30c1",
                        "price": 1200,
                        "aliases": ["A\u30e9\u30f3\u30c1", "\u304a\u8089\u30e9\u30f3\u30c1"],
                        "source_page_id": "menu-2",
                    },
                ],
            )
            write_jsonl(
                knowledge_dir / "store_faq.public.jsonl",
                [
                    {
                        "key": "\u55b6\u696d\u6642\u9593",
                        "answer": "11:00\u304b\u308914:00\u307e\u3067\u3067\u3059\u3002",
                        "faq_category": "\u55b6\u696d\u6642\u9593",
                        "source_page_id": "store-1",
                    }
                ],
            )

            env = {
                "OPENAI_API_KEY": "",
                "NOTION_API_KEY": "",
                "ENABLE_PUBLIC_NOTION_KNOWLEDGE_DIRECT_RESPONSES": "true",
                "ENABLE_PUBLIC_NOTION_KNOWLEDGE_SHADOW": "true",
                "PUBLIC_NOTION_KNOWLEDGE_DIR": str(knowledge_dir),
                "PUBLIC_NOTION_DIRECT_RESPONSE_MIN_CONFIDENCE": "0.80",
            }
            with patch.dict(os.environ, env, clear=False):
                app = create_app(FakeConfig(tmp))
                client = TestClient(app)
                beer_available = client.post(
                    "/chat",
                    json={"message": "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f"},
                ).json()["message"]
                beer_price = client.post(
                    "/chat",
                    json={"message": "\u751f\u30d3\u30fc\u30eb\u3044\u304f\u3089\uff1f"},
                ).json()["message"]
                lunch_price = client.post(
                    "/chat",
                    json={"message": "A\u30e9\u30f3\u30c1\u3044\u304f\u3089\uff1f"},
                ).json()["message"]
                business_hours = client.post(
                    "/chat",
                    json={"message": "\u55b6\u696d\u6642\u9593\u306f\uff1f"},
                ).json()["message"]

        self.assertEqual(
            beer_available,
            "\u306f\u3044\u3001\u751f\u30d3\u30fc\u30eb\uff08528\u5186\uff09\u3092\u3054\u7528\u610f\u3057\u3066\u3044\u307e\u3059\u3002",
        )
        self.assertEqual(beer_price, "\u751f\u30d3\u30fc\u30eb\u306f528\u5186\u3067\u3059\u3002")
        self.assertEqual(lunch_price, "A\u304a\u8089\u30e9\u30f3\u30c1\u306f1,200\u5186\u3067\u3059\u3002")
        self.assertEqual(business_hours, "11:00\u304b\u308914:00\u307e\u3067\u3067\u3059\u3002")
        for message in (beer_available, beer_price, lunch_price, business_hours):
            self.assertNotIn("\u4eba\u6c17", message)
            self.assertNotIn("\u304a\u3059\u3059\u3081", message)
            self.assertNotIn("LINE", message)
            self.assertNotIn("\u305c\u3072", message)

    def test_chat_keeps_legacy_path_when_direct_flag_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            knowledge_dir = Path(tmp) / "public_notion_knowledge"
            write_jsonl(
                knowledge_dir / "menu.public.jsonl",
                [{"name": "\u751f\u30d3\u30fc\u30eb", "price": 528, "aliases": ["\u751f"]}],
            )
            env = {
                "OPENAI_API_KEY": "",
                "NOTION_API_KEY": "",
                "ENABLE_PUBLIC_NOTION_KNOWLEDGE_DIRECT_RESPONSES": "false",
                "ENABLE_PUBLIC_NOTION_KNOWLEDGE_SHADOW": "true",
                "PUBLIC_NOTION_KNOWLEDGE_DIR": str(knowledge_dir),
            }
            with patch.dict(os.environ, env, clear=False):
                app = create_app(FakeConfig(tmp))
                client = TestClient(app)
                response = client.post(
                    "/chat",
                    json={"message": "\u751f\u30d3\u30fc\u30eb\u3042\u308b\uff1f"},
                ).json()["message"]

        self.assertNotEqual(
            response,
            "\u306f\u3044\u3001\u751f\u30d3\u30fc\u30eb\uff08528\u5186\uff09\u3092\u3054\u7528\u610f\u3057\u3066\u3044\u307e\u3059\u3002",
        )


if __name__ == "__main__":
    unittest.main()
