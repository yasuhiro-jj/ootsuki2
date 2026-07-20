"""Autonomous conversation orchestrator skeleton.

The Phase 1 orchestrator is deliberately conservative: it can be called from
``/chat`` without taking over response generation.  It normalizes state,
plans intent/tool needs, and always allows the legacy pipeline to continue
unless a later phase explicitly implements a handled response.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

from .conversation_planner import ConversationPlan, ConversationPlanner
from .conversation_state import ConversationState
from .conversation_tools import ConversationToolRouter, ConversationToolSelection
from .public_notion_knowledge import (
    DEFAULT_DIRECT_RESPONSE_MIN_CONFIDENCE,
    PublicKnowledgeCandidate,
    PublicNotionKnowledgeCandidateBuilder,
    PublicNotionResponseGuard,
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
    guard_result: str = ""
    fallback_reason: str = ""


class AutonomousConversationOrchestrator:
    """Coordinate state normalization, planning, and tool selection."""

    def __init__(
        self,
        *,
        planner: Optional[ConversationPlanner] = None,
        tool_router: Optional[ConversationToolRouter] = None,
        public_knowledge_builder: Optional[PublicNotionKnowledgeCandidateBuilder] = None,
        public_response_guard: Optional[PublicNotionResponseGuard] = None,
        direct_responses_enabled: Optional[bool] = None,
        direct_min_confidence: Optional[float] = None,
    ) -> None:
        self.planner = planner or ConversationPlanner()
        self.tool_router = tool_router or ConversationToolRouter()
        self.public_knowledge_builder = (
            public_knowledge_builder
            if public_knowledge_builder is not None
            else PublicNotionKnowledgeCandidateBuilder.from_env()
        )
        self.public_response_guard = public_response_guard or PublicNotionResponseGuard()
        self.direct_responses_enabled = (
            direct_responses_enabled
            if direct_responses_enabled is not None
            else _env_bool("ENABLE_PUBLIC_NOTION_KNOWLEDGE_DIRECT_RESPONSES", False)
        )
        self.direct_min_confidence = (
            direct_min_confidence
            if direct_min_confidence is not None
            else _env_float(
                "PUBLIC_NOTION_DIRECT_RESPONSE_MIN_CONFIDENCE",
                DEFAULT_DIRECT_RESPONSE_MIN_CONFIDENCE,
            )
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
            handled = False
            fallback_to_legacy = True
            response = None
            guard_result = "not_evaluated"
            fallback_reason = "direct_response_disabled"
            if self.direct_responses_enabled:
                if plan.confidence < self.direct_min_confidence:
                    guard_result = "not_evaluated"
                    fallback_reason = "direct_low_confidence"
                else:
                    guard_passed, guard_result = self.public_response_guard.check(public_candidate)
                    if guard_passed:
                        handled = True
                        fallback_to_legacy = False
                        response = public_candidate.response
                        fallback_reason = ""
                    else:
                        fallback_reason = guard_result or public_candidate.reason or "guard_rejected"
            return OrchestratorDecision(
                handled=handled,
                fallback_to_legacy=fallback_to_legacy,
                state=state,
                plan=plan,
                tools=tools,
                public_knowledge_candidate=public_candidate,
                response=response,
                reason=plan.reason,
                guard_result=guard_result,
                fallback_reason=fallback_reason,
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
                guard_result="not_evaluated",
                fallback_reason="planner_exception",
            )


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default
