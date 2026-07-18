"""Tool selection layer for the autonomous conversation orchestrator.

Phase 1 does not execute new Notion calls.  It records which existing
information source should be used so ``core.api`` can keep the current safe
pipeline while the new orchestration layer is introduced.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

from .conversation_planner import (
    TOOL_CUSTOMER_MEMORY,
    TOOL_LEGACY_ROUTER,
    TOOL_MENU,
    TOOL_RESERVATION,
    TOOL_STORE_KNOWLEDGE,
    ConversationPlan,
)


@dataclass(frozen=True)
class ConversationToolSelection:
    menu_price: bool = False
    store_knowledge: bool = False
    customer_memory: bool = False
    reservation_existing: bool = False
    legacy_router: bool = True

    @property
    def names(self) -> Tuple[str, ...]:
        names = []
        if self.menu_price:
            names.append(TOOL_MENU)
        if self.store_knowledge:
            names.append(TOOL_STORE_KNOWLEDGE)
        if self.customer_memory:
            names.append(TOOL_CUSTOMER_MEMORY)
        if self.reservation_existing:
            names.append(TOOL_RESERVATION)
        if self.legacy_router:
            names.append(TOOL_LEGACY_ROUTER)
        return tuple(names)


class ConversationToolRouter:
    """Map a plan to existing information sources."""

    def select(self, plan: ConversationPlan) -> ConversationToolSelection:
        required = set(plan.required_tools)
        return ConversationToolSelection(
            menu_price=TOOL_MENU in required,
            store_knowledge=TOOL_STORE_KNOWLEDGE in required,
            customer_memory=TOOL_CUSTOMER_MEMORY in required,
            reservation_existing=TOOL_RESERVATION in required,
            legacy_router=plan.fallback_to_legacy or TOOL_LEGACY_ROUTER in required,
        )
