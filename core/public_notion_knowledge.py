"""Shadow candidates from GitHub Actions-validated public Notion knowledge.

This module reads local JSONL artifacts produced by the read-only Notion sync.
It never calls the Notion API and it never decides the final chat response.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Any, Iterable, Optional

from .conversation_planner import (
    INTENT_CANCEL,
    INTENT_ORDER_CHANGE,
    INTENT_PRODUCT_EXISTENCE,
    INTENT_PRODUCT_ORDER,
    INTENT_RECOMMENDATION,
    INTENT_RESERVATION,
    INTENT_STORE_FAQ,
)


DEFAULT_PUBLIC_KNOWLEDGE_DIR = "public_notion_knowledge"
DEFAULT_MIN_CONFIDENCE = 0.75

UNSAFE_INTENTS = {
    INTENT_CANCEL,
    INTENT_ORDER_CHANGE,
    INTENT_PRODUCT_ORDER,
    INTENT_RECOMMENDATION,
    INTENT_RESERVATION,
}

PRICE_TERMS = (
    "\u3044\u304f\u3089",
    "\u5024\u6bb5",
    "\u4fa1\u683c",
    "\u5024\u6bb5\u306f",
    "\u5186",
)
AVAILABILITY_TERMS = (
    "\u3042\u308b",
    "\u3042\u308a\u307e\u3059",
    "\u7f6e\u3044\u3066",
    "\u98f2\u3081\u308b",
    "\u98df\u3079\u3089\u308c\u308b",
)
BUSINESS_HOURS_TERMS = (
    "\u55b6\u696d\u6642\u9593",
    "\u4f55\u6642",
    "\u958b\u5e97",
    "\u9589\u5e97",
    "\u4f55\u6642\u304b\u3089",
    "\u4f55\u6642\u307e\u3067",
)


@dataclass(frozen=True)
class PublicMenuKnowledge:
    name: str
    price: Optional[float] = None
    description: str = ""
    category: str = ""
    subcategory: str = ""
    aliases: tuple[str, ...] = ()
    source_page_id: str = ""


@dataclass(frozen=True)
class PublicStoreFaqKnowledge:
    key: str
    answer: str = ""
    faq_category: str = ""
    source_page_id: str = ""


@dataclass(frozen=True)
class PublicKnowledgeCandidate:
    accepted: bool
    candidate_type: str = ""
    response: str = ""
    confidence: float = 0.0
    source: str = ""
    reason: str = ""
    matched_name: str = ""
    metadata: dict[str, Any] | None = None

    def log_fields(self) -> dict[str, Any]:
        return {
            "accepted": self.accepted,
            "candidate_type": self.candidate_type,
            "confidence": self.confidence,
            "source": self.source,
            "reason": self.reason,
            "matched_name": self.matched_name,
            "metadata": self.metadata or {},
        }


class PublicNotionKnowledgeRepository:
    """Load validated public knowledge from local JSONL files."""

    def __init__(self, knowledge_dir: str = DEFAULT_PUBLIC_KNOWLEDGE_DIR) -> None:
        self.knowledge_dir = Path(knowledge_dir)
        self._menus: Optional[list[PublicMenuKnowledge]] = None
        self._store_faqs: Optional[list[PublicStoreFaqKnowledge]] = None

    @property
    def menus(self) -> list[PublicMenuKnowledge]:
        if self._menus is None:
            self._menus = self._load_menus()
        return self._menus

    @property
    def store_faqs(self) -> list[PublicStoreFaqKnowledge]:
        if self._store_faqs is None:
            self._store_faqs = self._load_store_faqs()
        return self._store_faqs

    def _load_menus(self) -> list[PublicMenuKnowledge]:
        path = self.knowledge_dir / "menu.public.jsonl"
        return [
            PublicMenuKnowledge(
                name=str(row.get("name") or "").strip(),
                price=_float_or_none(row.get("price")),
                description=str(row.get("description") or "").strip(),
                category=str(row.get("category") or "").strip(),
                subcategory=str(row.get("subcategory") or "").strip(),
                aliases=tuple(str(alias).strip() for alias in row.get("aliases") or [] if str(alias).strip()),
                source_page_id=str(row.get("source_page_id") or ""),
            )
            for row in _read_jsonl(path)
            if str(row.get("name") or "").strip()
        ]

    def _load_store_faqs(self) -> list[PublicStoreFaqKnowledge]:
        path = self.knowledge_dir / "store_faq.public.jsonl"
        return [
            PublicStoreFaqKnowledge(
                key=str(row.get("key") or "").strip(),
                answer=str(row.get("answer") or "").strip(),
                faq_category=str(row.get("faq_category") or "").strip(),
                source_page_id=str(row.get("source_page_id") or ""),
            )
            for row in _read_jsonl(path)
            if str(row.get("key") or "").strip()
        ]


class PublicNotionKnowledgeCandidateBuilder:
    """Build shadow candidates while keeping legacy fallback mandatory."""

    def __init__(
        self,
        repository: Optional[PublicNotionKnowledgeRepository] = None,
        *,
        enabled: bool = False,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    ) -> None:
        self.repository = repository or PublicNotionKnowledgeRepository()
        self.enabled = enabled
        self.min_confidence = min_confidence

    @classmethod
    def from_env(cls) -> "PublicNotionKnowledgeCandidateBuilder":
        return cls(
            PublicNotionKnowledgeRepository(
                os.getenv("PUBLIC_NOTION_KNOWLEDGE_DIR") or DEFAULT_PUBLIC_KNOWLEDGE_DIR
            ),
            enabled=_env_bool("ENABLE_PUBLIC_NOTION_KNOWLEDGE_SHADOW", False),
            min_confidence=_env_float(
                "PUBLIC_NOTION_KNOWLEDGE_MIN_CONFIDENCE",
                DEFAULT_MIN_CONFIDENCE,
            ),
        )

    def build(self, message: str, plan: Any) -> PublicKnowledgeCandidate:
        if not self.enabled:
            return PublicKnowledgeCandidate(False, reason="feature_disabled")
        if plan is None:
            return PublicKnowledgeCandidate(False, reason="missing_plan")
        if getattr(plan, "intent", "") in UNSAFE_INTENTS:
            return PublicKnowledgeCandidate(False, reason="unsafe_intent")
        if float(getattr(plan, "confidence", 0.0) or 0.0) < self.min_confidence:
            return PublicKnowledgeCandidate(False, reason="low_confidence")

        try:
            if getattr(plan, "intent", "") == INTENT_PRODUCT_EXISTENCE:
                return self._build_menu_candidate(message, plan)
            if getattr(plan, "intent", "") == INTENT_STORE_FAQ:
                return self._build_store_candidate(message, plan)
            return PublicKnowledgeCandidate(False, reason="unsupported_intent")
        except Exception as exc:
            return PublicKnowledgeCandidate(
                False,
                reason="candidate_exception",
                metadata={"error": exc.__class__.__name__},
            )

    def _build_menu_candidate(self, message: str, plan: Any) -> PublicKnowledgeCandidate:
        item = _best_menu_match(message, self.repository.menus)
        if item is None:
            return PublicKnowledgeCandidate(False, reason="no_public_menu_match")

        candidate_type = "menu_price" if _contains_any(message, PRICE_TERMS) else "menu_availability"
        response = _format_menu_candidate_response(item, include_price=True)
        return PublicKnowledgeCandidate(
            True,
            candidate_type=candidate_type,
            response=response,
            confidence=float(getattr(plan, "confidence", 0.0) or 0.0),
            source="public_notion_menu",
            reason="matched_public_menu",
            matched_name=item.name,
            metadata={"source_page_id": item.source_page_id},
        )

    def _build_store_candidate(self, message: str, plan: Any) -> PublicKnowledgeCandidate:
        if not _contains_any(message, BUSINESS_HOURS_TERMS):
            return PublicKnowledgeCandidate(False, reason="unsupported_store_faq")
        for faq in self.repository.store_faqs:
            if faq.faq_category == "\u55b6\u696d\u6642\u9593" or _contains_any(
                faq.key,
                BUSINESS_HOURS_TERMS,
            ):
                if not faq.answer:
                    return PublicKnowledgeCandidate(False, reason="missing_store_answer")
                return PublicKnowledgeCandidate(
                    True,
                    candidate_type="business_hours",
                    response=faq.answer,
                    confidence=float(getattr(plan, "confidence", 0.0) or 0.0),
                    source="public_notion_store_faq",
                    reason="matched_public_store_faq",
                    matched_name=faq.key,
                    metadata={"source_page_id": faq.source_page_id},
                )
        return PublicKnowledgeCandidate(False, reason="no_public_store_faq_match")


def _best_menu_match(
    message: str,
    items: Iterable[PublicMenuKnowledge],
) -> Optional[PublicMenuKnowledge]:
    normalized_message = _normalize(message)
    best: tuple[int, PublicMenuKnowledge] | None = None
    for item in items:
        terms = [item.name, *item.aliases]
        for term in terms:
            normalized_term = _normalize(term)
            if not normalized_term:
                continue
            if normalized_term in normalized_message:
                score = len(normalized_term)
                if best is None or score > best[0]:
                    best = (score, item)
    return best[1] if best else None


def _format_menu_candidate_response(
    item: PublicMenuKnowledge,
    *,
    include_price: bool,
) -> str:
    price_text = ""
    if include_price and isinstance(item.price, (int, float)) and item.price > 0:
        price_text = f"\u3001{int(item.price):,}\u5186"
    return f"\u306f\u3044\u3001{item.name}{price_text}\u3042\u308a\u307e\u3059\u3002"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            text = line.strip()
            if not text:
                continue
            rows.append(json.loads(text))
    return rows


def _contains_any(text: str, terms: Iterable[str]) -> bool:
    normalized_text = _normalize(text)
    return any(_normalize(term) in normalized_text for term in terms)


def _normalize(value: str) -> str:
    return "".join(str(value or "").lower().split())


def _float_or_none(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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
