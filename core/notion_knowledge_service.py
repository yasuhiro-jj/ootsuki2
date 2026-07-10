"""Notion-backed conversation context.

This service keeps Notion connected as a first-class knowledge source without
turning every turn into a full database dump. The router decides whether the
turn needs restaurant knowledge; this service then gathers a small, relevant
context pack for the final model response.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

from .conversation_router import ConversationRoute
from .menu_service import MenuItemView, MenuService
from .notion_client import NotionClient

logger = logging.getLogger(__name__)


class NotionKnowledgeContextService:
    """Build compact Notion context for the current conversation turn."""

    def __init__(
        self,
        notion_client: NotionClient,
        config: Any,
        menu_service: MenuService | None = None,
    ) -> None:
        self.notion_client = notion_client
        self.config = config
        self.menu_service = menu_service

    def build_context(
        self,
        message: str,
        route: ConversationRoute,
        session_memory: dict[str, Any] | None = None,
        limit: int = 6,
    ) -> str:
        """Return a compact text context selected from configured Notion DBs."""
        if route.kind != "store":
            return ""
        if not self.notion_client or not self.notion_client.client:
            return ""

        session_memory = session_memory or {}
        active_topic = str(session_memory.get("active_topic") or "").lower()
        pending_flow = str(session_memory.get("pending_flow") or "").lower()
        db_ids = self.config.get("notion.database_ids", {}) or {}

        sections: list[str] = []

        if active_topic in {"reservation", "banquet"} or pending_flow in {
            "reservation",
            "banquet",
        }:
            sections.extend(
                self._reservation_sections(message, db_ids, session_memory, limit)
            )
        elif active_topic in {"menu", "recommendation"}:
            sections.extend(self._menu_sections(message, db_ids, limit))
            sections.extend(self._store_sections(db_ids, limit=3))
        else:
            sections.extend(self._store_sections(db_ids, limit=4))
            sections.extend(self._menu_sections(message, db_ids, limit=4))

        compact = "\n\n".join(section for section in sections if section.strip())
        if compact:
            logger.info(
                "[NotionKnowledge] context built route=%s topic=%s chars=%d",
                route.kind,
                active_topic or pending_flow or "restaurant",
                len(compact),
            )
        return compact

    def _reservation_sections(
        self,
        message: str,
        db_ids: dict[str, str],
        session_memory: dict[str, Any],
        limit: int,
    ) -> list[str]:
        sections: list[str] = []
        slots = session_memory.get("reservation_slots") or {}
        filled_slots = {
            key: value for key, value in slots.items() if value not in (None, "")
        }
        if filled_slots:
            slot_lines = [f"- {key}: {value}" for key, value in filled_slots.items()]
            sections.append("[Reservation state]\n" + "\n".join(slot_lines))

        sections.extend(self._store_sections(db_ids, limit=limit))

        menu_query = f"{message} 宴会 コース 団体 大人数 飲み放題"
        sections.extend(self._menu_sections(menu_query, db_ids, limit=limit))
        return sections

    def _store_sections(self, db_ids: dict[str, str], limit: int) -> list[str]:
        store_db_id = db_ids.get("store_db") or db_ids.get("store_info_db")
        if not store_db_id:
            return []

        rows = self._query_rows(
            store_db_id,
            preferred_properties=(
                "項目名",
                "内容",
                "reservation_method",
                "phone",
                "address",
                "access",
                "holidays",
                "parking",
                "席数",
                "決済",
                "features",
                "備考",
            ),
            limit=limit,
            sorts=[{"property": "表示優先度", "direction": "descending"}],
        )
        if not rows:
            return []
        return ["[Notion store information]\n" + "\n".join(rows)]

    def _menu_sections(
        self,
        message: str,
        db_ids: dict[str, str],
        limit: int,
    ) -> list[str]:
        menu_lines: list[str] = []
        if self.menu_service:
            try:
                items = self.menu_service.search_menu_items_by_query(message, limit=limit)
                menu_lines.extend(self._format_menu_items(items))
            except Exception as exc:
                logger.warning("[NotionKnowledge] menu service failed: %s", exc)

        if not menu_lines:
            menu_db_id = db_ids.get("menu_db")
            if menu_db_id:
                menu_lines = self._query_rows(
                    menu_db_id,
                    preferred_properties=(
                        "Name",
                        "Price",
                        "Category",
                        "Subcategory",
                        "一言紹介",
                        "詳細説明",
                        "おすすめ理由",
                        "提供可能",
                        "今夜のおすすめ",
                        "今日のランチおすすめ",
                        "大人数向け",
                        "テイクアウト可",
                    ),
                    limit=limit,
                    sorts=[{"property": "表示優先度", "direction": "descending"}],
                )

        if not menu_lines:
            return []
        return ["[Notion menu knowledge]\n" + "\n".join(menu_lines)]

    def _query_rows(
        self,
        database_id: str,
        preferred_properties: Iterable[str],
        limit: int,
        sorts: list[dict[str, Any]] | None = None,
    ) -> list[str]:
        try:
            pages = self.notion_client.query_database(
                database_id=database_id,
                sorts=sorts,
            )
        except Exception as exc:
            logger.warning("[NotionKnowledge] query failed db=%s: %s", database_id, exc)
            return []

        rows: list[str] = []
        for page in pages[:limit]:
            line = self._page_to_line(page, preferred_properties)
            if line:
                rows.append(line)
        return rows

    def _page_to_line(
        self,
        page: dict[str, Any],
        preferred_properties: Iterable[str],
    ) -> str:
        parts: list[str] = []
        for prop_name in preferred_properties:
            value = self.notion_client.get_property_value(page, prop_name)
            if value in (None, "", []):
                continue
            if isinstance(value, list):
                value = ", ".join(str(v) for v in value if v)
            parts.append(f"{prop_name}: {value}")
        return " / ".join(parts)

    def _format_menu_items(self, items: list[MenuItemView]) -> list[str]:
        lines: list[str] = []
        for item in items:
            parts = [item.name]
            if item.price is not None:
                parts.append(f"{item.price:,} yen")
            if item.one_liner:
                parts.append(item.one_liner)
            elif item.description:
                parts.append(item.description)
            if item.recommendation:
                parts.append(f"recommendation: {item.recommendation}")
            lines.append(" / ".join(part for part in parts if part))
        return lines
