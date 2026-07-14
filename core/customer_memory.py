"""Pseudonymous customer memory storage for QR-based chatbot access."""

from __future__ import annotations

import json
import re
import secrets
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .integrations.chatbot_ai_manager.schemas import CustomerMemoryProfile


ANONYMOUS_CUSTOMER_ID_PREFIX = "anon_"
ANONYMOUS_CUSTOMER_ID_PATTERN = re.compile(r"^anon_[a-zA-Z0-9_-]{16,64}$")
CONSENT_UNKNOWN = "unknown"
CONSENT_GRANTED = "granted"
CONSENT_DENIED = "denied"
CONSENT_ACCEPTED = CONSENT_GRANTED
LEGACY_CONSENT_ACCEPTED = "consented"
CONSENT_VALUES = frozenset({CONSENT_UNKNOWN, CONSENT_GRANTED, CONSENT_DENIED})
EVENT_ORDER_CONFIRMED = "order_confirmed"
EVENT_RECOMMENDATION_SHOWN = "recommendation_shown"
EVENT_RECOMMENDATION_DECLINED = "recommendation_declined"
EVENT_ORDER_CANCELLED = "order_cancelled"
PROFILE_ITEM_LIMIT = 10
PROFILE_DECLINED_LIMIT = 20


@dataclass(frozen=True)
class CustomerSessionLink:
    session_id: str
    anonymous_customer_id: str
    created_at: str
    updated_at: str
    last_seen_at: str


@dataclass(frozen=True)
class CustomerMemoryEvent:
    event_type: str
    anonymous_customer_id: str
    session_id: str
    product_id: str = ""
    product_name: str = ""
    quantity: int = 1
    strategy_id: str = ""
    occurred_at: str = ""
    event_id: str = field(default_factory=lambda: secrets.token_urlsafe(12))


@dataclass(frozen=True)
class CustomerMemoryContext:
    anonymous_customer_id: str = ""
    consent_status: str = CONSENT_UNKNOWN
    recent_ordered_items: tuple[str, ...] = ()
    recent_recommended_items: tuple[str, ...] = ()
    declined_product_ids: tuple[str, ...] = ()
    declined_product_names: tuple[str, ...] = ()
    order_cancelled_product_ids: tuple[str, ...] = ()
    order_cancelled_product_names: tuple[str, ...] = ()
    order_counts: Dict[str, int] = field(default_factory=dict)
    visit_count: int = 0
    memory_available: bool = False

    @classmethod
    def unavailable(cls, anonymous_customer_id: str = "") -> "CustomerMemoryContext":
        return cls(anonymous_customer_id=anonymous_customer_id, memory_available=False)

    @property
    def is_granted(self) -> bool:
        return self.consent_status == CONSENT_GRANTED


def generate_anonymous_customer_id() -> str:
    return f"{ANONYMOUS_CUSTOMER_ID_PREFIX}{secrets.token_urlsafe(18)}"


def is_valid_anonymous_customer_id(value: str) -> bool:
    return bool(ANONYMOUS_CUSTOMER_ID_PATTERN.fullmatch(str(value or "").strip()))


def normalize_consent_status(value: str) -> str:
    status = str(value or "").strip()
    if status == LEGACY_CONSENT_ACCEPTED:
        return CONSENT_GRANTED
    if status in CONSENT_VALUES:
        return status
    return CONSENT_UNKNOWN


class CustomerMemoryRepository:
    def __init__(
        self,
        path: str = "outputs/customer_memory_profiles.json",
        *,
        session_links_path: Optional[str] = None,
        events_path: Optional[str] = None,
    ) -> None:
        self.path = Path(path)
        self.session_links_path = Path(
            session_links_path or self.path.with_name("customer_session_links.json")
        )
        self.events_path = Path(
            events_path or self.path.with_name("customer_memory_events.jsonl")
        )

    def identify(
        self,
        anonymous_customer_id: Optional[str] = None,
        *,
        consent_accepted: bool = False,
    ) -> CustomerMemoryProfile:
        customer_id = str(anonymous_customer_id or "").strip()
        if not is_valid_anonymous_customer_id(customer_id):
            customer_id = generate_anonymous_customer_id()

        profiles = self._load_profiles()
        profile = profiles.get(customer_id)
        now = datetime.now(timezone.utc).isoformat()
        consent_status = CONSENT_GRANTED if consent_accepted else CONSENT_UNKNOWN

        if profile is None:
            profile = CustomerMemoryProfile(
                customer_profile_id=f"profile_{customer_id}",
                anonymous_customer_id=customer_id,
                consent_status=consent_status,
                visit_count=1,
                last_visit_at=now,
            )
        else:
            profile = replace(
                profile,
                consent_status=(
                    CONSENT_GRANTED
                    if consent_accepted or normalize_consent_status(profile.consent_status) == CONSENT_GRANTED
                    else CONSENT_UNKNOWN
                ),
                visit_count=max(0, int(profile.visit_count)) + 1,
                last_visit_at=now,
            )

        profiles[customer_id] = profile
        self._save_profiles(profiles)
        return profile

    def get(self, anonymous_customer_id: str) -> Optional[CustomerMemoryProfile]:
        if not is_valid_anonymous_customer_id(anonymous_customer_id):
            return None
        return self._load_profiles().get(anonymous_customer_id)

    def update_consent(
        self,
        *,
        anonymous_customer_id: str,
        consent_status: str,
    ) -> Optional[CustomerMemoryProfile]:
        safe_customer_id = str(anonymous_customer_id or "").strip()
        requested_status = str(consent_status or "").strip()
        if (
            not is_valid_anonymous_customer_id(safe_customer_id)
            or requested_status not in CONSENT_VALUES
        ):
            return None
        normalized = normalize_consent_status(requested_status)

        profiles = self._load_profiles()
        profile = profiles.get(safe_customer_id)
        now = datetime.now(timezone.utc).isoformat()
        if profile is None:
            profile = CustomerMemoryProfile(
                customer_profile_id=f"profile_{safe_customer_id}",
                anonymous_customer_id=safe_customer_id,
                consent_status=normalized,
                visit_count=0,
                last_visit_at=now,
                memory_updated_at=now,
            )
        else:
            profile = replace(
                profile,
                consent_status=normalized,
                memory_updated_at=now,
            )
        profiles[safe_customer_id] = profile
        self._save_profiles(profiles)
        return profile

    def link_session(
        self,
        *,
        session_id: str,
        anonymous_customer_id: str,
    ) -> Optional[CustomerSessionLink]:
        safe_session_id = str(session_id or "").strip()
        safe_customer_id = str(anonymous_customer_id or "").strip()
        if not safe_session_id or not is_valid_anonymous_customer_id(safe_customer_id):
            return None

        links = self._load_session_links()
        existing = links.get(safe_session_id)
        now = datetime.now(timezone.utc).isoformat()
        if existing and existing.anonymous_customer_id != safe_customer_id:
            return existing

        link = CustomerSessionLink(
            session_id=safe_session_id,
            anonymous_customer_id=safe_customer_id,
            created_at=existing.created_at if existing else now,
            updated_at=now,
            last_seen_at=now,
        )
        links[safe_session_id] = link
        self._save_session_links(links)
        return link

    def record_event(
        self,
        *,
        event_type: str,
        anonymous_customer_id: str,
        session_id: str,
        product_id: str = "",
        product_name: str = "",
        quantity: int = 1,
        strategy_id: str = "",
    ) -> Optional[CustomerMemoryEvent]:
        safe_customer_id = str(anonymous_customer_id or "").strip()
        safe_session_id = str(session_id or "").strip()
        if not safe_session_id or not is_valid_anonymous_customer_id(safe_customer_id):
            return None
        if event_type not in {
            EVENT_ORDER_CONFIRMED,
            EVENT_RECOMMENDATION_SHOWN,
            EVENT_RECOMMENDATION_DECLINED,
            EVENT_ORDER_CANCELLED,
        }:
            return None

        now = datetime.now(timezone.utc).isoformat()
        event = CustomerMemoryEvent(
            event_type=event_type,
            anonymous_customer_id=safe_customer_id,
            session_id=safe_session_id,
            product_id=str(product_id or "")[:120],
            product_name=str(product_name or "")[:120],
            quantity=max(1, int(quantity or 1)),
            strategy_id=str(strategy_id or "")[:120],
            occurred_at=now,
        )
        self._append_event(event)
        self._apply_event_to_profile(event)
        return event

    def get_admin_summary(self, anonymous_customer_id: str) -> Optional[Dict[str, Any]]:
        profile = self.get(anonymous_customer_id)
        if not profile:
            return None
        links = [
            asdict(link)
            for link in self._load_session_links().values()
            if link.anonymous_customer_id == profile.anonymous_customer_id
        ]
        data = self.to_public_dict(profile)
        data["linked_session_count"] = len(links)
        data["linked_sessions"] = links[-10:]
        return data

    def build_context(self, anonymous_customer_id: str) -> CustomerMemoryContext:
        profile = self.get(anonymous_customer_id)
        if not profile:
            return CustomerMemoryContext.unavailable(str(anonymous_customer_id or ""))

        events = self._load_events(profile.anonymous_customer_id)
        recent_orders: List[str] = []
        recent_recommendations: List[str] = []
        declined_ids: List[str] = []
        declined_names: List[str] = []
        cancelled_ids: List[str] = []
        cancelled_names: List[str] = []
        order_counts: Dict[str, int] = {}

        for event in events:
            item_name = event.product_name or event.product_id
            if event.event_type == EVENT_ORDER_CONFIRMED and item_name:
                recent_orders.insert(0, item_name)
                order_counts[item_name] = order_counts.get(item_name, 0) + max(1, event.quantity)
            elif event.event_type == EVENT_ORDER_CANCELLED and item_name:
                cancelled_ids.insert(0, event.product_id)
                cancelled_names.insert(0, item_name)
                if item_name in recent_orders:
                    recent_orders.remove(item_name)
                if item_name in order_counts:
                    order_counts[item_name] = max(0, order_counts[item_name] - max(1, event.quantity))
            elif event.event_type == EVENT_RECOMMENDATION_SHOWN and item_name:
                recent_recommendations.insert(0, item_name)
            elif event.event_type == EVENT_RECOMMENDATION_DECLINED and item_name:
                declined_ids.insert(0, event.product_id)
                declined_names.insert(0, item_name)

        order_counts = {
            item: count for item, count in order_counts.items() if count > 0
        }
        return CustomerMemoryContext(
            anonymous_customer_id=profile.anonymous_customer_id,
            consent_status=normalize_consent_status(profile.consent_status),
            recent_ordered_items=tuple(_recent_unique(recent_orders, PROFILE_ITEM_LIMIT)),
            recent_recommended_items=tuple(_recent_unique(recent_recommendations, PROFILE_ITEM_LIMIT)),
            declined_product_ids=tuple(_recent_unique(declined_ids, PROFILE_DECLINED_LIMIT)),
            declined_product_names=tuple(_recent_unique(declined_names, PROFILE_DECLINED_LIMIT)),
            order_cancelled_product_ids=tuple(_recent_unique(cancelled_ids, PROFILE_DECLINED_LIMIT)),
            order_cancelled_product_names=tuple(_recent_unique(cancelled_names, PROFILE_DECLINED_LIMIT)),
            order_counts=order_counts,
            visit_count=profile.visit_count,
            memory_available=True,
        )

    def to_public_dict(self, profile: CustomerMemoryProfile) -> Dict[str, Any]:
        data = asdict(profile)
        data["preference_tags"] = list(profile.preference_tags)
        data["favorite_items"] = list(profile.favorite_items)
        data["avoided_items"] = list(profile.avoided_items)
        data["last_ordered_items"] = list(profile.last_ordered_items)
        data["last_recommended_items"] = list(profile.last_recommended_items)
        data["recommendation_history"] = list(profile.recommendation_history)
        data["declined_products"] = list(profile.declined_products)
        return data

    def _load_profiles(self) -> Dict[str, CustomerMemoryProfile]:
        if not self.path.exists():
            return {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

        profiles: Dict[str, CustomerMemoryProfile] = {}
        if not isinstance(raw, dict):
            return profiles
        for key, value in raw.items():
            if not is_valid_anonymous_customer_id(key) or not isinstance(value, dict):
                continue
            profiles[key] = CustomerMemoryProfile(
                customer_profile_id=str(value.get("customer_profile_id") or f"profile_{key}"),
                anonymous_customer_id=key,
                consent_status=normalize_consent_status(str(value.get("consent_status") or CONSENT_UNKNOWN)),
                preference_tags=tuple(value.get("preference_tags") or ()),
                favorite_items=tuple(value.get("favorite_items") or ()),
                avoided_items=tuple(value.get("avoided_items") or ()),
                last_ordered_items=tuple(value.get("last_ordered_items") or ()),
                last_recommended_items=tuple(value.get("last_recommended_items") or ()),
                recommendation_history=tuple(value.get("recommendation_history") or ()),
                declined_products=tuple(value.get("declined_products") or ()),
                visit_count=int(value.get("visit_count") or 0),
                last_visit_at=str(value.get("last_visit_at") or ""),
                last_ordered_at=str(value.get("last_ordered_at") or ""),
                last_recommended_at=str(value.get("last_recommended_at") or ""),
                memory_updated_at=str(value.get("memory_updated_at") or ""),
                communication_notes=str(value.get("communication_notes") or ""),
            )
        return profiles

    def _save_profiles(self, profiles: Dict[str, CustomerMemoryProfile]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            customer_id: self.to_public_dict(profile)
            for customer_id, profile in sorted(profiles.items())
        }
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _load_session_links(self) -> Dict[str, CustomerSessionLink]:
        if not self.session_links_path.exists():
            return {}
        try:
            raw = json.loads(self.session_links_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(raw, dict):
            return {}

        links: Dict[str, CustomerSessionLink] = {}
        for session_id, value in raw.items():
            if not isinstance(value, dict):
                continue
            customer_id = str(value.get("anonymous_customer_id") or "")
            if not session_id or not is_valid_anonymous_customer_id(customer_id):
                continue
            links[str(session_id)] = CustomerSessionLink(
                session_id=str(session_id),
                anonymous_customer_id=customer_id,
                created_at=str(value.get("created_at") or ""),
                updated_at=str(value.get("updated_at") or ""),
                last_seen_at=str(value.get("last_seen_at") or ""),
            )
        return links

    def _save_session_links(self, links: Dict[str, CustomerSessionLink]) -> None:
        self.session_links_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            session_id: asdict(link)
            for session_id, link in sorted(links.items())
        }
        self.session_links_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _append_event(self, event: CustomerMemoryEvent) -> None:
        self.events_path.parent.mkdir(parents=True, exist_ok=True)
        with self.events_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(event), ensure_ascii=False) + "\n")

    def _load_events(self, anonymous_customer_id: str) -> List[CustomerMemoryEvent]:
        if not self.events_path.exists() or not is_valid_anonymous_customer_id(anonymous_customer_id):
            return []
        events: List[CustomerMemoryEvent] = []
        try:
            lines = self.events_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        for line in lines:
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(value, dict):
                continue
            if value.get("anonymous_customer_id") != anonymous_customer_id:
                continue
            events.append(
                CustomerMemoryEvent(
                    event_type=str(value.get("event_type") or ""),
                    anonymous_customer_id=anonymous_customer_id,
                    session_id=str(value.get("session_id") or ""),
                    product_id=str(value.get("product_id") or ""),
                    product_name=str(value.get("product_name") or ""),
                    quantity=int(value.get("quantity") or 1),
                    strategy_id=str(value.get("strategy_id") or ""),
                    occurred_at=str(value.get("occurred_at") or ""),
                    event_id=str(value.get("event_id") or ""),
                )
            )
        return events

    def _apply_event_to_profile(self, event: CustomerMemoryEvent) -> None:
        profiles = self._load_profiles()
        profile = profiles.get(event.anonymous_customer_id)
        if not profile:
            profile = CustomerMemoryProfile(
                customer_profile_id=f"profile_{event.anonymous_customer_id}",
                anonymous_customer_id=event.anonymous_customer_id,
                consent_status=CONSENT_UNKNOWN,
                visit_count=0,
                last_visit_at=event.occurred_at,
            )

        if event.event_type == EVENT_ORDER_CONFIRMED:
            profile = replace(
                profile,
                last_ordered_items=tuple(
                    _recent_unique(
                        [event.product_name or event.product_id, *profile.last_ordered_items],
                        PROFILE_ITEM_LIMIT,
                    )
                ),
                last_ordered_at=event.occurred_at,
                memory_updated_at=event.occurred_at,
                last_visit_at=event.occurred_at,
            )
        elif event.event_type == EVENT_RECOMMENDATION_SHOWN:
            product_value = event.product_name or event.product_id
            profile = replace(
                profile,
                last_recommended_items=tuple(
                    _recent_unique(
                        [product_value, *profile.last_recommended_items],
                        PROFILE_ITEM_LIMIT,
                    )
                ),
                recommendation_history=tuple(
                    _bounded([product_value, *profile.recommendation_history], PROFILE_ITEM_LIMIT)
                ),
                last_recommended_at=event.occurred_at,
                memory_updated_at=event.occurred_at,
                last_visit_at=event.occurred_at,
            )
        elif event.event_type == EVENT_RECOMMENDATION_DECLINED:
            product_value = event.product_name or event.product_id
            profile = replace(
                profile,
                declined_products=tuple(
                    _recent_unique(
                        [product_value, *profile.declined_products],
                        PROFILE_DECLINED_LIMIT,
                    )
                ),
                memory_updated_at=event.occurred_at,
                last_visit_at=event.occurred_at,
            )
        elif event.event_type == EVENT_ORDER_CANCELLED:
            profile = replace(
                profile,
                memory_updated_at=event.occurred_at,
                last_visit_at=event.occurred_at,
            )

        profiles[event.anonymous_customer_id] = profile
        self._save_profiles(profiles)


def _bounded(values: List[str], limit: int) -> List[str]:
    return [str(value) for value in values if str(value or "").strip()][:limit]


def _recent_unique(values: List[str], limit: int) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
        if len(result) >= limit:
            break
    return result
