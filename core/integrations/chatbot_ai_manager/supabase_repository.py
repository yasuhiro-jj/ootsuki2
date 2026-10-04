"""Read-only repository that loads AI Manager generated strategies from Supabase.

AI Manager（Next.js）が `chatbot_sales_strategies` に書いた戦略を読むだけの実装。
チャットボットからは書き込まない（読み取り専用ロールを想定）。

接続できないときは最後に読めた内容（ローカルキャッシュ）を使い、
それも無ければ空を返す。推薦を止める方向に倒し、例外は呼び出し元へ伝播させない。
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .schemas import SalesStrategy, product_from_payload

logger = logging.getLogger(__name__)

DEFAULT_CACHE_TTL_SECONDS = 600
DEFAULT_CACHE_PATH = "outputs/ai_manager_sales_strategies.auto_cache.json"

_SELECT_PUBLISHED_SQL = """
SELECT payload
FROM chatbot_sales_strategies
WHERE tenant_key = %s
  AND status = 'published'
ORDER BY created_at DESC
LIMIT 20
"""


def strategy_from_payload(data: Dict[str, Any]) -> SalesStrategy:
    """Supabase の payload(jsonb) を SalesStrategy へ変換する。"""

    products = [
        product_from_payload(product)
        for product in data.get("priority_products", []) or []
        if isinstance(product, dict)
    ]
    return SalesStrategy(
        strategy_id=str(data.get("strategy_id", "")),
        name=str(data.get("name", "")),
        priority_products=tuple(products),
        sales_goal=str(data.get("sales_goal", "")),
        active=bool(data.get("active", True)),
        valid_from=str(data.get("valid_from", "")),
        valid_until=str(data.get("valid_until", "")),
        max_suggestions_per_session=int(data.get("max_suggestions_per_session", 1) or 1),
        allowed_topics=tuple(data.get("allowed_topics", ()) or ()),
        blocked_intents=tuple(data.get("blocked_intents", ()) or ()),
        generated_by=str(data.get("generated_by", "ai_manager_auto")),
        created_at=str(data.get("created_at", "")),
        updated_at=str(data.get("updated_at", "")),
    )


class SupabaseSalesStrategyRepository:
    """Read-only view of AI Manager published strategies."""

    def __init__(
        self,
        dsn: Optional[str] = None,
        tenant_key: Optional[str] = None,
        *,
        cache_ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS,
        cache_path: str | Path = DEFAULT_CACHE_PATH,
    ) -> None:
        self.dsn = (dsn or os.getenv("CHATBOT_STRATEGY_DB_URL") or "").strip()
        self.tenant_key = (
            tenant_key or os.getenv("CHATBOT_STRATEGY_TENANT_KEY") or "ootsuki"
        ).strip()
        self.cache_ttl_seconds = cache_ttl_seconds
        self.cache_path = Path(cache_path)
        self._cache: Optional[List[SalesStrategy]] = None
        self._cache_expiry = 0.0

    @property
    def enabled(self) -> bool:
        return bool(self.dsn)

    def list(self, include_inactive: bool = True) -> List[SalesStrategy]:
        strategies = self._load()
        if include_inactive:
            return list(strategies)
        return [strategy for strategy in strategies if strategy.active]

    def get(self, strategy_id: str) -> Optional[SalesStrategy]:
        for strategy in self.list(include_inactive=True):
            if strategy.strategy_id == strategy_id:
                return strategy
        return None

    def _load(self) -> List[SalesStrategy]:
        now = time.monotonic()
        if self._cache is not None and now < self._cache_expiry:
            return self._cache

        if not self.enabled:
            return []

        try:
            payloads = self._fetch_payloads()
        except Exception as exc:
            logger.warning(
                "[SalesStrategy] supabase fetch failed (%s). falling back to cache file.",
                exc.__class__.__name__,
            )
            strategies = self._read_cache_file()
            # 取得できなかったときは短めに再試行する。
            self._cache = strategies
            self._cache_expiry = now + min(60, self.cache_ttl_seconds)
            return strategies

        strategies = [strategy_from_payload(payload) for payload in payloads]
        self._cache = strategies
        self._cache_expiry = now + self.cache_ttl_seconds
        self._write_cache_file(payloads)
        return strategies

    def _fetch_payloads(self) -> List[Dict[str, Any]]:
        import psycopg  # 遅延 import。未インストール環境でも本モジュールは読み込める。

        payloads: List[Dict[str, Any]] = []
        with psycopg.connect(self.dsn, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute(_SELECT_PUBLISHED_SQL, (self.tenant_key,))
                for row in cursor.fetchall():
                    payload = row[0]
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                    if isinstance(payload, dict):
                        payloads.append(payload)
        return payloads

    def _read_cache_file(self) -> List[SalesStrategy]:
        try:
            if not self.cache_path.exists():
                return []
            with self.cache_path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except Exception:
            return []
        items = data.get("strategies") if isinstance(data, dict) else data
        if not isinstance(items, list):
            return []
        return [
            strategy_from_payload(item) for item in items if isinstance(item, dict)
        ]

    def _write_cache_file(self, payloads: List[Dict[str, Any]]) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self.cache_path.with_suffix(f"{self.cache_path.suffix}.tmp")
            with tmp_path.open("w", encoding="utf-8") as handle:
                json.dump({"strategies": payloads}, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            tmp_path.replace(self.cache_path)
        except Exception as exc:
            logger.warning(
                "[SalesStrategy] cache write failed (%s)", exc.__class__.__name__
            )


_SELECT_EXCLUSIONS_SQL = """
SELECT menu_page_id, product_name
FROM chatbot_recommendation_exclusions
WHERE tenant_key = %s
"""


def _normalize_name(value: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKC", str(value or ""))
    return "".join(text.split()).lower()


class SupabaseExclusionList:
    """CEO が AI Manager の画面で指定した「おすすめに出さない商品」。

    一度も読めていない状態で DSN が設定されている場合は、確認できないものとして
    「除外扱い（＝推薦しない）」に倒す。一度読めた後は最後の正常値を使う。
    """

    def __init__(
        self,
        dsn: Optional[str] = None,
        tenant_key: Optional[str] = None,
        *,
        cache_ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS,
    ) -> None:
        self.dsn = (dsn or os.getenv("CHATBOT_STRATEGY_DB_URL") or "").strip()
        self.tenant_key = (
            tenant_key or os.getenv("CHATBOT_STRATEGY_TENANT_KEY") or "ootsuki"
        ).strip()
        self.cache_ttl_seconds = cache_ttl_seconds
        self._page_ids: Optional[set] = None
        self._names: Optional[set] = None
        self._cache_expiry = 0.0

    @property
    def enabled(self) -> bool:
        return bool(self.dsn)

    def is_excluded(self, page_id: str = "", name: str = "") -> bool:
        if not self.enabled:
            return False
        self._refresh()
        if self._page_ids is None or self._names is None:
            # 一度も読めていない。確認できないので推薦しない側に倒す。
            return True
        normalized_page_id = str(page_id or "").replace("-", "")
        if normalized_page_id and normalized_page_id in self._page_ids:
            return True
        if name and _normalize_name(name) in self._names:
            return True
        return False

    def _refresh(self) -> None:
        now = time.monotonic()
        if self._page_ids is not None and now < self._cache_expiry:
            return
        try:
            import psycopg

            page_ids: set = set()
            names: set = set()
            with psycopg.connect(self.dsn, connect_timeout=5) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(_SELECT_EXCLUSIONS_SQL, (self.tenant_key,))
                    for menu_page_id, product_name in cursor.fetchall():
                        if menu_page_id:
                            page_ids.add(str(menu_page_id).replace("-", ""))
                        if product_name:
                            names.add(_normalize_name(product_name))
            self._page_ids = page_ids
            self._names = names
            self._cache_expiry = now + self.cache_ttl_seconds
        except Exception as exc:
            logger.warning(
                "[SalesStrategy] exclusion list fetch failed (%s)",
                exc.__class__.__name__,
            )
            # 最後の正常値があればそれを使い続ける。無ければ None のまま（＝除外扱い）。
            self._cache_expiry = now + min(60, self.cache_ttl_seconds)
