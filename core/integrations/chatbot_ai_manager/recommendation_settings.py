"""Manual recommendation scoring settings for AI manager strategies."""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .repository import SalesStrategyRepository


DEFAULT_STRATEGY_ID = "default"
MIN_WEIGHT = -100
MAX_WEIGHT = 100


class RecommendationSettingsValidationError(ValueError):
    """Raised when recommendation scoring settings are invalid."""


@dataclass(frozen=True)
class RecommendationWeights:
    topic_relevance: int = 8
    repeat_order_affinity: int = 12
    repeat_count_unit: int = 4
    repeat_count_max: int = 12
    different_from_previous: int = 5
    recently_recommended_penalty: int = 6
    recommendation_history_penalty: int = 4


@dataclass(frozen=True)
class RecommendationRules:
    exclude_declined_products: bool = True
    exclude_already_suggested_in_session: bool = True


@dataclass(frozen=True)
class RecommendationSettings:
    strategy_id: str = DEFAULT_STRATEGY_ID
    strategy_priority: int = 0
    product_priorities: Dict[str, int] = field(default_factory=dict)
    weights: RecommendationWeights = field(default_factory=RecommendationWeights)
    rules: RecommendationRules = field(default_factory=RecommendationRules)
    updated_at: str = ""
    updated_by: str = "default"


@dataclass(frozen=True)
class RecommendationSettingsAuditEntry:
    strategy_id: str
    before: Dict[str, Any]
    after: Dict[str, Any]
    updated_at: str
    updated_by: str = "admin_api"


class RecommendationSettingsRepository:
    def __init__(
        self,
        path: str | Path = "outputs/ai_manager_recommendation_settings.json",
    ) -> None:
        self.path = Path(path)

    def get(self, strategy_id: str = DEFAULT_STRATEGY_ID) -> Optional[RecommendationSettings]:
        return self._settings_from_dict(self._read_all()["settings"].get(strategy_id))

    def save(self, settings: RecommendationSettings) -> RecommendationSettings:
        data = self._read_all()
        data["settings"][settings.strategy_id] = self._settings_to_dict(settings)
        self._write_all(data)
        return settings

    def append_audit(self, entry: RecommendationSettingsAuditEntry) -> None:
        data = self._read_all()
        data["audit_history"].append(asdict(entry))
        data["audit_history"] = data["audit_history"][-200:]
        self._write_all(data)

    def list_audit(self, strategy_id: Optional[str] = None) -> List[Dict[str, Any]]:
        entries = self._read_all()["audit_history"]
        if strategy_id:
            return [entry for entry in entries if entry.get("strategy_id") == strategy_id]
        return list(entries)

    def reset(self, strategy_id: str = DEFAULT_STRATEGY_ID) -> RecommendationSettings:
        data = self._read_all()
        data["settings"].pop(strategy_id, None)
        self._write_all(data)
        return RecommendationSettings(strategy_id=strategy_id)

    def _read_all(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {"settings": {}, "audit_history": []}
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError("recommendation settings storage must contain an object")
        settings = data.get("settings")
        audit_history = data.get("audit_history")
        return {
            "settings": settings if isinstance(settings, dict) else {},
            "audit_history": audit_history if isinstance(audit_history, list) else [],
        }

    def _write_all(self, data: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        tmp_path.replace(self.path)

    def _settings_to_dict(self, settings: RecommendationSettings) -> Dict[str, Any]:
        return asdict(settings)

    def _settings_from_dict(self, data: Any) -> Optional[RecommendationSettings]:
        if not isinstance(data, dict):
            return None
        try:
            return settings_from_payload(data, validate=True)
        except RecommendationSettingsValidationError:
            return None


class RecommendationSettingsService:
    def __init__(
        self,
        repository: RecommendationSettingsRepository,
        *,
        strategy_repository: Optional[SalesStrategyRepository] = None,
    ) -> None:
        self.repository = repository
        self.strategy_repository = strategy_repository

    def get_effective(self, strategy_id: str = DEFAULT_STRATEGY_ID) -> RecommendationSettings:
        default_settings = RecommendationSettings(strategy_id=strategy_id or DEFAULT_STRATEGY_ID)
        global_settings = self.repository.get(DEFAULT_STRATEGY_ID)
        strategy_settings = self.repository.get(strategy_id) if strategy_id else None
        if global_settings and strategy_id != DEFAULT_STRATEGY_ID:
            default_settings = _merge_settings(default_settings, global_settings)
            default_settings = replace(default_settings, strategy_id=strategy_id)
        if strategy_settings:
            default_settings = _merge_settings(default_settings, strategy_settings)
        return default_settings

    def get_response(
        self,
        strategy_id: str = DEFAULT_STRATEGY_ID,
        *,
        performance_provider: Optional[Callable[[str], Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        settings = self.get_effective(strategy_id)
        response = settings_to_payload(settings)
        response["audit_history"] = self.repository.list_audit(strategy_id)[-20:]
        if performance_provider:
            response["performance"] = performance_provider(strategy_id)
        return response

    def update(
        self,
        strategy_id: str,
        payload: Dict[str, Any],
        *,
        updated_by: str = "admin_api",
    ) -> RecommendationSettings:
        safe_strategy_id = str(strategy_id or DEFAULT_STRATEGY_ID).strip() or DEFAULT_STRATEGY_ID
        self._validate_strategy_exists(safe_strategy_id)
        before = self.get_effective(safe_strategy_id)
        merged = settings_to_payload(before)
        merged = _deep_merge_settings_payload(merged, payload)
        merged["strategy_id"] = safe_strategy_id
        merged["updated_at"] = _now_iso()
        merged["updated_by"] = updated_by
        after = settings_from_payload(merged, validate=True)
        self.repository.save(after)
        self.repository.append_audit(
            RecommendationSettingsAuditEntry(
                strategy_id=safe_strategy_id,
                before=settings_to_payload(before),
                after=settings_to_payload(after),
                updated_at=after.updated_at,
                updated_by=updated_by,
            )
        )
        return after

    def reset(self, strategy_id: str = DEFAULT_STRATEGY_ID) -> RecommendationSettings:
        safe_strategy_id = str(strategy_id or DEFAULT_STRATEGY_ID).strip() or DEFAULT_STRATEGY_ID
        self._validate_strategy_exists(safe_strategy_id)
        before = self.get_effective(safe_strategy_id)
        after = self.repository.reset(safe_strategy_id)
        self.repository.append_audit(
            RecommendationSettingsAuditEntry(
                strategy_id=safe_strategy_id,
                before=settings_to_payload(before),
                after=settings_to_payload(after),
                updated_at=_now_iso(),
                updated_by="admin_api",
            )
        )
        return after

    def _validate_strategy_exists(self, strategy_id: str) -> None:
        if strategy_id == DEFAULT_STRATEGY_ID or self.strategy_repository is None:
            return
        if not self.strategy_repository.get(strategy_id):
            raise KeyError(strategy_id)


def settings_from_payload(
    payload: Dict[str, Any],
    *,
    validate: bool = True,
) -> RecommendationSettings:
    strategy_id = str(payload.get("strategy_id") or DEFAULT_STRATEGY_ID).strip()
    weights_data = payload.get("weights") or {}
    rules_data = payload.get("rules") or {}
    product_priorities = payload.get("product_priorities") or {}
    if not isinstance(weights_data, dict):
        raise RecommendationSettingsValidationError("weights must be an object")
    if not isinstance(rules_data, dict):
        raise RecommendationSettingsValidationError("rules must be an object")
    if not isinstance(product_priorities, dict):
        raise RecommendationSettingsValidationError("product_priorities must be an object")

    settings = RecommendationSettings(
        strategy_id=strategy_id or DEFAULT_STRATEGY_ID,
        strategy_priority=_int_value(payload.get("strategy_priority", 0), "strategy_priority"),
        product_priorities={
            str(key): _int_value(value, f"product_priorities.{key}")
            for key, value in product_priorities.items()
            if str(key).strip()
        },
        weights=RecommendationWeights(
            topic_relevance=_int_value(weights_data.get("topic_relevance", 8), "topic_relevance"),
            repeat_order_affinity=_int_value(
                weights_data.get("repeat_order_affinity", 12),
                "repeat_order_affinity",
            ),
            repeat_count_unit=_int_value(
                weights_data.get("repeat_count_unit", 4),
                "repeat_count_unit",
            ),
            repeat_count_max=_int_value(
                weights_data.get("repeat_count_max", 12),
                "repeat_count_max",
            ),
            different_from_previous=_int_value(
                weights_data.get("different_from_previous", 5),
                "different_from_previous",
            ),
            recently_recommended_penalty=_int_value(
                weights_data.get("recently_recommended_penalty", 6),
                "recently_recommended_penalty",
            ),
            recommendation_history_penalty=_int_value(
                weights_data.get("recommendation_history_penalty", 4),
                "recommendation_history_penalty",
            ),
        ),
        rules=RecommendationRules(
            exclude_declined_products=bool(
                rules_data.get("exclude_declined_products", True)
            ),
            exclude_already_suggested_in_session=bool(
                rules_data.get("exclude_already_suggested_in_session", True)
            ),
        ),
        updated_at=str(payload.get("updated_at") or ""),
        updated_by=str(payload.get("updated_by") or "admin_api"),
    )
    if validate:
        validate_settings(settings)
    return settings


def settings_to_payload(settings: RecommendationSettings) -> Dict[str, Any]:
    return asdict(settings)


def validate_settings(settings: RecommendationSettings) -> None:
    if not settings.strategy_id:
        raise RecommendationSettingsValidationError("strategy_id is required")
    for name, value in {
        "strategy_priority": settings.strategy_priority,
        **settings.product_priorities,
        **asdict(settings.weights),
    }.items():
        if not MIN_WEIGHT <= int(value) <= MAX_WEIGHT:
            raise RecommendationSettingsValidationError(
                f"{name} must be between {MIN_WEIGHT} and {MAX_WEIGHT}"
            )
    if settings.weights.repeat_count_max < 0:
        raise RecommendationSettingsValidationError("repeat_count_max cannot be negative")
    if settings.weights.repeat_count_unit < 0:
        raise RecommendationSettingsValidationError("repeat_count_unit cannot be negative")
    if not settings.rules.exclude_declined_products:
        raise RecommendationSettingsValidationError("declined product exclusion is required")
    if not settings.rules.exclude_already_suggested_in_session:
        raise RecommendationSettingsValidationError("session repeat exclusion is required")


def _merge_settings(
    base: RecommendationSettings,
    override: RecommendationSettings,
) -> RecommendationSettings:
    return RecommendationSettings(
        strategy_id=override.strategy_id or base.strategy_id,
        strategy_priority=override.strategy_priority,
        product_priorities={**base.product_priorities, **override.product_priorities},
        weights=override.weights,
        rules=override.rules,
        updated_at=override.updated_at or base.updated_at,
        updated_by=override.updated_by or base.updated_by,
    )


def _deep_merge_settings_payload(
    base: Dict[str, Any],
    override: Dict[str, Any],
) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if key in {"weights", "rules", "product_priorities"} and isinstance(value, dict):
            existing = merged.get(key) if isinstance(merged.get(key), dict) else {}
            merged[key] = {**existing, **value}
        else:
            merged[key] = value
    return merged


def _int_value(value: Any, field_name: str) -> int:
    if isinstance(value, bool):
        raise RecommendationSettingsValidationError(f"{field_name} must be a number")
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise RecommendationSettingsValidationError(f"{field_name} must be a number") from exc
    if math.isnan(numeric) or math.isinf(numeric):
        raise RecommendationSettingsValidationError(f"{field_name} must be finite")
    if int(numeric) != numeric:
        raise RecommendationSettingsValidationError(f"{field_name} must be an integer")
    return int(numeric)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
