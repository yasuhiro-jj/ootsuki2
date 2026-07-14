"""Pseudonymous customer memory storage for QR-based chatbot access."""

from __future__ import annotations

import json
import re
import secrets
import unicodedata
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
EVENT_RECOMMENDATION_ACCEPTED = "recommendation_accepted"
EVENT_RECOMMENDATION_CONVERTED = "recommendation_converted"
EVENT_RECOMMENDATION_DECLINED = "recommendation_declined"
EVENT_RECOMMENDATION_EXPIRED = "recommendation_expired"
EVENT_ORDER_CANCELLED = "order_cancelled"
PROFILE_ITEM_LIMIT = 10
PROFILE_DECLINED_LIMIT = 20
RECOMMENDATION_CONVERSION_WINDOW_SECONDS = 30 * 60


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
    metadata: Dict[str, Any] = field(default_factory=dict)


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


def normalize_product_name(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    candidates = {raw, unicodedata.normalize("NFKC", raw)}
    for source in list(candidates):
        try:
            candidates.add(source.encode("latin-1").decode("utf-8"))
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return max(candidates, key=_product_name_quality_score)


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
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[CustomerMemoryEvent]:
        safe_customer_id = str(anonymous_customer_id or "").strip()
        safe_session_id = str(session_id or "").strip()
        if not safe_session_id or not is_valid_anonymous_customer_id(safe_customer_id):
            return None
        if event_type not in {
            EVENT_ORDER_CONFIRMED,
            EVENT_RECOMMENDATION_SHOWN,
            EVENT_RECOMMENDATION_ACCEPTED,
            EVENT_RECOMMENDATION_CONVERTED,
            EVENT_RECOMMENDATION_DECLINED,
            EVENT_RECOMMENDATION_EXPIRED,
            EVENT_ORDER_CANCELLED,
        }:
            return None

        previous_events = self._load_events(safe_customer_id)
        now = datetime.now(timezone.utc).isoformat()
        event = CustomerMemoryEvent(
            event_type=event_type,
            anonymous_customer_id=safe_customer_id,
            session_id=safe_session_id,
            product_id=str(product_id or "")[:120],
            product_name=normalize_product_name(product_name)[:120],
            quantity=max(1, int(quantity or 1)),
            strategy_id=str(strategy_id or "")[:120],
            occurred_at=now,
            metadata=self._safe_metadata(metadata),
        )
        self._append_event(event)
        self._apply_event_to_profile(event)
        conversion_event = self._conversion_event_for_order(event, previous_events)
        if conversion_event is not None:
            self._append_event(conversion_event)
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

    def aggregate_performance(
        self,
        *,
        from_at: Optional[str] = None,
        to_at: Optional[str] = None,
        strategy_id: Optional[str] = None,
        product_id: Optional[str] = None,
        used_customer_memory: Optional[bool] = None,
    ) -> Dict[str, Any]:
        from_dt = _parse_datetime(from_at)
        to_dt = _parse_datetime(to_at)
        events = [
            event
            for event in self._load_all_events()
            if _event_in_range(event, from_dt, to_dt)
        ]
        if strategy_id:
            events = [event for event in events if event.strategy_id == strategy_id]
        if product_id:
            events = [event for event in events if event.product_id == product_id]
        if used_customer_memory is not None:
            events = [
                event
                for event in events
                if _event_used_customer_memory(event) == used_customer_memory
            ]

        summary = _empty_performance_bucket()
        products: Dict[str, Dict[str, Any]] = {}
        strategies: Dict[str, Dict[str, Any]] = {}
        for event in events:
            bucket_name = _performance_bucket_name(event.event_type)
            if not bucket_name:
                continue
            _increment_performance_bucket(summary, bucket_name)
            product_bucket = products.setdefault(
                event.product_id or event.product_name or "unknown",
                _empty_performance_bucket(
                    product_id=event.product_id,
                    product_name=normalize_product_name(event.product_name),
                ),
            )
            _increment_performance_bucket(product_bucket, bucket_name)
            strategy_bucket = strategies.setdefault(
                event.strategy_id or "none",
                _empty_performance_bucket(strategy_id=event.strategy_id),
            )
            _increment_performance_bucket(strategy_bucket, bucket_name)

        _finalize_performance_bucket(summary)
        product_rows = list(products.values())
        strategy_rows = list(strategies.values())
        for row in [*product_rows, *strategy_rows]:
            _finalize_performance_bucket(row)
        product_rows.sort(key=lambda row: (-int(row["shown"]), row.get("product_name") or row.get("product_id") or ""))
        strategy_rows.sort(key=lambda row: (-int(row["shown"]), row.get("strategy_id") or ""))
        return {
            "summary": summary,
            "products": product_rows,
            "strategies": strategy_rows,
        }

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

    def _load_all_events(self) -> List[CustomerMemoryEvent]:
        if not self.events_path.exists():
            return []
        events: List[CustomerMemoryEvent] = []
        try:
            lines = self.events_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        for line in lines:
            event = self._event_from_line(line)
            if event is not None:
                events.append(event)
        return events

    def _load_events(self, anonymous_customer_id: str) -> List[CustomerMemoryEvent]:
        if not self.events_path.exists() or not is_valid_anonymous_customer_id(anonymous_customer_id):
            return []
        events: List[CustomerMemoryEvent] = []
        try:
            lines = self.events_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        for line in lines:
            event = self._event_from_line(line)
            if event is None:
                continue
            if event.anonymous_customer_id != anonymous_customer_id:
                continue
            events.append(event)
        return events

    def _event_from_line(self, line: str) -> Optional[CustomerMemoryEvent]:
        if not line.strip():
            return None
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            return None
        if not isinstance(value, dict):
            return None
        customer_id = str(value.get("anonymous_customer_id") or "")
        if not is_valid_anonymous_customer_id(customer_id):
            return None
        metadata = value.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        try:
            quantity = int(value.get("quantity") or 1)
        except (TypeError, ValueError):
            quantity = 1
        return CustomerMemoryEvent(
            event_type=str(value.get("event_type") or ""),
            anonymous_customer_id=customer_id,
            session_id=str(value.get("session_id") or ""),
            product_id=str(value.get("product_id") or ""),
            product_name=normalize_product_name(value.get("product_name")),
            quantity=max(1, quantity),
            strategy_id=str(value.get("strategy_id") or ""),
            occurred_at=str(value.get("occurred_at") or ""),
            event_id=str(value.get("event_id") or ""),
            metadata=self._safe_metadata(metadata),
        )

    def _conversion_event_for_order(
        self,
        order_event: CustomerMemoryEvent,
        previous_events: List[CustomerMemoryEvent],
    ) -> Optional[CustomerMemoryEvent]:
        if order_event.event_type != EVENT_ORDER_CONFIRMED:
            return None
        if not _product_keys(order_event):
            return None
        existing_conversion_source_ids = {
            str(event.metadata.get("source_recommendation_event_id") or "")
            for event in previous_events
            if event.event_type == EVENT_RECOMMENDATION_CONVERTED
        }
        order_dt = _parse_datetime(order_event.occurred_at)
        if order_dt is None:
            return None
        for candidate in reversed(previous_events):
            if candidate.event_type != EVENT_RECOMMENDATION_SHOWN:
                continue
            if candidate.session_id != order_event.session_id:
                continue
            if candidate.event_id in existing_conversion_source_ids:
                continue
            if not _events_match_product(candidate, order_event):
                continue
            shown_dt = _parse_datetime(candidate.occurred_at)
            if shown_dt is None:
                continue
            delay_seconds = int((order_dt - shown_dt).total_seconds())
            if delay_seconds < 0 or delay_seconds > RECOMMENDATION_CONVERSION_WINDOW_SECONDS:
                continue
            metadata = {
                "source_recommendation_event_id": candidate.event_id,
                "order_event_id": order_event.event_id,
                "conversion_type": EVENT_ORDER_CONFIRMED,
                "conversion_delay_seconds": delay_seconds,
                "used_customer_memory": _event_used_customer_memory(candidate),
                "recommendation_source": candidate.metadata.get("recommendation_source", ""),
            }
            return CustomerMemoryEvent(
                event_type=EVENT_RECOMMENDATION_CONVERTED,
                anonymous_customer_id=order_event.anonymous_customer_id,
                session_id=order_event.session_id,
                product_id=order_event.product_id or candidate.product_id,
                product_name=normalize_product_name(
                    order_event.product_name or candidate.product_name
                ),
                quantity=order_event.quantity,
                strategy_id=order_event.strategy_id or candidate.strategy_id,
                occurred_at=order_event.occurred_at,
                metadata=metadata,
            )
        return None

    def _safe_metadata(self, metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not isinstance(metadata, dict):
            return {}
        safe: Dict[str, Any] = {}
        for key, value in metadata.items():
            safe_key = str(key or "")[:80]
            if not safe_key:
                continue
            if isinstance(value, (str, int, float, bool)) or value is None:
                safe[safe_key] = value
            elif isinstance(value, (list, tuple)):
                safe[safe_key] = [
                    item
                    for item in value[:20]
                    if isinstance(item, (str, int, float, bool)) or item is None
                ]
            else:
                safe[safe_key] = str(value)[:240]
        return safe

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


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _event_in_range(
    event: CustomerMemoryEvent,
    from_dt: Optional[datetime],
    to_dt: Optional[datetime],
) -> bool:
    occurred_at = _parse_datetime(event.occurred_at)
    if occurred_at is None:
        return False
    if from_dt is not None and occurred_at < from_dt:
        return False
    if to_dt is not None and occurred_at > to_dt:
        return False
    return True


def _event_used_customer_memory(event: CustomerMemoryEvent) -> bool:
    value = event.metadata.get("used_customer_memory")
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return False


def _product_keys(event: CustomerMemoryEvent) -> set[str]:
    return {
        key
        for key in {
            _normalize_key(event.product_id),
            _normalize_key(normalize_product_name(event.product_name)),
        }
        if key
    }


def _events_match_product(left: CustomerMemoryEvent, right: CustomerMemoryEvent) -> bool:
    return bool(_product_keys(left) & _product_keys(right))


def _normalize_key(value: str) -> str:
    return str(value or "").strip().casefold()


def _product_name_quality_score(value: str) -> int:
    score = 0
    for char in value:
        codepoint = ord(char)
        category = unicodedata.category(char)
        if (
            0x3040 <= codepoint <= 0x30FF
            or 0x3400 <= codepoint <= 0x9FFF
            or 0xFF66 <= codepoint <= 0xFF9D
        ):
            score += 4
        elif char.isascii() and (char.isalnum() or char.isspace() or char in "-_()"):
            score += 1
        elif category.startswith("P") or category.startswith("S"):
            score += 0
        else:
            score -= 1
    for marker in ("Ã", "Â", "ã", "å", "ä", "æ", "ç", "è", "é", "ﾃ", "ﾂ", "�"):
        if marker in value:
            score -= 8
    return score


def _performance_bucket_name(event_type: str) -> str:
    return {
        EVENT_RECOMMENDATION_SHOWN: "shown",
        EVENT_RECOMMENDATION_CONVERTED: "converted",
        EVENT_RECOMMENDATION_DECLINED: "declined",
        EVENT_RECOMMENDATION_EXPIRED: "expired",
        EVENT_ORDER_CANCELLED: "cancelled",
    }.get(event_type, "")


def _empty_performance_bucket(**extra: Any) -> Dict[str, Any]:
    bucket: Dict[str, Any] = {
        "shown": 0,
        "converted": 0,
        "declined": 0,
        "cancelled": 0,
        "expired": 0,
        "conversion_rate": 0.0,
    }
    bucket.update(extra)
    return bucket


def _increment_performance_bucket(bucket: Dict[str, Any], name: str) -> None:
    bucket[name] = int(bucket.get(name) or 0) + 1


def _finalize_performance_bucket(bucket: Dict[str, Any]) -> None:
    shown = int(bucket.get("shown") or 0)
    converted = int(bucket.get("converted") or 0)
    bucket["conversion_rate"] = converted / shown if shown else 0.0
