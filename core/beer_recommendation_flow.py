import logging
import os
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .menu_service import MenuItemView, MenuService
from .notion_client import NotionClient

logger = logging.getLogger(__name__)

BEER_FLOW_ID = "beer_order_recommend_flow_v1"
BEER_START_STEP_ID = "beer_start"
BEER_FLOW_DB_TITLE = "実験｜生ビール注文おすすめ会話フローチャートDB"

BEER_TRIGGERS = ("生ビール", "ビール", "中生", "まずビール")

SAKE_FLOW_ID = "sake_recommend_flow_v1"
SAKE_START_STEP_ID = "sake_start"
SAKE_FLOW_DB_TITLE = "実験｜日本酒注文おすすめ会話フローチャートDB"
SAKE_TRIGGERS = ("日本酒", "冷酒", "熱燗", "地酒")


@dataclass
class BeerFlowStep:
    step_name: str
    flow_id: str
    step_id: str
    step_type: str
    trigger: str
    bot_message: str
    user_choices: str
    next_step_ids: str
    menu_filter: str
    menu_items: str
    menu_ids: str
    priority: int
    enabled: bool
    notes: str = ""


@dataclass
class BeerFlowResult:
    handled: bool
    response: str = ""
    options: Optional[List[str]] = None
    selected_recommendation: Optional[Dict[str, str]] = None


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text or "")).lower()


def parse_csv(value: str) -> List[str]:
    return [v.strip() for v in re.split(r"[,/、]", value or "") if v.strip()]


def contains_any(message: str, keywords: List[str]) -> bool:
    return any(normalize_text(keyword) in message for keyword in keywords)


def is_beer_trigger(message: str) -> bool:
    return any(normalize_text(trigger) in message for trigger in BEER_TRIGGERS)


class BeerRecommendationFlowService:
    def __init__(
        self,
        notion_client: NotionClient,
        config: Any,
        menu_service: MenuService,
        flow_id: str = BEER_FLOW_ID,
        start_step_id: str = BEER_START_STEP_ID,
        flow_db_title: str = BEER_FLOW_DB_TITLE,
        triggers: Tuple[str, ...] = BEER_TRIGGERS,
        memory_prefix: str = "beer",
    ):
        self.notion_client = notion_client
        self.config = config
        self.menu_service = menu_service
        self.flow_id = flow_id
        self.start_step_id = start_step_id
        self.flow_db_title = flow_db_title
        self.triggers = triggers
        self.memory_prefix = memory_prefix
        self._flow_db_id: Optional[str] = None
        self._steps_cache: Optional[List[BeerFlowStep]] = None
        self._menu_cache: Optional[List[MenuItemView]] = None

    def handle(self, user_message: str, session_memory: Dict[str, Any]) -> BeerFlowResult:
        normalized_message = normalize_text(user_message)
        is_active = session_memory.get(f"{self.memory_prefix}_current_flow_id") == self.flow_id

        if not self.is_trigger(normalized_message) and not is_active:
            return BeerFlowResult(handled=False)

        steps = self.load_steps()
        if not steps:
            return BeerFlowResult(
                handled=True,
                response=self.empty_steps_fallback(),
                options=self.start_options(),
            )

        current_step_id = (
            session_memory.get(f"{self.memory_prefix}_current_step_id")
            if is_active and session_memory.get(f"{self.memory_prefix}_current_step_id")
            else self.start_step_id
        )
        current_step = self.find_step_by_id(steps, current_step_id) or self.find_start_step(steps)

        if not current_step:
            return BeerFlowResult(
                handled=True,
                response=self.missing_start_fallback(),
                options=self.start_options(),
            )

        next_step = self.resolve_next_step(normalized_message, current_step, steps)
        step_to_respond = next_step or current_step
        response, options = self.build_recommendation_response(step_to_respond)

        selected = self.extract_selected_recommendation(step_to_respond)
        return BeerFlowResult(
            handled=True,
            response=response,
            options=options,
            selected_recommendation=selected,
        )

    def is_flow_end_step(self, step_id: Optional[str]) -> bool:
        if not step_id:
            return True
        step = self.find_step_by_id(self.load_steps(), step_id)
        return bool(
            step
            and (
                step.step_type in {"終了", "提案終了"}
                or step.step_id in {"flow_complete", "sake_flow_complete", "sake_only_end"}
            )
        )

    def resolve_flow_memory(self, result: BeerFlowResult) -> Dict[str, Any]:
        if not result.handled:
            return {}

        selected = result.selected_recommendation or {}
        step_id = selected.get("step_id")
        is_end = self.is_flow_end_step(step_id) or bool(selected.get("menu_name"))
        updates: Dict[str, Any] = {
            "active_topic": f"{self.memory_prefix}_recommendation",
            "pending_flow": "" if is_end else f"{self.memory_prefix}_recommendation",
            f"{self.memory_prefix}_current_flow_id": "" if is_end else self.flow_id,
            f"{self.memory_prefix}_current_step_id": "" if is_end else (step_id or self.start_step_id),
            "order_intent_level": "none",
        }
        if selected.get("menu_name"):
            updates[f"{self.memory_prefix}_selected_recommendation"] = selected
        return updates

    def load_steps(self) -> List[BeerFlowStep]:
        if self._steps_cache is not None:
            return self._steps_cache

        db_id = self._get_flow_db_id()
        if not db_id:
            logger.warning("[BeerFlow] flow DB id was not found")
            self._steps_cache = []
            return self._steps_cache

        pages = self.notion_client.get_all_pages(db_id)
        steps = [self._map_page_to_step(page) for page in pages]
        self._steps_cache = sorted(
            [
                step
                for step in steps
                if step.flow_id == self.flow_id and step.enabled
            ],
            key=lambda step: step.priority,
        )
        logger.info("[BeerFlow] loaded %d enabled steps", len(self._steps_cache))
        return self._steps_cache

    def _get_flow_db_id(self) -> Optional[str]:
        if self._flow_db_id:
            return self._flow_db_id

        configured = (
            self.config.get(f"notion.database_ids.{self.memory_prefix}_recommend_flow_db")
            or os.getenv(f"NOTION_{self.memory_prefix.upper()}_RECOMMEND_FLOW_DB_ID")
        )
        if configured:
            self._flow_db_id = configured
            return configured

        client = getattr(self.notion_client, "client", None)
        if not client:
            return None

        try:
            response = client.search(
                query=self.flow_db_title,
                filter={"value": "database", "property": "object"},
                page_size=10,
            )
            for item in response.get("results", []):
                title_parts = item.get("title", [])
                title = "".join(part.get("plain_text", "") for part in title_parts)
                if title == self.flow_db_title:
                    self._flow_db_id = item.get("id")
                    return self._flow_db_id
        except Exception as exc:
            logger.warning("[BeerFlow] database search failed: %s", exc)

        return None

    def _prop(self, page: Dict[str, Any], name: str, default: Any = "") -> Any:
        value = self.notion_client.get_property_value(page, name)
        return default if value is None else value

    def _map_page_to_step(self, page: Dict[str, Any]) -> BeerFlowStep:
        return BeerFlowStep(
            step_name=str(self._prop(page, "ステップ名", "")),
            flow_id=str(self._prop(page, "フローID", "")),
            step_id=str(self._prop(page, "ステップID", "")),
            step_type=str(self._prop(page, "ステップ種別", "カテゴリ分岐")),
            trigger=str(self._prop(page, "トリガー", "")),
            bot_message=str(self._prop(page, "Botメッセージ", "")),
            user_choices=str(self._prop(page, "ユーザー選択肢", "")),
            next_step_ids=str(self._prop(page, "次ステップID", "")),
            menu_filter=str(self._prop(page, "メニューDB参照条件", "")),
            menu_items=str(self._prop(page, "候補メニュー", "")),
            menu_ids=str(self._prop(page, "参照メニューID", "")),
            priority=int(self._prop(page, "優先度", 999) or 999),
            enabled=bool(self._prop(page, "有効", False)),
            notes=str(self._prop(page, "設計メモ", "")),
        )

    def find_step_by_id(self, steps: List[BeerFlowStep], step_id: str) -> Optional[BeerFlowStep]:
        return next((step for step in steps if step.step_id == step_id), None)

    def find_start_step(self, steps: List[BeerFlowStep]) -> Optional[BeerFlowStep]:
        return (
            self.find_step_by_id(steps, self.start_step_id)
            or next((step for step in steps if step.step_type == "開始"), None)
            or (sorted(steps, key=lambda step: step.priority)[0] if steps else None)
        )

    def is_trigger(self, message: str) -> bool:
        return any(normalize_text(trigger) in message for trigger in self.triggers)

    def empty_steps_fallback(self) -> str:
        if self.memory_prefix == "sake":
            return "日本酒に合わせるなら、刺身海鮮系、寿司系、天ぷら系のおつまみがおすすめです。"
        return "生ビールに合わせるなら、刺身系、唐揚げ系、軽めのおつまみがおすすめです。"

    def missing_start_fallback(self) -> str:
        if self.memory_prefix == "sake":
            return "日本酒に合うおすすめをご提案できます。刺身海鮮系、寿司系、天ぷら系があります。"
        return "生ビールですね。ご一緒におつまみはいかがですか？\n刺身系、唐揚げ系、その他のおつまみからおすすめできます。"

    def start_options(self) -> List[str]:
        if self.memory_prefix == "sake":
            return ["刺身海鮮系を見る", "寿司系を見る", "天ぷら揚げ物系を見る", "日本酒だけで進む"]
        return ["刺身系を見る", "唐揚げ系を見る", "その他のおつまみを見る", "ビールだけで進む"]

    def resolve_next_step(
        self,
        user_message: str,
        current_step: BeerFlowStep,
        steps: List[BeerFlowStep],
    ) -> Optional[BeerFlowStep]:
        next_step_ids = parse_csv(current_step.next_step_ids)
        next_candidates = [
            step for step_id in next_step_ids
            if (step := self.find_step_by_id(steps, step_id))
        ]

        direct_match = self.match_by_trigger(user_message, next_candidates)
        if direct_match:
            return direct_match

        if self.memory_prefix == "sake":
            if contains_any(user_message, ["刺身", "海鮮", "魚", "さっぱり", "まぐろ", "あじ"]):
                return self.find_step_by_id(steps, "sake_sashimi_category") or self.match_by_trigger(user_message, steps)
            if contains_any(user_message, ["寿司", "すし", "握り", "6貫", "10貫"]):
                return self.find_step_by_id(steps, "sake_sushi_category") or self.match_by_trigger(user_message, steps)
            if contains_any(user_message, ["天ぷら", "揚げ物", "フライ", "かき揚げ", "桜エビ"]):
                return self.find_step_by_id(steps, "sake_tempura_category") or self.match_by_trigger(user_message, steps)
            if contains_any(user_message, ["いらない", "不要", "大丈夫", "日本酒だけ", "つまみ不要"]):
                return self.find_step_by_id(steps, "sake_only_end") or self.find_step_by_id(steps, "sake_flow_complete")
            return self.match_by_trigger(user_message, steps)

        if contains_any(user_message, ["刺身", "海鮮", "魚", "さっぱり"]):
            return self.find_step_by_id(steps, "beer_sashimi_category") or self.match_by_trigger(user_message, next_candidates)
        if contains_any(user_message, ["唐揚げ", "からあげ", "揚げ物", "フライ"]):
            return self.find_step_by_id(steps, "beer_karaage_category") or self.match_by_trigger(user_message, next_candidates)
        if contains_any(user_message, ["その他", "軽め", "つまみ", "おつまみ", "別"]):
            return self.find_step_by_id(steps, "beer_other_category") or self.match_by_trigger(user_message, next_candidates)
        if contains_any(user_message, ["いらない", "不要", "大丈夫", "ビールだけ"]):
            return self.find_step_by_id(steps, "beer_only_confirm") or self.find_step_by_id(steps, "flow_complete")

        product_match = self.match_by_trigger(user_message, next_candidates)
        if product_match:
            return product_match

        return self.match_by_trigger(
            user_message,
            [step for step in steps if step.step_type == "商品提案"],
        )

    def match_by_trigger(self, user_message: str, steps: List[BeerFlowStep]) -> Optional[BeerFlowStep]:
        for step in steps:
            if any(normalize_text(trigger) in user_message for trigger in parse_csv(step.trigger)):
                return step
        return None

    def build_recommendation_response(self, step: BeerFlowStep) -> Tuple[str, List[str]]:
        lines: List[str] = []
        if step.bot_message:
            lines.append(step.bot_message)

        canonical_items = self.resolve_canonical_menu_items(step)
        display_items = [self.format_menu_item(item) for item in canonical_items]
        if not display_items:
            display_items = parse_csv(step.menu_items)

        if display_items:
            lines.extend(["", "おすすめ候補:"])
            lines.extend([f"- {item}" for item in display_items])

        options = self.extract_options(step, display_items)
        if step.user_choices:
            lines.extend(["", "選べる内容:"])
            lines.extend([f"- {choice}" for choice in options])

        if step.step_type == "商品提案" and self.memory_prefix == "sake":
            lines.extend(["", "こちらは注文確定ではなく、おすすめ提案です。"])
            lines.append("日本酒に合わせるなら、こういったおつまみがおすすめです。")

        if not lines:
            if self.memory_prefix == "sake":
                lines.append("日本酒に合わせるなら、こういったおつまみがおすすめです。")
            else:
                lines.append("生ビールには、選択されたようなおつまみもおすすめです。")

        return "\n".join(lines), options

    def extract_options(self, step: BeerFlowStep, display_items: List[str]) -> List[str]:
        if step.user_choices:
            return [
                choice
                for choice in parse_csv(step.user_choices.replace("/", ","))
                if choice
            ]
        return [self.strip_price(item) for item in display_items]

    def resolve_canonical_menu_items(self, step: BeerFlowStep) -> List[MenuItemView]:
        menu_refs = parse_csv(step.menu_ids)
        candidate_names = [self.strip_price(item) for item in parse_csv(step.menu_items)]
        if not menu_refs and not candidate_names:
            return []

        all_menus = self.load_menu_items()
        by_id = {
            (item.page_id or "").replace("-", ""): item
            for item in all_menus
            if item.page_id
        }
        by_name = {
            normalize_text(item.name): item
            for item in all_menus
            if item.name
        }

        resolved: List[MenuItemView] = []
        seen: set[str] = set()
        for ref in menu_refs:
            key = ref.replace("-", "")
            item = by_id.get(key) or by_name.get(normalize_text(ref))
            if item and item.name not in seen:
                resolved.append(item)
                seen.add(item.name)

        for name in candidate_names:
            item = by_name.get(normalize_text(name))
            if item and item.name not in seen:
                resolved.append(item)
                seen.add(item.name)

        return resolved

    def load_menu_items(self) -> List[MenuItemView]:
        if self._menu_cache is not None:
            return self._menu_cache

        menu_db_id = getattr(self.menu_service, "menu_db_id", None)
        if not menu_db_id:
            self._menu_cache = []
            return self._menu_cache

        pages = self.notion_client.get_all_pages(menu_db_id)
        self._menu_cache = self.menu_service._convert_pages_to_menu_items(pages)
        return self._menu_cache

    def format_menu_item(self, item: MenuItemView) -> str:
        if item.price is None:
            return item.name
        return f"{item.name} {int(item.price):,}円"

    def strip_price(self, value: str) -> str:
        value = re.sub(r"\s*\d[\d,]*\s*円\s*$", "", value or "")
        value = re.sub(r"\s*\d[\d,]*\s*蜀・\s*$", "", value)
        return value.strip()

    def extract_selected_recommendation(self, step: BeerFlowStep) -> Optional[Dict[str, str]]:
        selected: Dict[str, str] = {"step_id": step.step_id}
        if step.step_type != "商品提案":
            return selected

        menu_name = re.sub(r"^\d+\s*", "", step.step_name)
        menu_name = menu_name.replace("おすすめ提案｜", "").strip()
        canonical_items = self.resolve_canonical_menu_items(step)
        if canonical_items:
            selected["menu_name"] = canonical_items[0].name
            if canonical_items[0].page_id:
                selected["menu_id"] = canonical_items[0].page_id
        elif menu_name:
            selected["menu_name"] = menu_name
            menu_ids = parse_csv(step.menu_ids)
            if menu_ids:
                selected["menu_id"] = menu_ids[0]
        return selected


class SakeRecommendationFlowService(BeerRecommendationFlowService):
    def __init__(
        self,
        notion_client: NotionClient,
        config: Any,
        menu_service: MenuService,
    ):
        super().__init__(
            notion_client=notion_client,
            config=config,
            menu_service=menu_service,
            flow_id=SAKE_FLOW_ID,
            start_step_id=SAKE_START_STEP_ID,
            flow_db_title=SAKE_FLOW_DB_TITLE,
            triggers=SAKE_TRIGGERS,
            memory_prefix="sake",
        )
