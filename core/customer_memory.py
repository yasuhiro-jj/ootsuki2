"""Pseudonymous customer memory storage for QR-based chatbot access."""

from __future__ import annotations

import json
import re
import secrets
from dataclasses import asdict, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .integrations.chatbot_ai_manager.schemas import CustomerMemoryProfile


ANONYMOUS_CUSTOMER_ID_PREFIX = "anon_"
ANONYMOUS_CUSTOMER_ID_PATTERN = re.compile(r"^anon_[a-zA-Z0-9_-]{16,64}$")
CONSENT_UNKNOWN = "unknown"
CONSENT_ACCEPTED = "consented"


def generate_anonymous_customer_id() -> str:
    return f"{ANONYMOUS_CUSTOMER_ID_PREFIX}{secrets.token_urlsafe(18)}"


def is_valid_anonymous_customer_id(value: str) -> bool:
    return bool(ANONYMOUS_CUSTOMER_ID_PATTERN.fullmatch(str(value or "").strip()))


class CustomerMemoryRepository:
    def __init__(self, path: str = "outputs/customer_memory_profiles.json") -> None:
        self.path = Path(path)

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
        consent_status = CONSENT_ACCEPTED if consent_accepted else CONSENT_UNKNOWN

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
                    CONSENT_ACCEPTED
                    if consent_accepted or profile.consent_status == CONSENT_ACCEPTED
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

    def to_public_dict(self, profile: CustomerMemoryProfile) -> Dict[str, Any]:
        data = asdict(profile)
        data["preference_tags"] = list(profile.preference_tags)
        data["favorite_items"] = list(profile.favorite_items)
        data["avoided_items"] = list(profile.avoided_items)
        data["last_ordered_items"] = list(profile.last_ordered_items)
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
                consent_status=str(value.get("consent_status") or CONSENT_UNKNOWN),
                preference_tags=tuple(value.get("preference_tags") or ()),
                favorite_items=tuple(value.get("favorite_items") or ()),
                avoided_items=tuple(value.get("avoided_items") or ()),
                last_ordered_items=tuple(value.get("last_ordered_items") or ()),
                declined_products=tuple(value.get("declined_products") or ()),
                visit_count=int(value.get("visit_count") or 0),
                last_visit_at=str(value.get("last_visit_at") or ""),
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
