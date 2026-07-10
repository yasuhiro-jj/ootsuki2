import unittest

from core.conversation_router import ConversationRoute
from core.notion_knowledge_service import NotionKnowledgeContextService


class FakeConfig:
    def get(self, key, default=None):
        if key == "notion.database_ids":
            return {"store_db": "store", "menu_db": "menu"}
        return default


class FakeNotionClient:
    client = object()

    def query_database(self, database_id, filter_conditions=None, sorts=None):
        if database_id == "store":
            return [
                {
                    "properties": {
                        "項目名": {"type": "title", "title": [{"plain_text": "予約"}]},
                        "内容": {
                            "type": "rich_text",
                            "rich_text": [{"plain_text": "宴会は電話またはLINEで確認"}],
                        },
                        "phone": {"type": "phone_number", "phone_number": "0545-52-2124"},
                    }
                }
            ]
        if database_id == "menu":
            return [
                {
                    "properties": {
                        "Name": {"type": "title", "title": [{"plain_text": "宴会コース"}]},
                        "Price": {"type": "number", "number": 5000},
                        "詳細説明": {
                            "type": "rich_text",
                            "rich_text": [{"plain_text": "大人数向けのコース"}],
                        },
                    }
                }
            ]
        return []

    def get_property_value(self, page, property_name, property_type=None):
        prop = page.get("properties", {}).get(property_name)
        if not prop:
            return None
        prop_type = prop.get("type")
        if prop_type == "title":
            return prop.get("title", [{}])[0].get("plain_text")
        if prop_type == "rich_text":
            return prop.get("rich_text", [{}])[0].get("plain_text")
        if prop_type == "number":
            return prop.get("number")
        if prop_type == "phone_number":
            return prop.get("phone_number")
        return None


class NotionKnowledgeContextServiceTest(unittest.TestCase):
    def test_reservation_context_includes_slots_store_and_menu(self):
        service = NotionKnowledgeContextService(FakeNotionClient(), FakeConfig())
        context = service.build_context(
            message="20人なんだけど",
            route=ConversationRoute("store", "pending_flow:reservation"),
            session_memory={
                "active_topic": "reservation",
                "pending_flow": "reservation",
                "reservation_slots": {"people": 20, "date": "明日"},
            },
        )

        self.assertIn("[Reservation state]", context)
        self.assertIn("people: 20", context)
        self.assertIn("[Notion store information]", context)
        self.assertIn("0545-52-2124", context)
        self.assertIn("[Notion menu knowledge]", context)
        self.assertIn("宴会コース", context)

    def test_natural_route_does_not_load_notion_context(self):
        service = NotionKnowledgeContextService(FakeNotionClient(), FakeConfig())
        context = service.build_context(
            message="今日は疲れた",
            route=ConversationRoute("natural", "smalltalk_keyword"),
            session_memory={"active_topic": "natural"},
        )

        self.assertEqual("", context)


if __name__ == "__main__":
    unittest.main()
