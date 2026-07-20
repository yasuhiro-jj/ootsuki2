"""Autonomous conversation orchestrator skeleton.

The Phase 1 orchestrator is deliberately conservative: it can be called from
``/chat`` without taking over response generation.  It normalizes state,
plans intent/tool needs, and always allows the legacy pipeline to continue
unless a later phase explicitly implements a handled response.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

from .conversation_planner import ConversationPlan, ConversationPlanner
from .conversation_state import ConversationState
from .conversation_tools import ConversationToolRouter, ConversationToolSelection
from .public_notion_knowledge import (
    PublicKnowledgeCandidate,
    PublicNotionKnowledgeCandidateBuilder,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OrchestratorDecision:
    handled: bool
    fallback_to_legacy: bool
    state: ConversationState
    plan: Optional[ConversationPlan] = None
    tools: Optional[ConversationToolSelection] = None
    public_knowledge_candidate: Optional[PublicKnowledgeCandidate] = None
    response: Optional[str] = None
    reason: str = ""
    error: str = ""


class AutonomousConversationOrchestrator:
    """Coordinate state normalization, planning, and tool selection."""

    def __init__(
        self,
        *,
        planner: Optional[ConversationPlanner] = None,
        tool_router: Optional[ConversationToolRouter] = None,
        public_knowledge_builder: Optional[PublicNotionKnowledgeCandidateBuilder] = None,
    ) -> None:
        self.planner = planner or ConversationPlanner()
        self.tool_router = tool_router or ConversationToolRouter()
        self.public_knowledge_builder = (
            public_knowledge_builder
            if public_knowledge_builder is not None
            else PublicNotionKnowledgeCandidateBuilder.from_env()
        )

    def inspect(
        self,
        message: str,
        *,
        session_id: str = "",
        customer_id: str = "",
        session_memory: Optional[Dict[str, Any]] = None,
        recent_messages: Iterable[str] | None = None,
    ) -> OrchestratorDecision:
        """Return a conservative orchestration decision.

        Exceptions are converted into legacy fallback decisions.  This is the
        critical safety property for Phase 1.
        """
        state = ConversationState.from_memory(
            session_memory or {},
            session_id=session_id,
            customer_id=customer_id,
        )
        try:
            plan = self.planner.plan(
                message,
                state,
                recent_messages=recent_messages,
            )
            tools = self.tool_router.select(plan)
            public_candidate = self.public_knowledge_builder.build(message, plan)
            return OrchestratorDecision(
                handled=False,
                fallback_to_legacy=True,
                state=state,
                plan=plan,
                tools=tools,
                public_knowledge_candidate=public_candidate,
                reason=plan.reason,
            )
        except Exception as exc:
            logger.warning(
                "[AutonomousConversation] planning failed; falling back to legacy router: %s",
                exc,
            )
            return OrchestratorDecision(
                handled=False,
                fallback_to_legacy=True,
                state=state,
                plan=None,
                tools=None,
                reason="planner_exception",
                error=exc.__class__.__name__,
            )
