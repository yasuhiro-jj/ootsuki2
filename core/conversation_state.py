"""Unified conversation state for the autonomous chatbot orchestrator.

This module intentionally mirrors the existing session memory keys used by
``core.api``.  Phase 1 does not replace the legacy router; it gives the new
orchestrator a stable state shape while preserving backwards compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


RESERVATION_SLOT_KEYS = (
    "date",
    "time",
    "people",
    "course",
    "budget",
    "room_preference",
    "name",
    "phone",
)


@dataclass(frozen=True)
class ProductReference:
    """A product currently being discussed."""

    name: str
    product_id: str = ""
    quantity: Optional[int] = None
    source: str = ""


@dataclass(frozen=True)
class OrderCandidate:
    """An order candidate that has not necessarily been finalized."""

    product_name: str
    quantity: int = 1
    product_id: str = ""
    status: str = "candidate"


@dataclass
class ReservationState:
    """Collected reservation information."""

    slots: Dict[str, Any] = field(
        default_factory=lambda: {key: None for key in RESERVATION_SLOT_KEYS}
    )

    def merge(self, updates: Dict[str, Any]) -> None:
        for key, value in updates.items():
            if key in RESERVATION_SLOT_KEYS and value not in (None, ""):
                self.slots[key] = value

    @property
    def missing_core_slots(self) -> List[str]:
        return [
            key
            for key in ("date", "time", "people")
            if self.slots.get(key) in (None, "")
        ]


@dataclass
class ConversationState:
    """Normalized state used by planner/tool/orchestrator code."""

    session_id: str = ""
    active_topic: str = ""
    pending_flow: str = ""
    detected_intent: str = ""
    current_product: Optional[ProductReference] = None
    order_candidate: Optional[OrderCandidate] = None
    confirmed_orders: List[OrderCandidate] = field(default_factory=list)
    reservation: ReservationState = field(default_factory=ReservationState)
    customer_id: str = ""
    customer_consent_status: str = "unknown"
    last_assistant_action: str = ""

    @classmethod
    def from_memory(
        cls,
        memory: Optional[Dict[str, Any]],
        *,
        session_id: str = "",
        customer_id: str = "",
    ) -> "ConversationState":
        memory = memory or {}
        item_name = _first_non_empty(
            memory.get("recently_confirmed_item"),
            memory.get("last_ordered_item"),
            memory.get("current_entity"),
            memory.get("last_recommended_item"),
        )
        current_product = (
            ProductReference(name=item_name, source="session_memory")
            if item_name
            else None
        )

        order_candidate = None
        if item_name and (
            memory.get("pending_flow") == "order"
            or memory.get("active_topic") == "order"
            or memory.get("last_assistant_action")
            in {"answered_product_existence", "confirmed_order_item"}
        ):
            order_candidate = OrderCandidate(product_name=item_name)

        reservation = ReservationState()
        slots = memory.get("reservation_slots")
        if isinstance(slots, dict):
            reservation.merge(slots)

        return cls(
            session_id=session_id,
            active_topic=str(memory.get("active_topic") or ""),
            pending_flow=str(memory.get("pending_flow") or ""),
            detected_intent=str(
                memory.get("detected_intent") or memory.get("intent") or ""
            ),
            current_product=current_product,
            order_candidate=order_candidate,
            reservation=reservation,
            customer_id=customer_id,
            customer_consent_status=str(
                memory.get("customer_memory_consent_status") or "unknown"
            ),
            last_assistant_action=str(memory.get("last_assistant_action") or ""),
        )

    def remember_product(
        self,
        name: str,
        *,
        product_id: str = "",
        quantity: Optional[int] = None,
        source: str = "",
    ) -> None:
        if not name:
            return
        self.current_product = ProductReference(
            name=name,
            product_id=product_id,
            quantity=quantity,
            source=source,
        )

    def set_order_candidate(
        self,
        product_name: str,
        *,
        quantity: int = 1,
        product_id: str = "",
    ) -> None:
        if not product_name:
            return
        self.order_candidate = OrderCandidate(
            product_name=product_name,
            quantity=max(1, int(quantity or 1)),
            product_id=product_id,
        )
        self.active_topic = "order"
        self.pending_flow = "order"

    def confirm_order_candidate(self) -> Optional[OrderCandidate]:
        if not self.order_candidate:
            return None
        confirmed = OrderCandidate(
            product_name=self.order_candidate.product_name,
            quantity=self.order_candidate.quantity,
            product_id=self.order_candidate.product_id,
            status="confirmed",
        )
        self.confirmed_orders.append(confirmed)
        self.order_candidate = confirmed
        self.active_topic = "order"
        self.pending_flow = "order"
        return confirmed

    def cancel_latest_order_candidate(self) -> Optional[OrderCandidate]:
        cancelled = self.order_candidate
        self.order_candidate = None
        self.pending_flow = ""
        if self.active_topic == "order":
            self.active_topic = "natural"
        return cancelled

    def to_memory_updates(self) -> Dict[str, Any]:
        updates: Dict[str, Any] = {
            "active_topic": self.active_topic,
            "pending_flow": self.pending_flow,
        }
        if self.current_product:
            updates["current_entity"] = self.current_product.name
        if self.order_candidate:
            updates["recently_confirmed_item"] = self.order_candidate.product_name
        if any(value not in (None, "") for value in self.reservation.slots.values()):
            updates["reservation_slots"] = dict(self.reservation.slots)
        return {key: value for key, value in updates.items() if value is not None}


def _first_non_empty(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""
