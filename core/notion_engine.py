"""
Notion連携エンジン
会話ノードDBと遷移ルールDBを管理し、LangGraphと連携する
"""

import os
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

from .notion_client import NotionClient
from .menu_service import MenuService

logger = logging.getLogger(__name__)

class NodeType(Enum):
    """ノード種別"""
    GREETING = "greeting"
    FLOW = "flow"
    OPTION = "option"
    PROACTIVE = "proactive"
    END = "end"

class TimeSlot(Enum):
    """時間帯"""
    ALL = "all"
    LUNCH = "lunch"
    DINNER = "dinner"
    OTHER = "other"

class Season(Enum):
    """季節"""
    ALL = "all"
    SPRING = "春"
    SUMMER = "夏"
    AUTUMN = "秋"
    WINTER = "冬"

class ConditionType(Enum):
    """条件タイプ"""
    KEYWORD = "Keyword"
    OPTION_CLICK = "Option click"
    TIME_BASED = "Time based"
    PROACTIVE = "Proactive"

@dataclass
class ConversationNode:
    """会話ノード"""
    url: str
    node_id: str
    node_name: str
    node_type: NodeType
    message: Optional[str] = None
    options: List[str] = None
    time_dependency: TimeSlot = TimeSlot.ALL
    season_dependency: Season = Season.ALL
    is_start_node: bool = False
    is_end_node: bool = False
    implementation_class: Optional[str] = None
    notes: Optional[str] = None
    
    def __post_init__(self):
        if self.options is None:
            self.options = []

@dataclass
class TransitionRule:
    """遷移ルール"""
    transition_name: str
    from_urls: List[str]
    to_urls: List[str]
    condition_type: ConditionType
    condition_value: str
    priority: int = 999
    context_condition: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None

@dataclass
class UserInput:
    """ユーザー入力"""
    input_type: str  # "text" or "option"
    value: str

@dataclass
class Context:
    """コンテキスト"""
    now: datetime
    time_slot: TimeSlot
    season: Season
    proactive_flags: List[str] = None
    
    def __post_init__(self):
        if self.proactive_flags is None:
            self.proactive_flags = []

class NotionEngine:
    """Notion連携エンジン"""
    
    def __init__(self, notion_client: NotionClient, config: Any):
        self.notion_client = notion_client
        self.config = config
        
        # データベースID取得
        self.nodes_db_id = os.getenv("NOTION_DS_NODES")
        self.transitions_db_id = os.getenv("NOTION_DS_TRANSITIONS")
        self.menu_db_id = os.getenv("NOTION_DS_MENU")
        
        if not self.nodes_db_id or not self.transitions_db_id:
            logger.warning("NotionデータベースIDが設定されていません。環境変数を確認してください。")
        
        # メニューサービス初期化
        self.menu_service = MenuService(notion_client, self.menu_db_id)
    
    def _get_time_slot(self, dt: datetime) -> TimeSlot:
        """現在時刻から時間帯を判定"""
        hour = dt.hour
        if 11 <= hour < 14:
            return TimeSlot.LUNCH
        elif 17 <= hour < 22:
            return TimeSlot.DINNER
        else:
            return TimeSlot.OTHER
    
    def _get_season(self, dt: datetime) -> Season:
        """現在日付から季節を判定"""
        month = dt.month
        if month in [3, 4, 5]:
            return Season.SPRING
        elif month in [6, 7, 8]:
            return Season.SUMMER
        elif month in [9, 10, 11]:
            return Season.AUTUMN
        else:
            return Season.WINTER
    
    def _create_context(self, now: Optional[datetime] = None, **kwargs) -> Context:
        """コンテキスト作成"""
        if now is None:
            now = datetime.now()
        
        return Context(
            now=now,
            time_slot=self._get_time_slot(now),
            season=self._get_season(now),
            **kwargs
        )
    
    def get_node_by_id(self, node_id: str) -> Optional[ConversationNode]:
        """ノードIDでノードを取得"""
        try:
            if not self.nodes_db_id:
                logger.error("会話ノードDBのIDが設定されていません")
                return None
            
            # Notionからノードを取得
            pages = self.notion_client.get_pages_by_filter(
                database_id=self.nodes_db_id,
                filters=[{
                    "property": "ノードID",
                    "rich_text": {"equals": node_id}
                }]
            )
            
            if not pages:
                logger.warning(f"ノードID '{node_id}' が見つかりません")
                return None
            
            page = pages[0]
            return self._parse_node_from_page(page)
            
        except Exception as e:
            logger.error(f"ノード取得エラー: {e}")
            return None
    
    def get_start_node(self) -> Optional[ConversationNode]:
        """開始ノードを取得"""
        try:
            if not self.nodes_db_id:
                return None
            
            # 開始ノードフラグがTrueのノードを取得
            pages = self.notion_client.get_pages_by_filter(
                database_id=self.nodes_db_id,
                filters=[{
                    "property": "開始ノード",
                    "checkbox": {"equals": True}
                }]
            )
            
            if not pages:
                logger.warning("開始ノードが見つかりません")
                return None
            
            return self._parse_node_from_page(pages[0])
            
        except Exception as e:
            logger.error(f"開始ノード取得エラー: {e}")
            return None
    
    def get_transitions_from_node(self, from_node_url: str) -> List[TransitionRule]:
        """指定ノードからの遷移ルールを取得"""
        try:
            if not self.transitions_db_id:
                return []
            
            # URLからページIDを取得
            from_page_id = self._get_page_id_from_url(from_node_url)
            if not from_page_id:
                logger.warning(f"URLからページIDを取得できません: {from_node_url}")
                return []
            
            # Fromに指定ページIDが含まれ、アクティブな遷移を取得
            pages = self.notion_client.get_pages_by_filter(
                database_id=self.transitions_db_id,
                filters=[
                    {
                        "property": "From",
                        "relation": {"contains": from_page_id}
                    },
                    {
                        "property": "アクティブ",
                        "checkbox": {"equals": True}
                    }
                ]
            )
            
            transitions = []
            for page in pages:
                transition = self._parse_transition_from_page(page)
                if transition:
                    transitions.append(transition)
            
            # 優先度でソート
            transitions.sort(key=lambda x: x.priority)
            return transitions
            
        except Exception as e:
            logger.error(f"遷移ルール取得エラー: {e}")
            return []
    
    def filter_node_by_context(self, node: ConversationNode, context: Context) -> bool:
        """コンテキストに基づいてノードをフィルタ"""
        # 時間帯依存チェック
        time_ok = (node.time_dependency == TimeSlot.ALL or 
                  node.time_dependency == context.time_slot)
        
        # 季節依存チェック
        season_ok = (node.season_dependency == Season.ALL or 
                    node.season_dependency == context.season)
        
        return time_ok and season_ok
    
    def match_transition(self, transition: TransitionRule, user_input: UserInput, context: Context) -> bool:
        """遷移ルールとユーザー入力をマッチング"""
        condition_value = transition.condition_value.strip()
        
        if transition.condition_type == ConditionType.KEYWORD:
            if user_input.input_type != "text":
                return False
            # カンマ区切りのキーワードをチェック
            keywords = [k.strip() for k in condition_value.split(",") if k.strip()]
            return any(keyword in user_input.value for keyword in keywords)
        
        elif transition.condition_type == ConditionType.OPTION_CLICK:
            return (user_input.input_type == "option" and 
                   user_input.value == condition_value)
        
        elif transition.condition_type == ConditionType.TIME_BASED:
            return context.time_slot.value == condition_value
        
        elif transition.condition_type == ConditionType.PROACTIVE:
            return condition_value in context.proactive_flags
        
        return False
    
    def get_next_node(self, current_node: ConversationNode, user_input: UserInput, 
                          context: Optional[Context] = None) -> Optional[ConversationNode]:
        """次のノードを取得"""
        if context is None:
            context = self._create_context()
        
        # 現在ノードからの遷移ルールを取得
        transitions = self.get_transitions_from_node(current_node.url)
        
        # マッチする遷移を探す
        for transition in transitions:
            if self.match_transition(transition, user_input, context):
                # 遷移先ノードを取得
                if not transition.to_urls:
                    continue
                
                to_url = transition.to_urls[0]
                next_node = self._get_node_by_url(to_url)
                
                if next_node and self.filter_node_by_context(next_node, context):
                    return next_node
        
        return None
    
    def run_node(self, node_id: str, user_input: UserInput, 
                      context_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """ノードを実行"""
        try:
            # コンテキスト作成
            context = self._create_context()
            if context_override:
                for key, value in context_override.items():
                    setattr(context, key, value)
            
            # ノード取得
            node = self.get_node_by_id(node_id)
            if not node:
                return self._get_fallback_response()
            
            # コンテキストフィルタ
            if not self.filter_node_by_context(node, context):
                return self._get_fallback_response()
            
            # メッセージ本文
            base_message = node.message or ""
            
            # メニュー情報を自動追加（実装クラスに基づいて）
            menu_text = self._get_menu_for_node(node, context)
            if menu_text:
                base_message = f"{base_message}\n\n{menu_text}"
            
            # レスポンス作成
            return {
                "message": base_message,
                "options": node.options or [],
                "end": node.node_type == NodeType.END,
                "node_id": node.node_id,
                "node_type": node.node_type.value
            }
            
        except Exception as e:
            logger.error(f"ノード実行エラー: {e}")
            return self._get_fallback_response()
    
    def _get_menu_for_node(self, node: ConversationNode, context: Context) -> str:
        """ノードに応じたメニュー情報を取得"""
        if not node.implementation_class:
            return ""
        
        # 実装クラス名に基づくキーワードマッピング
        keyword_map = {
            # 馬肉系
            "basashi_akami": "馬刺し 赤身",
            "basashi_yukke": "馬刺しユッケ",
            "basashi_sushi": "馬刺し 寿司",
            "uma_kyuuri": "馬 きゅうり 巻き",
            "mini_yukke_don": "ユッケ 丼",
            "mini_aburi_don": "炙り 馬肉 丼",
            
            # サラダ系
            "char_siu_salad": "チャーシュー サラダ",
            "seafood_salad": "海鮮 サラダ",
            
            # ドリンク系
            "drink_menu": "ドリンク",
            "alcohol_menu": "アルコール",
            "beer": "ビール",
            "sake": "日本酒",
            "shochu": "焼酎",
            "senbero_set": "せんべろ",
            "senbero": "せんべろ",
            
            # その他のキーワード例
            "lunch_menu": "ランチ",
            "recommended_set": "おすすめ定食",
            "seafood_set": "海鮮定食",
            "sushi_lunch": "寿司ランチ",
            "saturday_lunch": "土曜日限定",
            
            # 弁当関連（新規追加）- Notion側の実際のデータ構造と一致
            "menu_list": "テイクアウト唐揚げ",
            "size_selection": "サイズ選択",
            "bento_chicken_katsu": "テイクアウト唐揚げ",
            "bento_karaage": "テイクアウト唐揚げ",
            "bento_karaage_regular": "テイクアウト唐揚げ",
            "bento_karaage_large": "テイクアウト唐揚げ",
            "bento_karaage_small": "テイクアウト唐揚げ",
            "bento_karaage_xl": "テイクアウト唐揚げ",
            "bento_shumai": "テイクアウト唐揚げ",
            
            # 海鮮系（強化）
            "seafood_recommend_enhanced": "海鮮",
            "lunch_kaisendon_flow": "海鮮丼",
            "maguro_don_flow_v2": "海鮮丼",
        }
        
        keyword = keyword_map.get(node.implementation_class, "")
        if not keyword:
            return ""
        
        try:
            # メニュー取得（デフォルト3件）
            menu_text = self.menu_service.get_and_format_menu(
                keyword=keyword,
                limit=3,
                in_stock=False  # 必要に応じてTrueに変更
            )
            
            if menu_text:
                logger.info(f"メニュー自動表示: ノード={node.node_id}, キーワード='{keyword}'")
            
            return menu_text
            
        except Exception as e:
            logger.error(f"メニュー取得エラー: {e}")
            return ""
    
    def _get_fallback_response(self) -> Dict[str, Any]:
        """フォールバックレスポンス"""
        return {
            "message": "申し訳ございません。もう少し詳しく教えていただけますか？",
            "options": ["メニューを見る", "おすすめを教えて", "ビールください"],
            "end": False,
            "node_id": "fallback",
            "node_type": "flow"
        }
    
    def _get_node_by_url(self, url: str) -> Optional[ConversationNode]:
        """URLからノードを取得"""
        try:
            # URLからページIDを抽出
            page_id = self._extract_page_id_from_url(url)
            if not page_id:
                return None
            
            # ページを取得
            page = self.notion_client.get_page(page_id)
            return self._parse_node_from_page(page)
            
        except Exception as e:
            logger.error(f"URLからノード取得エラー: {e}")
            return None
    
    def _extract_page_id_from_url(self, url: str) -> Optional[str]:
        """URLからページIDを抽出"""
        # NotionのURL形式: https://www.notion.so/workspace/page-id?v=view-id
        import re
        match = re.search(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', url)
        return match.group(1) if match else None
    
    def _get_page_id_from_url(self, url: str) -> str:
        """URLからページIDを取得（ハイフン無しでも可）"""
        if not url:
            return ""
        
        # URLからページID部分を抽出（UUID形式のみ）
        import re
        # UUID形式のパターンにマッチ（ハイフン有り無し両方対応）
        match = re.search(r'([a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12})', url)
        if match:
            # ハイフンを除去（Notion APIはハイフン有り無し両方対応）
            return match.group(1).replace('-', '')
        
        # UUID形式が見つからない場合は空文字を返す
        logger.warning(f"URLからUUID形式のページIDを抽出できません: {url}")
        return ""
    
    def _parse_node_from_page(self, page: Dict[str, Any]) -> ConversationNode:
        """Notionページからノードオブジェクトを作成"""
        properties = page.get("properties", {})
        
        # 種別の安全な取得
        node_type_str = self._get_property_value(properties, "種別", "select")
        logger.debug(f"種別プロパティの生データ: {properties.get('種別', {})}")
        logger.debug(f"種別の取得値: '{node_type_str}'")
        
        try:
            node_type = NodeType(node_type_str) if node_type_str else NodeType.FLOW
        except ValueError:
            logger.warning(f"無効な種別 '{node_type_str}'、デフォルトの 'flow' を使用")
            node_type = NodeType.FLOW
        
        # 時間帯依存の安全な取得
        time_dependency_str = self._get_property_value(properties, "時間帯依存", "select")
        try:
            time_dependency = TimeSlot(time_dependency_str) if time_dependency_str else TimeSlot.ALL
        except ValueError:
            logger.warning(f"無効な時間帯依存 '{time_dependency_str}'、デフォルトの 'all' を使用")
            time_dependency = TimeSlot.ALL
        
        # 季節依存の安全な取得
        season_dependency_str = self._get_property_value(properties, "季節依存", "select")
        try:
            season_dependency = Season(season_dependency_str) if season_dependency_str else Season.ALL
        except ValueError:
            logger.warning(f"無効な季節依存 '{season_dependency_str}'、デフォルトの 'all' を使用")
            season_dependency = Season.ALL
        
        return ConversationNode(
            url=page.get("url", ""),
            node_id=self._get_property_value(properties, "ノードID", "text"),
            node_name=self._get_property_value(properties, "ノード名", "title"),
            node_type=node_type,
            message=self._get_property_value(properties, "メッセージ本文", "rich_text"),
            options=self._get_property_value(properties, "選択肢", "multi_select") or [],
            time_dependency=time_dependency,
            season_dependency=season_dependency,
            is_start_node=self._get_property_value(properties, "開始ノード", "checkbox"),
            is_end_node=self._get_property_value(properties, "完了ノード", "checkbox"),
            implementation_class=self._get_property_value(properties, "実装クラス", "text"),
            notes=self._get_property_value(properties, "備考", "rich_text")
        )
    
    def _parse_transition_from_page(self, page: Dict[str, Any]) -> Optional[TransitionRule]:
        """Notionページから遷移ルールオブジェクトを作成"""
        try:
            properties = page.get("properties", {})
            
            # 条件タイプの安全な取得
            condition_type_str = self._get_property_value(properties, "条件タイプ", "select")
            try:
                condition_type = ConditionType(condition_type_str) if condition_type_str else ConditionType.KEYWORD
            except ValueError:
                logger.warning(f"無効な条件タイプ '{condition_type_str}'、デフォルトの 'Keyword' を使用")
                condition_type = ConditionType.KEYWORD
            
            return TransitionRule(
                transition_name=self._get_property_value(properties, "遷移名", "title"),
                from_urls=self._get_property_value(properties, "From", "relation") or [],
                to_urls=self._get_property_value(properties, "To", "relation") or [],
                condition_type=condition_type,
                condition_value=self._get_property_value(properties, "条件値", "text"),
                priority=self._get_property_value(properties, "優先度", "number") or 999,
                context_condition=self._get_property_value(properties, "コンテキスト条件", "text"),
                is_active=self._get_property_value(properties, "アクティブ", "checkbox"),
                notes=self._get_property_value(properties, "備考", "rich_text")
            )
        except Exception as e:
            logger.error(f"遷移ルール解析エラー: {e}")
            return None
    
    def _get_property_value(self, properties: Dict[str, Any], property_name: str, property_type: str) -> Any:
        """プロパティ値を取得"""
        prop = properties.get(property_name, {})
        
        # プロパティの型を確認
        actual_type = prop.get("type", "")
        
        if property_type == "title" or actual_type == "title":
            title_array = prop.get("title", [])
            if title_array and len(title_array) > 0:
                # plain_text を優先、なければ text.content
                return title_array[0].get("plain_text", title_array[0].get("text", {}).get("content", ""))
            return ""
        elif property_type == "text" or property_type == "rich_text" or actual_type == "rich_text":
            rich_text_array = prop.get("rich_text", [])
            if rich_text_array and len(rich_text_array) > 0:
                # plain_text を優先、なければ text.content
                return rich_text_array[0].get("plain_text", rich_text_array[0].get("text", {}).get("content", ""))
            return ""
        elif property_type == "select" or actual_type == "select":
            select_obj = prop.get("select", {})
            if select_obj:
                return select_obj.get("name", "")
            return ""
        elif property_type == "multi_select" or actual_type == "multi_select":
            multi_select_array = prop.get("multi_select", [])
            return [item.get("name", "") for item in multi_select_array if item.get("name")]
        elif property_type == "checkbox" or actual_type == "checkbox":
            return prop.get("checkbox", False)
        elif property_type == "number" or actual_type == "number":
            return prop.get("number")
        elif property_type == "relation" or actual_type == "relation":
            relation_array = prop.get("relation", [])
            return [item.get("id", "") for item in relation_array if item.get("id")]
        
        return None
