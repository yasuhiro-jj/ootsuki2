"""
Simple Graph Engine

シンプルなLangGraphフロー（おおつき飲食店用）
- greeting → alcohol_flow / food_flow / proactive_recommend
- プロアクティブなおすすめ機能付き
"""

from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from typing import List, Dict, Any, Optional, Tuple
from typing_extensions import TypedDict
from datetime import datetime
import logging

from .line_contact import append_line_contact_link, log_unknown_keyword_to_notion
from .conversation_utils import build_chat_messages

logger = logging.getLogger(__name__)

# --- 状態定義 ---
class State(TypedDict):
    messages: List[str]
    intent: str
    context: Dict[str, Any]  # 時間帯、季節、セッションID等
    response: str
    options: List[str]
    should_push: bool  # プロアクティブ送信フラグ
    session_id: str


class SimpleGraphEngine:
    """
    シンプルなLangGraphエンジン（おおつき飲食店用）
    
    【重要原則】Notion中心アーキテクチャ
    - Notionデータベースが唯一の真実の情報源（SSOT）
    - ノードID、選択肢、遷移先はすべてNotion DBから動的取得
    - ハードコードされたマッピングは使用しない
    """
    
    def __init__(self, llm, notion_client=None, config=None, menu_service=None, conversation_system=None):
        """
        Args:
            llm: ChatOpenAIインスタンス
            notion_client: NotionClientインスタンス（オプション）
            config: ConfigLoaderインスタンス（オプション）
            menu_service: MenuServiceインスタンス（オプション）
            conversation_system: ConversationNodeSystemインスタンス（オプション）
        """
        self.llm = llm
        self.notion_client = notion_client
        self.config = config
        self.menu_service = menu_service
        self.conversation_system = conversation_system
        self.graph = None
        self._fried_cache: Dict[str, Any] = {}
        
        # クロスリフレクションエンジン（遅延初期化対応）
        self.cross_reflection_engine = None
        self._initialize_cross_reflection_engine()
    
    def build_graph(self):
        """グラフ構築"""
        graph = StateGraph(State)
        
        # ノード追加
        graph.add_node("greeting", self.greeting)
        graph.add_node("alcohol_flow", self.alcohol_flow)
        graph.add_node("food_flow", self.food_flow)
        graph.add_node("bento_flow", self.bento_flow)
        graph.add_node("sashimi_flow", self.sashimi_flow)
        graph.add_node("banquet_flow", self.banquet_flow)
        graph.add_node("proactive_recommend", self.proactive_recommend)
        graph.add_node("option_click", self.option_click)
        graph.add_node("general_response", self.general_response)
        graph.add_node("end_flow", self.end_flow)
        
        # エッジ設定
        graph.add_edge(START, "greeting")
        graph.add_conditional_edges("greeting", self.route_intent, {
            "alcohol_flow": "alcohol_flow",
            "food_flow": "food_flow",
            "bento_flow": "bento_flow",
            "sashimi_flow": "sashimi_flow",
            "banquet_flow": "banquet_flow",
            "proactive_recommend": "proactive_recommend",
            "option_click": "option_click",
            "general": "general_response",
            END: END
        })
        graph.add_edge("alcohol_flow", "end_flow")
        graph.add_edge("food_flow", "end_flow")
        graph.add_edge("bento_flow", "end_flow")
        graph.add_edge("sashimi_flow", "end_flow")
        graph.add_edge("banquet_flow", "end_flow")
        graph.add_edge("proactive_recommend", "end_flow")
        graph.add_edge("option_click", "end_flow")
        graph.add_edge("general_response", "end_flow")
        graph.add_edge("end_flow", END)
        
        self.graph = graph.compile()
        logger.info("✅ シンプルグラフ構築完了")
        return self.graph
    
    # --- ノード実装 ---

    def _initialize_cross_reflection_engine(self) -> bool:
        """
        クロスリフレクションエンジンを初期化
        
        Returns:
            bool: 初期化に成功した場合True
        """
        if self.cross_reflection_engine is not None:
            return True
        
        try:
            from core.cross_reflection_engine import CrossReflectionEngine
            self.cross_reflection_engine = CrossReflectionEngine(
                llm=self.llm,
                notion_client=self.notion_client,
                menu_service=self.menu_service,
                config=self.config
            )
            logger.info(
                "[CrossReflection] ✅ クロスリフレクションエンジンを初期化しました "
                f"(llm_available={self.llm is not None}, "
                f"notion_client={self.notion_client is not None}, "
                f"menu_service={self.menu_service is not None})"
            )
            return True
        except ImportError as e:
            logger.warning(f"[CrossReflection] ⚠️ インポートエラー: {e}")
            logger.warning("[CrossReflection] クロスリフレクション機能は無効化されます")
        except Exception as e:
            logger.warning(f"[CrossReflection] ⚠️ クロスリフレクションエンジンの初期化に失敗: {e}")
            import traceback
            logger.warning(f"[CrossReflection] トレースバック: {traceback.format_exc()}")
        
        self.cross_reflection_engine = None
        return False
    
    def _ensure_cross_reflection_engine(self) -> bool:
        """必要に応じてクロスリフレクションエンジンを初期化"""
        return self._initialize_cross_reflection_engine()
    
    def greeting(self, state: State) -> State:
        """挨拶ノード（人間味のある接客・時間帯対応）"""
        logger.info("[Node] greeting")
        
        # コンテキスト収集（時間帯判定）
        existing_context_keys = list((state.get("context") or {}).keys())
        logger.info(f"[Greeting] 既存コンテキストキー: {existing_context_keys}")
        context = self._update_time_context(state)
        updated_context_keys = list(context.keys())
        logger.info(f"[Greeting] 更新後コンテキストキー: {updated_context_keys}")
        time_zone = context.get("time_zone", "other")
        hour = context.get("hour", 0)
        
        # 時間帯に応じた挨拶
        if 5 <= hour < 11:
            greeting_msg = "おはようございます"
        elif 11 <= hour < 17:
            greeting_msg = "こんにちは"
        else:
            greeting_msg = "こんばんは"
        
        # 時間帯に応じた選択肢
        if time_zone == "lunch":
            # ランチ時間帯（11-14時）
            state["response"] = "いらっしゃいませ！　本日は何にいたしましょうか？　\n下記のタブからお選びになるか、ご質問を入力ください。"
            state["options"] = [
                "ランチ",
                "ドリンクメニュー",
                "せんべろセット",
                "夜メニュー",
                "刺身単品",
                "逸品料理",
                "天ぷら",
                "サラダ",
                "テイクアウト",
                "おすすめを教えて",
            ]
            logger.info(f"[Greeting] ランチ時間帯（{hour}時）: 全8タブ表示（サラダ・逸品料理追加）")
        elif time_zone == "dinner":
            # 夜の時間帯（14時以降、または朝～11時前）
            state["response"] = "いらっしゃいませ！　本日は何にいたしましょうか？　\n下記のタブからお選びになるか、ご質問を入力ください。"
            state["options"] = [
                "ランチ",
                "ドリンクメニュー",
                "せんべろセット",
                "夜メニュー",
                "刺身単品",
                "逸品料理",
                "天ぷら",
                "サラダ",
                "テイクアウト",
                "おすすめを教えて",
            ]
            logger.info(f"[Greeting] 夜の時間帯（{hour}時）: ランチ・サラダ・逸品料理を追加表示")
        else:
            # その他の時間帯（通常は使われない）
            state["response"] = "いらっしゃいませ！　本日は何にいたしましょうか？　\n下記のタブからお選びになるか、ご質問を入力ください。"
            state["options"] = [
                "ドリンクメニュー",
                "せんべろセット",
                "夜メニュー",
                "刺身単品",
                "逸品料理",
                "天ぷら",
                "サラダ",
                "テイクアウト",
                "おすすめを教えて",
            ]
            logger.info(f"[Greeting] その他の時間帯（{hour}時）: サラダ・逸品料理を追加表示")
        
        return state
    
    def alcohol_flow(self, state: State) -> State:
        """アルコール案内ノード"""
        logger.info("[Node] alcohol_flow")
        
        # つまみ表示フラグをチェック
        show_snacks = state.get("context", {}).get("show_snacks", False)
        
        if show_snacks:
            # つまみメニューを取得して表示
            try:
                if self.notion_client and self.config:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    
                    # つまみ系カテゴリ
                    snack_categories = ["逸品料理", "海鮮刺身", "定食屋メニュー"]
                    snack_menus = []
                    
                    for category in snack_categories:
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value=category,
                            limit=4
                        )
                        snack_menus.extend(menus)
                    
                    if snack_menus:
                        response_text = "🍶 お酒に合うつまみをご紹介します！\n\n"
                        
                        for menu in snack_menus[:8]:
                            name = menu.get("name", "")
                            price = menu.get("price", 0)
                            short_desc = menu.get("short_desc", "")
                            description = menu.get("description", "")
                            
                            # メニュー名と価格（必ず表示）
                            response_text += f"• **{name}**"
                            if price > 0:
                                response_text += f" ¥{price:,}"
                            response_text += "\n"
                            
                            # 一言紹介を表示
                            if short_desc:
                                response_text += f"  💬 {short_desc}\n"
                            
                            # 詳細説明を全文表示
                            if description:
                                response_text += f"  {description}\n"
                            
                            response_text += "\n"
                        
                        # 注文案内を追加
                        state["response"] = self._add_order_instruction(response_text)
                        state["options"] = ["ビール", "日本酒", "焼酎", "その他のメニュー"]
                        return state
            
            except Exception as e:
                logger.error(f"つまみメニュー取得エラー: {e}")
        
        # 通常のアルコールフロー
        state["response"] = "🍺 こちらにアルコールメニューございます。ぜひタグをタップしてご覧ください。\n\nビール、日本酒、焼酎、酎ハイ、ハイボール、梅酒など各種ございます。"
        state["options"] = [
            "ビール",
            "日本酒", 
            "焼酎グラス",
            "酎ハイ",
            "ハイボール",
            "梅酒・果実酒",
            "お酒に合うつまみ"
        ]
        
        return state
    
    def food_flow(self, state: State) -> State:
        """食事案内ノード"""
        logger.info("[Node] food_flow")
        
        # コンテキストを再収集（時間帯判定を最新にする）
        context = self._update_time_context(state)
        time_zone = context.get("time_zone", "other")
        
        # 時間帯に応じた提案
        if time_zone == "lunch":
            # ランチタイムのトップビュー（マインドマップ構成）
            state["response"] = "いらっしゃいませ！当店のランチタイムは通常のメニュー以外にも「日替わりランチ」「おすすめランチ」があります。\n\n🥗 サラダ・一品料理もご用意しております。"
            state["options"] = [
                "日替わりランチはこちら",
                "寿司ランチはこちら", 
                "おすすめ定食はこちら",
                "サラダ",
                "土曜日のおすすめはこちら"
            ]
        elif time_zone == "dinner":
            state["response"] = "🍽️ 夜はおすすめ定食、海鮮定食、季節の焼き魚定食などがございます。\n\n🥗 サラダ・一品料理も豊富にご用意しております。\n\nテイクアウトもご利用いただけます。"
            state["options"] = [
                "おすすめ定食はこちら",
                "海鮮定食はこちら",
                "サラダ",
                "逸品料理はこちら",
                "今晩のおすすめ一品はこちら"
            ]
        else:
            state["response"] = "🍽️ お食事メニューをご覧いただけます。\n\n🥗 サラダ・一品料理も豊富にご用意しております。"
            state["options"] = [
                "日替わりランチはこちら",
                "おすすめ定食はこちら",
                "海鮮定食はこちら",
                "サラダ",
                "逸品料理はこちら"
            ]

        messages = state.get("messages", [])
        last_message = messages[-1] if messages else ""
        
        # 「天ぷら」を含む入力の場合、NotionDBから「市場の天ぷら」サブカテゴリーのメニューを表示（最優先処理）
        tempura_keywords = ["天ぷら", "てんぷら", "天麩羅", "tempura"]
        logger.info(f"[Tempura] food_flow チェック開始: last_message='{last_message}', キーワードリスト={tempura_keywords}")
        tempura_detected = any(kw in last_message for kw in tempura_keywords)
        logger.info(f"[Tempura] food_flow 検出結果: {tempura_detected}")
        
        if tempura_detected:
            logger.info(f"[Tempura] food_flow: 天ぷらキーワード検出: '{last_message}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # 市場の天ぷらのメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="市場の天ぷら",
                            limit=20  # 多めに取得
                        )
                        
                        if menus:
                            response_text = "🍤 **天ぷらメニュー**\n\n"
                            response_text += "市場の天ぷらメニューをご案内いたします。野菜、海鮮、かき揚げなど豊富にご用意しております。\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 天ぷら盛り合わせの推奨を追加
                            response_text += "🌟 **おすすめ**: いろいろ少しずつ楽しめる『天ぷら盛り合せ』もございます。\n\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = [
                                "今晩のおすすめ一品 確認",
                                "揚げ物・酒つまみ 確認"
                            ]
                            logger.info(f"[Tempura] food_flow: 天ぷらメニュー表示完了 ({len(menus)}件)")
                            return state
                        else:
                            logger.warning("[Tempura] food_flow: 天ぷらメニューが見つかりません")
                except Exception as e:
                    logger.error(f"[Tempura] food_flow: 天ぷらメニュー取得エラー: {e}")
                    import traceback
                    traceback.print_exc()
            
            # フォールバック
            state["response"] = "🍤 天ぷらメニューをご案内いたします。市場の天ぷらは野菜、海鮮、かき揚げなど豊富にご用意しております。"
            state["options"] = [
                "今晩のおすすめ一品 確認",
                "揚げ物・酒つまみ 確認"
            ]
            logger.info("[Tempura] food_flow: フォールバック応答を返却")
            return state
        
        # 「焼き鳥」を含む入力の場合、NotionDBから「焼き鳥」サブカテゴリーのメニューを表示
        yakitori_keywords = ["焼き鳥", "やきとり", "ヤキトリ", "yakitori"]
        logger.info(f"[Yakitori] food_flow チェック開始: last_message='{last_message}', キーワードリスト={yakitori_keywords}")
        yakitori_detected = any(kw in last_message for kw in yakitori_keywords)
        logger.info(f"[Yakitori] food_flow 検出結果: {yakitori_detected}")
        
        if yakitori_detected:
            logger.info(f"[Yakitori] food_flow: 焼き鳥キーワード検出: '{last_message}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    logger.info(f"[Yakitori] food_flow: menu_db_id={menu_db_id}")
                    if menu_db_id:
                        # 焼き鳥のメニューを取得
                        logger.info(f"[Yakitori] food_flow: Notionからメニュー取得開始 (Subcategory='焼き鳥')")
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="焼き鳥",
                            limit=20  # 多めに取得
                        )
                        logger.info(f"[Yakitori] food_flow: メニュー取得完了 ({len(menus) if menus else 0}件)")
                        
                        if menus and len(menus) > 0:
                            response_text = "🍢 **焼き鳥メニュー**\n\n"
                            response_text += "焼き鳥メニューをご案内いたします。各種串焼きをご用意しております。\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = [
                                "今晩のおすすめ一品 確認",
                                "揚げ物・酒つまみ 確認",
                                "天ぷらメニュー確認"
                            ]
                            logger.info(f"[Yakitori] food_flow: 焼き鳥メニュー表示完了 ({len(menus)}件)")
                            return state
                        else:
                            logger.warning("[Yakitori] food_flow: 焼き鳥メニューが見つかりません（menusが空またはNone）")
                    else:
                        logger.warning("[Yakitori] food_flow: menu_db_idが設定されていません")
                except Exception as e:
                    logger.error(f"[Yakitori] food_flow: 焼き鳥メニュー取得エラー: {e}")
                    import traceback
                    logger.error(f"[Yakitori] food_flow: トレースバック: {traceback.format_exc()}")
            else:
                logger.warning("[Yakitori] food_flow: notion_clientまたはconfigがNoneです")
            
            # フォールバック（エラー時またはメニューが見つからない場合）
            logger.info("[Yakitori] food_flow: フォールバック応答を返却")
            state["response"] = "🍢 焼き鳥メニューをご案内いたします。各種串焼きをご用意しております。"
            state["options"] = [
                "今晩のおすすめ一品 確認",
                "揚げ物・酒つまみ 確認",
                "天ぷらメニュー確認"
            ]
            return state
        
        fried_keywords = ["揚げ物", "揚げ", "フライ", "唐揚げ", "からあげ", "カツ", "串カツ", "フリッター", "コロッケ", "エビフライ", "海老フライ"]
        if any(kw in last_message for kw in fried_keywords):
            cache_key = "fried"
            cached_menus = self._fried_cache.get(cache_key)
            if cached_menus:
                menus = cached_menus
                logger.info("[Fried] キャッシュ済みメニューを使用")
            else:
                menus = self._fetch_fried_food_menus()
                if menus:
                    self._fried_cache[cache_key] = menus
            response_text, remaining_items = self._format_fried_food_response(menus)
            logger.info(f"[Fried] food_flow: 取得メニュー数={len(menus)}, 残り={len(remaining_items)}")
            response_text = self._add_order_instruction(response_text)
            context = state.get("context") or {}
            options: List[Any] = []
            if remaining_items:
                context["fried_food_remaining"] = remaining_items
                logger.info(f"[Fried] food_flow: fried_food_remaining設定完了, 件数={len(remaining_items)}")
                options.append("その他はこちらです")
            else:
                context.pop("fried_food_remaining", None)
                logger.info("[Fried] food_flow: 残りメニューなし")
            options.extend([
                "今晩のおすすめ一品 確認",
                "焼き鳥メニュー確認",
                "天ぷらメニュー確認"
            ])
            state["context"] = context
            state["response"] = response_text
            state["options"] = options
        
        return state
    
    def bento_flow(self, state: State) -> State:
        """弁当案内ノード"""
        logger.info("[Node] bento_flow")
        
        # ユーザーの質問内容に応じて柔軟なレスポンス
        messages = state.get("messages", [])
        last_message = messages[-1] if messages else ""
        
        # 質問パターンに応じたレスポンス
        if any(kw in last_message for kw in ["おすすめ", "人気", "おいしい", "美味しい", "どれが"]):
            if any(kw in last_message for kw in ["テイクアウト", "持ち帰り", "お持ち帰り"]):
                response_text = "🍱 おすすめのテイクアウトメニューをご案内いたします！\n\n持ち帰り用の弁当を豊富にご用意しております。"
            else:
                response_text = "🍱 おすすめの弁当メニューをご案内いたします！\n\nテイクアウト弁当を豊富にご用意しております。"
        elif any(kw in last_message for kw in ["種類", "カテゴリ", "分類", "どんな", "どういう"]):
            if any(kw in last_message for kw in ["テイクアウト", "持ち帰り", "お持ち帰り"]):
                response_text = "🍱 テイクアウトの種類をご案内いたします！\n\n持ち帰り用弁当を3つのカテゴリでご用意しております。"
            else:
                response_text = "🍱 弁当の種類をご案内いたします！\n\nテイクアウト弁当を3つのカテゴリでご用意しております。"
        elif any(kw in last_message for kw in ["値段", "価格", "いくら", "料金"]):
            if any(kw in last_message for kw in ["テイクアウト", "持ち帰り", "お持ち帰り"]):
                response_text = "🍱 テイクアウトの価格をご案内いたします！\n\n持ち帰り用弁当の詳細な価格をご確認いただけます。"
            else:
                response_text = "🍱 弁当の価格をご案内いたします！\n\nテイクアウト弁当の詳細な価格をご確認いただけます。"
        elif any(kw in last_message for kw in ["テイクアウト", "持ち帰り", "お持ち帰り"]):
            response_text = "🍱 テイクアウトメニューをご案内いたします！\n\nお持ち帰り用の弁当を豊富にご用意しております。"
        else:
            response_text = "🍱 弁当メニューをご案内いたします！\n\nテイクアウト弁当をご用意しております。"
        
        # 実際のテイクアウトメニューを取得
        try:
            logger.info(f"[Bento] MenuService確認: {hasattr(self, 'menu_service')}")
            if hasattr(self, 'menu_service'):
                logger.info(f"[Bento] MenuService存在: {self.menu_service is not None}")
                if self.menu_service:
                    logger.info(f"[Bento] MenuService DB ID: {self.menu_service.menu_db_id}")
            
            # テイクアウト関連のキーワードでメニュー検索
            takeout_keywords = ["テイクアウト", "弁当", "持ち帰り", "まごころ", "唐揚げ", "しゅうまい", "各種", "豚", "鶏"]
            menu_text = ""
            menu_options = []
            
            # Notionから直接テイクアウトサブカテゴリのメニューを取得
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        logger.info(f"[Bento] テイクアウトサブカテゴリのメニューを取得開始")
                        
                        # 1. テイクアウトまごころ弁当（上位8品のみ表示）
                        logger.info(f"[Bento] カテゴリー取得中: テイクアウトまごころ弁当")
                        magokoro_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="テイクアウトまごころ弁当",
                            limit=8
                        )
                        logger.info(f"[Bento] テイクアウトまごころ弁当 から {len(magokoro_menus)}件取得")
                        
                        # 2. テイクアウト唐揚げ（全件取得してコンテキストに保存）
                        logger.info(f"[Bento] カテゴリー取得中: テイクアウト唐揚げ")
                        karaage_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="テイクアウト唐揚げ",
                            limit=50
                        )
                        logger.info(f"[Bento] テイクアウト唐揚げ から {len(karaage_menus)}件取得")
                        
                        # 3. テイクアウト一品（全件取得してコンテキストに保存）
                        logger.info(f"[Bento] カテゴリー取得中: テイクアウト一品")
                        ichipin_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="テイクアウト一品",
                            limit=50
                        )
                        logger.info(f"[Bento] テイクアウト一品 から {len(ichipin_menus)}件取得")
                        
                        # テイクアウト唐揚げとテイクアウト一品を結合してコンテキストに保存
                        remaining_menus = karaage_menus + ichipin_menus
                        logger.info(f"[Bento] 続きメニュー総数: {len(remaining_menus)}件（唐揚げ: {len(karaage_menus)}件、一品: {len(ichipin_menus)}件）")
                        
                        # コンテキストに残りメニューを保存
                        context = state.get("context", {})
                        context["bento_remaining"] = remaining_menus
                        state["context"] = context
                        
                        # まごころ弁当の8品のみを表示
                        if magokoro_menus:
                            menu_text += f"\n\n🍱 弁当メニュー:\n"
                            for menu in magokoro_menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                menu_text += f"• **{name}**"
                                if price > 0:
                                    menu_text += f" ¥{price:,}"
                                menu_text += "\n"
                                
                                if short_desc:
                                    menu_text += f"  💬 {short_desc}\n"
                                
                                if description:
                                    menu_text += f"  {description}\n"
                                
                                menu_text += "\n"
                        
                        # 選択肢は「弁当（続きはこちら）」のみ（残りメニューがある場合）
                        if remaining_menus:
                            menu_options = ["弁当（続きはこちら）"]
                        else:
                            menu_options = []
                except Exception as e:
                    logger.error(f"[Bento] メニュー取得エラー: {e}")
                    import traceback
                    logger.error(f"トレースバック: {traceback.format_exc()}")
            
            # MenuServiceを使用してメニューを取得（フォールバック）
            elif hasattr(self, 'menu_service') and self.menu_service:
                logger.info(f"[Bento] MenuServiceを使用してメニュー検索開始")
                all_items = []
                seen_names = set()
                
                for keyword in takeout_keywords:
                    try:
                        logger.info(f"[Bento] キーワード検索: '{keyword}'")
                        items = self.menu_service.fetch_menu_items(keyword, limit=5)
                        logger.info(f"[Bento] 検索結果: {len(items)}件")
                        
                        # 重複を避けてアイテムを追加
                        for item in items:
                            if item.name not in seen_names:
                                all_items.append(item)
                                seen_names.add(item.name)
                        
                        # 十分な結果が得られたら停止
                        if len(all_items) >= 5:
                            break
                            
                    except Exception as e:
                        logger.error(f"メニュー取得エラー ({keyword}): {e}")
                        import traceback
                        logger.error(f"トレースバック: {traceback.format_exc()}")
                        continue
                
                # 結果を表示
                if all_items:
                    menu_text += f"\n\n🍱 弁当メニュー:\n"
                    for item in all_items[:5]:  # 最大5件まで表示
                        menu_text += f"• {item.name} - ¥{item.price}\n"
                        menu_options.append(item.name)
            else:
                logger.warning(f"[Bento] MenuServiceが利用できません")
            
            # メニューが見つからない場合はデフォルトの選択肢
            if not menu_text:
                menu_text = "\n\n🍱 テイクアウトメニューをご案内いたします！"
                menu_options = [
                    "テイクアウト唐揚げ弁当",
                    "テイクアウトまごころ弁当", 
                    "テイクアウト一品"
                ]
            
            response_final = response_text + menu_text
            state["response"] = response_final
            state["options"] = menu_options
            
            # クロスリフレクション適用（価格問い合わせは重要な応答）
            if self._ensure_cross_reflection_engine() and any(kw in last_message for kw in ["値段", "価格", "いくら", "料金"]):
                try:
                    initial_response = state.get("response", "")
                    
                    # コンテキストを構築
                    context_parts = []
                    if menu_text:
                        context_parts.append(f"メニュー情報:\n{menu_text}")
                    reflection_context = "\n\n".join(context_parts) if context_parts else None
                    
                    # クロスリフレクション適用
                    improved_response = self.cross_reflection_engine.apply_reflection(
                        user_message=last_message,
                        initial_response=initial_response,
                        intent="price",
                        context=reflection_context
                    )
                    
                    if improved_response != initial_response:
                        logger.info(f"[CrossReflection] 価格応答を改善しました: {len(initial_response)}文字 → {len(improved_response)}文字")
                        state["response"] = improved_response
                    else:
                        logger.debug("[CrossReflection] 価格応答改善なし（スキップまたはスコア高）")
                except Exception as e:
                    logger.error(f"[CrossReflection] エラー（フォールバック）: {e}")
                    # エラーが発生しても元の応答を使用
            
        except Exception as e:
            logger.error(f"弁当メニュー取得エラー: {e}")
            # エラー時はデフォルトの選択肢
            state["response"] = response_text + "\n\n🍱 テイクアウトメニューをご案内いたします！"
            state["options"] = [
                "テイクアウト唐揚げ弁当",
                "テイクアウトまごころ弁当",
                "テイクアウト一品"
            ]
        
        logger.info("[Bento] 弁当メニュー選択肢を表示")
        return state
    
    def sashimi_flow(self, state: State) -> State:
        """刺身案内ノード（Node_Sashimi）"""
        logger.info("[Node] sashimi_flow")
        
        # コンテキストを収集
        context = self._update_time_context(state)
        time_zone = context.get("time_zone", "other")
        
        # ユーザーの質問内容に応じたレスポンス
        messages = state.get("messages", [])
        last_message = messages[-1] if messages else ""
        
        # まずNotionの会話ノード（Node_Sashimi）を検索
        if self.conversation_system:
            try:
                # Node_Sashimiまたは刺身関連のノードを検索
                node_sashimi = self.conversation_system.get_node_by_id("Node_Sashimi")
                if not node_sashimi:
                    # ノードIDが見つからない場合、サブカテゴリやキーワードで検索
                    conversation_nodes = self.conversation_system.get_conversation_nodes()
                    for node_id, node_data in conversation_nodes.items():
                        node_name = node_data.get("name", "")
                        subcategory = node_data.get("subcategory", "")
                        keywords = node_data.get("keywords", [])
                        # 刺身関連のノードを探す
                        if ("刺身" in node_name or "刺身" in subcategory or 
                            any("刺身" in str(kw) for kw in keywords) or
                            node_id == "sashimi" or "sashimi" in node_id.lower()):
                            node_sashimi = node_data
                            logger.info(f"[Sashimi] 刺身関連ノード発見: {node_id} ({node_name})")
                            break
                
                if node_sashimi:
                    # 会話ノードが見つかった場合、そのテンプレートと選択肢を使用
                    template = node_sashimi.get("template", "")
                    next_nodes = node_sashimi.get("next", [])
                    subcategory = node_sashimi.get("subcategory", "")
                    
                    # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                    response_text = template
                    
                    # 海鮮系ノードのテキスト装飾
                    if subcategory in ["海鮮刺身", "刺身・盛り合わせ"]:
                        response_text = self._add_seafood_text_decorations(response_text, node_sashimi)
                    
                    # 選択肢を構築
                    options = []
                    for next_node_id in next_nodes:
                        next_node = self.conversation_system.get_node_by_id(next_node_id)
                        if next_node:
                            options.append(next_node.get("name", next_node_id))
                    
                    # メニュー検索結果を追加（オプション）
                    if hasattr(self, 'menu_service') and self.menu_service:
                        try:
                            # 刺身メニューを検索して追加情報として提供
                            sashimi_items = self._search_sashimi_menu_items(limit=5)
                            if sashimi_items:
                                menu_text = "\n\n🐟 刺身メニュー:\n"
                                for item in sashimi_items[:5]:
                                    price_text = f"¥{item.price}" if item.price else "価格はスタッフへ"
                                    menu_text += f"• {item.name} - {price_text}\n"
                                response_text += menu_text
                                
                                # 選択肢にメニュー名も追加
                                if len(options) < 5:
                                    for item in sashimi_items[:min(5 - len(options), 3)]:
                                        if item.name not in options:
                                            options.append(item.name)
                        except Exception as e:
                            logger.error(f"[Sashimi] メニュー追加エラー: {e}")
                    
                    # Notionの「一緒におすすめ」プロパティを使ったクロスセル機能を追加
                    cross_sell_options_to_add = []
                    if self.notion_client and self.config:
                        try:
                            menu_db_id = self.config.get("notion.database_ids.menu_db")
                            logger.info(f"[CrossSell] sashimi_flow: menu_db_id={menu_db_id}, notion_client={self.notion_client is not None}")
                            
                            if menu_db_id:
                                # 会話ノードのテンプレートからメニュー名を抽出
                                node_name = node_sashimi.get("name", "")
                                node_id = node_sashimi.get("id", "")
                                logger.info(f"[CrossSell] sashimi_flow ノード情報: id={node_id}, name={node_name}, template={template[:50] if template else 'None'}...")
                                
                                # メニュー名を抽出（ユーザーのメッセージを最優先）
                                menu_name = None
                                
                                # 1. ユーザーのメッセージから抽出を最優先（「いか刺身」など、ユーザーが選択したものを優先）
                                if last_message:
                                    # 刺身関連のキーワードを抽出（より多くのバリエーションに対応）
                                    sashimi_keywords = [
                                        "まぐろ刺身", "マグロ刺身", "まぐろ刺", "マグロ刺",
                                        "サーモン刺身", "さーもん刺身", "サーモン刺", "さーもん刺",
                                        "鯛刺身", "タイ刺身", "鯛刺", "タイ刺",
                                        "あじ刺身", "アジ刺身", "あじ刺", "アジ刺",
                                        "いか刺身", "イカ刺身", "いか刺", "イカ刺", "烏賊刺身",
                                        "ほたて刺身", "ホタテ刺身", "ほたて刺", "ホタテ刺", "帆立刺身",
                                        "さば刺身", "サバ刺身", "さば刺", "サバ刺",
                                        "ぶり刺身", "ブリ刺身", "ぶり刺", "ブリ刺",
                                        "かつお刺身", "カツオ刺身", "かつお刺", "カツオ刺",
                                        "たこ刺身", "タコ刺身", "たこ刺", "タコ刺",
                                        "えび刺身", "エビ刺身", "えび刺", "エビ刺",
                                    ]
                                    # より具体的なキーワード（長いもの）を優先的にマッチ
                                    sashimi_keywords.sort(key=len, reverse=True)
                                    for keyword in sashimi_keywords:
                                        if keyword in last_message:
                                            menu_name = keyword
                                            logger.info(f"[CrossSell] sashimi_flow メッセージから抽出（最優先）: {menu_name}")
                                            break
                                
                                # 2. ノードIDから抽出（ユーザーメッセージにない場合のみ）
                                if not menu_name and node_id:
                                    id_to_name = {
                                        "maguro_sashimi": "まぐろ刺身",
                                        "salmon_sashimi": "サーモン刺身",
                                        "tai_sashimi": "鯛刺身",
                                        "aji_sashimi": "あじ刺身",
                                        "ika_sashimi": "いか刺身",
                                        "hotate_sashimi": "ほたて刺身",
                                    }
                                    if node_id in id_to_name:
                                        menu_name = id_to_name[node_id]
                                        logger.info(f"[CrossSell] sashimi_flow ノードIDから抽出: {menu_name} (ID: {node_id})")
                                
                                # 3. テンプレートから抽出（ユーザーメッセージ・ノードIDにない場合のみ）
                                if not menu_name and template:
                                    # テンプレートの最初の行からメニュー名を抽出
                                    first_line = template.split("\n")[0].strip()
                                    logger.info(f"[CrossSell] sashimi_flow テンプレート最初の行: {first_line}")
                                    # 「をご案内」「があります」などの前の部分を取得
                                    for marker in ["をご案内", "があります", "は", "の"]:
                                        if marker in first_line:
                                            menu_name = first_line.split(marker)[0].strip()
                                            logger.info(f"[CrossSell] sashimi_flow テンプレートから抽出: {menu_name} (マーカー: {marker})")
                                            break
                                
                                # 4. ノード名から抽出（最後の手段）
                                if not menu_name and node_name:
                                    menu_name = node_name.replace("確認", "").replace("メニュー", "").strip()
                                    logger.info(f"[CrossSell] sashimi_flow ノード名から抽出: {menu_name}")
                                
                                # メニュー名が見つかった場合、Notionのクロスセル機能を呼び出す
                                if menu_name:
                                    logger.info(f"[CrossSell] sashimi_flow メニュー名抽出成功: {menu_name}")
                                    cross_sell_data = self.notion_client.cross_sell_message(
                                        database_id=menu_db_id,
                                        current_menu_name=menu_name
                                    )
                                    
                                    logger.info(f"[CrossSell] sashimi_flow cross_sell_data取得結果: {cross_sell_data is not None}")
                                    
                                    if cross_sell_data:
                                        cross_sell_msg = cross_sell_data.get("text", "")
                                        cross_sell_items = cross_sell_data.get("items", [])
                                        
                                        logger.info(f"[CrossSell] sashimi_flow メッセージ: {cross_sell_msg[:50] if cross_sell_msg else 'None'}..., アイテム数: {len(cross_sell_items)}")
                                        
                                        if cross_sell_msg and cross_sell_items:
                                            # 既存のクロスセル文言と重複しない場合のみ追加
                                            if "馬刺し赤身" not in cross_sell_msg or "馬刺し赤身" not in response_text:
                                                response_text += f"\n\n{cross_sell_msg}"
                                                
                                                # 選択肢に追加するリストを作成
                                                for item in cross_sell_items[:2]:
                                                    option_text = f"{item}も注文"
                                                    if option_text not in options:
                                                        cross_sell_options_to_add.append(option_text)
                                                
                                                logger.info(f"[CrossSell] sashimi_flow クロスセル追加成功: {menu_name} → {cross_sell_items}")
                                            else:
                                                logger.info(f"[CrossSell] sashimi_flow 馬刺し赤身と重複のためスキップ")
                                        else:
                                            logger.info(f"[CrossSell] sashimi_flow メッセージまたはアイテムが空のためスキップ")
                                    else:
                                        logger.info(f"[CrossSell] sashimi_flow cross_sell_dataがNone")
                                else:
                                    logger.info(f"[CrossSell] sashimi_flow メニュー名が抽出できませんでした: node_id={node_id}, node_name={node_name}, last_message={last_message}")
                            else:
                                logger.warning(f"[CrossSell] sashimi_flow menu_db_idが設定されていません")
                        except Exception as e:
                            logger.error(f"[CrossSell] sashimi_flow クロスセル取得エラー: {e}")
                            import traceback
                            logger.error(f"[CrossSell] sashimi_flow トレースバック: {traceback.format_exc()}")
                    
                    # クロスセル選択肢を追加
                    if cross_sell_options_to_add:
                        options.extend(cross_sell_options_to_add)
                    
                    state["response"] = response_text
                    state["options"] = options if options else ["おすすめメニューはこちら", "メニューを見る"]
                    
                    # クロスリフレクション適用（価格問い合わせは重要な応答）
                    price_keywords = ["値段", "価格", "いくら", "料金", "いくつ"]
                    is_price_query = any(kw in last_message for kw in price_keywords)
                    
                    if is_price_query:
                        engine_ready = self._ensure_cross_reflection_engine()
                        logger.info(f"[CrossReflection] 価格問い合わせ検出: '{last_message}'")
                        logger.info(f"[CrossReflection] クロスリフレクションエンジン状態: {engine_ready}")
                    else:
                        engine_ready = False
                    
                    if engine_ready and is_price_query:
                        try:
                            initial_response = state.get("response", "")
                            logger.info(f"[CrossReflection] 刺身価格応答にクロスリフレクション適用開始: {len(initial_response)}文字")
                            
                            # コンテキストを構築
                            context_parts = []
                            if template:
                                context_parts.append(f"テンプレート:\n{template}")
                            # menu_textは変数スコープの問題で直接参照できないため、response_textから取得
                            if "🐟 刺身メニュー:" in response_text:
                                menu_section = response_text.split("🐟 刺身メニュー:")[-1]
                                context_parts.append(f"メニュー情報:\n{menu_section}")
                            reflection_context = "\n\n".join(context_parts) if context_parts else None
                            
                            # クロスリフレクション適用
                            improved_response = self.cross_reflection_engine.apply_reflection(
                                user_message=last_message,
                                initial_response=initial_response,
                                intent="price",
                                context=reflection_context
                            )
                            
                            if improved_response != initial_response:
                                logger.info(f"[CrossReflection] ✅ 刺身価格応答を改善しました: {len(initial_response)}文字 → {len(improved_response)}文字")
                                state["response"] = improved_response
                            else:
                                logger.info("[CrossReflection] ℹ️ 刺身価格応答改善なし（スキップまたはスコア高）")
                        except Exception as e:
                            logger.error(f"[CrossReflection] ❌ エラー（フォールバック）: {e}")
                            import traceback
                            logger.error(f"[CrossReflection] トレースバック: {traceback.format_exc()}")
                            # エラーが発生しても元の応答を使用
                    
                    logger.info(f"[Sashimi] 会話ノードを使用: {len(options)}件の選択肢")
                    return state
                else:
                    logger.info("[Sashimi] 会話ノードが見つかりません。デフォルトロジックを使用します。")
            except Exception as e:
                logger.error(f"[Sashimi] 会話ノード検索エラー: {e}")
                import traceback
                logger.error(f"トレースバック: {traceback.format_exc()}")
        
        # 会話ノードが見つからない場合、デフォルトのロジックを使用
        # 応答テンプレート（短文）
        response_text = "刺身のメニューはこちらです。ご希望の価格帯や量感はありますか？"
        
        # パラメータ（コンテキスト）受け渡し対応
        user_preferences = context.get("user_preferences", {})
        filters = []
        
        # time_slotがある場合は提供時間帯で絞り込み
        if user_preferences.get("time_slot") == "ランチ":
            filters.append({"property": "提供時間帯", "select": {"equals": "ランチ"}})
        elif user_preferences.get("time_slot") == "ディナー":
            filters.append({"property": "提供時間帯", "select": {"equals": "ディナー"}})
        
        # volumeがある場合は量感で絞り込み
        if user_preferences.get("volume") == "大":
            # ボリューム大のフィルタ（Tagsやボリュームフィールドで判定）
            pass  # 必要に応じて実装
        
        # 刺身メニューを取得
        all_items = self._search_sashimi_menu_items(limit=10)
        
        # エッジケース処理
        if len(all_items) == 0:
            # ヒット件数 = 0 の場合: 代替提案
            response_text = "申し訳ございませんが、現在刺身のメニューが見つかりませんでした。\n\n代わりに「海鮮焼」や「寿司」メニューはいかがでしょうか？"
            state["options"] = [
                "海鮮焼はこちら",
                "寿司メニューはこちら",
                "おすすめメニューはこちら"
            ]
        elif len(all_items) > 10:
            # ヒット件数が多すぎる場合: 価格帯や提供時間帯で絞り込みを促す
            response_text = "刺身のメニューを多数ご用意しております。\n\n価格帯や提供時間帯（ランチ/ディナー）で絞り込みますか？"
            # 最初の5件だけ表示
            menu_text = "\n\n🐟 刺身メニュー（一部）:\n"
            for item in all_items[:5]:
                price_text = f"¥{item.price}" if item.price else "価格はスタッフへ"
                menu_text += f"• {item.name} - {price_text}\n"
            response_text += menu_text
            state["options"] = [
                "価格帯で絞り込み",
                "ランチメニューを見る",
                "ディナーメニューを見る",
                "全ての刺身を見る"
            ]
        else:
            # 正常な件数の場合
            menu_text = "\n\n🐟 刺身メニュー:\n"
            for item in all_items[:10]:  # 最大10件表示
                price_text = f"¥{item.price}" if item.price else "価格はスタッフへ"
                menu_text += f"• {item.name} - {price_text}\n"
            response_text += menu_text
            
            # 追加質問（任意）
            if not any(kw in last_message for kw in ["さっぱり", "ボリューム", "価格", "値段"]):
                response_text += "\n\nさっぱり系が良いですか？ボリューム重視ですか？"
            
            # 選択肢としてメニュー名を提供
            state["options"] = [item.name for item in all_items[:5]]  # 最大5件
        
        state["response"] = response_text
        logger.info("[Sashimi] 刺身メニュー選択肢を表示")
        return state
    
    def _search_sashimi_menu_items(self, limit: int = 10) -> List:
        """刺身メニューを検索（共通メソッド）"""
        try:
            all_items = []
            seen_names = set()
            
            if hasattr(self, 'menu_service') and self.menu_service:
                logger.info(f"[Sashimi] MenuServiceを使用して刺身メニュー検索開始")
                
                # フィルタ条件: 料理カテゴリ = 刺身 OR Subcategory = 海鮮刺身 OR Tagsに刺身を含む
                # まずCategoryで検索
                try:
                    category_items = self.menu_service.fetch_menu_items("刺身", limit=10, category="料理")
                    for item in category_items:
                        if item.name and item.name not in seen_names:
                            all_items.append(item)
                            seen_names.add(item.name)
                    logger.info(f"[Sashimi] Category検索結果: {len(category_items)}件")
                except Exception as e:
                    logger.error(f"[Sashimi] Category検索エラー: {e}")
                
                # Subcategoryで検索
                if len(all_items) < 10:
                    try:
                        # menu_serviceの_search_by_category_keywordsを使用
                        subcategory_keywords = ["海鮮刺身"]
                        for keyword in subcategory_keywords:
                            items = self.menu_service.fetch_menu_items(keyword, limit=10 - len(all_items))
                            for item in items:
                                if item.name and item.name not in seen_names:
                                    all_items.append(item)
                                    seen_names.add(item.name)
                            if len(all_items) >= 10:
                                break
                        logger.info(f"[Sashimi] Subcategory検索結果追加")
                    except Exception as e:
                        logger.error(f"[Sashimi] Subcategory検索エラー: {e}")
                
                # Tags検索（NotionClientを直接使用）
                if len(all_items) < 10 and hasattr(self, 'notion_client') and self.notion_client:
                    try:
                        if self.menu_service.menu_db_id:
                            pages = self.notion_client.get_all_pages(self.menu_service.menu_db_id)
                            for page in pages:
                                if len(all_items) >= 10:
                                    break
                                
                                # Tagsプロパティを取得（multi_select）
                                tags = self.notion_client.get_property_value(page, "Tags", "multi_select")
                                if tags and any("刺身" in str(tag) for tag in tags):
                                    name = self.notion_client.get_property_value(page, "Name", "title")
                                    if name and name not in seen_names:
                                        # MenuItemViewに変換
                                        price = self.notion_client.get_property_value(page, "Price", "number")
                                        one_liner = self.notion_client.get_property_value(page, "一言紹介", "rich_text")
                                        description = self.notion_client.get_property_value(page, "Description", "rich_text")
                                        recommendation = self.notion_client.get_property_value(page, "おすすめ理由", "rich_text")
                                        
                                        from .menu_service import MenuItemView
                                        item = MenuItemView(
                                            name=name,
                                            price=price,
                                            one_liner=one_liner,
                                            description=description,
                                            recommendation=recommendation
                                        )
                                        all_items.append(item)
                                        seen_names.add(name)
                        logger.info(f"[Sashimi] Tags検索結果追加: {len([i for i in all_items if i.name in seen_names])}件")
                    except Exception as e:
                        logger.error(f"[Sashimi] Tags検索エラー: {e}")
                        import traceback
                        logger.error(f"トレースバック: {traceback.format_exc()}")
            
            return all_items
            
        except Exception as e:
            logger.error(f"刺身メニュー取得エラー: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            return []
    
    def banquet_flow(self, state: State) -> State:
        """宴会案内ノード（banquet_entry等）"""
        logger.info("[Node] banquet_flow")
        
        # コンテキストからノードIDを取得
        context = state.get("context", {})
        node_id = context.get("banquet_node_id", "banquet_entry")
        
        # 会話ノードを取得
        if not self.conversation_system:
            logger.warning("[Banquet] conversation_systemが利用できません")
            state["response"] = "準備中です。少々お待ちください。"
            state["options"] = ["メニューを見る"]
            return state
        
        try:
            # ノードIDで会話ノードを取得
            node = self.conversation_system.get_node_by_id(node_id)
            
            if not node:
                logger.warning(f"[Banquet] ノードが見つかりません: {node_id}")
                # フォールバック：Notionから直接ノードを検索してみる
                logger.info(f"[Banquet] Notionから直接ノードを検索: {node_id}")
                conversation_nodes = self.conversation_system.get_conversation_nodes()
                
                # デバッグ: 取得されているノードIDのリストを確認
                all_node_ids = list(conversation_nodes.keys())
                logger.info(f"[Banquet] 取得済みノード数: {len(all_node_ids)}件")
                
                # 宴会関連のノードを探す
                banquet_related_nodes = [nid for nid in all_node_ids if "banquet" in nid.lower() or "宴会" in str(conversation_nodes.get(nid, {}).get("name", ""))]
                if banquet_related_nodes:
                    logger.info(f"[Banquet] 宴会関連ノード発見: {banquet_related_nodes}")
                else:
                    logger.warning(f"[Banquet] 宴会関連ノードが見つかりません。全ノードID（最初の20件）: {all_node_ids[:20]}")
                
                # ノードIDの部分一致でも検索
                for cached_node_id, cached_node_data in conversation_nodes.items():
                    if node_id in cached_node_id or cached_node_id in node_id:
                        logger.info(f"[Banquet] 部分一致でノード発見: {node_id} → {cached_node_id}")
                        node = cached_node_data
                        break
                
                # ノード名でも検索（「宴会」を含むノード）
                if not node:
                    for cached_node_id, cached_node_data in conversation_nodes.items():
                        node_name = cached_node_data.get("name", "")
                        if "宴会" in node_name or "entry" in cached_node_id.lower():
                            logger.info(f"[Banquet] ノード名で宴会関連ノード発見: {cached_node_id} ({node_name})")
                            node = cached_node_data
                            break
                
                if not node:
                    logger.warning(f"[Banquet] フォールバック検索でもノードが見つかりません: {node_id}")
                    # 宴会についての一般的な情報を返す（4つのコースタブを表示）
                    state["response"] = """🍽️ **宴会のご案内**

以下からご希望をお知らせください。ご予算・人数・スタイル（コース or オードブル）に合わせて柔軟にご提案します。

— 宴会の紹介（要約） —

• 忘新年会・歓迎会・送別会など各種宴会に対応
• コース形式／オードブル形式／鍋・肉料理の追加など自由設計が可能
• 飲み放題（90分）：アルコール2,200円／ソフトドリンク1,100円。宴会時間は120分
• 料金帯の目安：3,000円（標準）／4,000円（追加1品）／5,000円（豪華オプション）

次の候補からお選びください："""
                    # 4つのコースタブを選択肢として表示
                    state["options"] = ["3,000円コース", "4,000円コース", "5,000円コース", "オードブル形式"]
                    logger.info(f"[Banquet] フォールバック: 4つのコースタブを表示")
                    return state
            
            # レスポンステンプレートをそのまま取得（改行や箇条書きを保持）
            template = node.get("template", "")
            next_nodes = node.get("next", [])  # 遷移先ノードIDのリスト
            
            # テンプレートが空の場合はノード名を使用
            if not template or not template.strip():
                node_name = node.get("name", "")
                response_text = f"{node_name}\n\n詳細はスタッフまでお問い合わせください。"
            else:
                # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                response_text = template
            
            # 宴会入口ノード（banquet_entry）の場合、4つのコースタブを優先表示
            if node_id == "banquet_entry" or "entry" in node_id.lower():
                # 4つのコースタブを優先的に表示
                course_tabs = []
                course_node_ids = {
                    "3,000円コース": "banquet_course_3000",
                    "4,000円コース": "banquet_course_4000",
                    "5,000円コース": "banquet_course_5000",
                    "オードブル形式": "banquet_oodorubu"
                }
                
                # 各コースノードの存在確認とタブ生成
                for tab_name, tab_node_id in course_node_ids.items():
                    course_node = self.conversation_system.get_node_by_id(tab_node_id)
                    if course_node:
                        course_tabs.append(tab_name)
                        logger.info(f"[Banquet] コースタブ追加: {tab_name} (node_id: {tab_node_id})")
                    else:
                        # ノードが見つからない場合でもタブを表示（フォールバック対応）
                        course_tabs.append(tab_name)
                        logger.warning(f"[Banquet] コースノード未検出、タブのみ表示: {tab_name} (node_id: {tab_node_id})")
                
                # 4つのコースタブを設定
                if course_tabs:
                    state["response"] = response_text
                    state["options"] = course_tabs
                    logger.info(f"[Banquet] 宴会入口ノード: 4つのコースタブを表示 ({len(course_tabs)}件)")
                    return state
            
            # その他の宴会ノード（各コースの詳細ページなど）の場合、遷移先からボタンを自動生成
            options = []
            for next_node_ref in next_nodes:
                # next_node_refはページIDまたはノードIDの可能性がある
                next_node = None
                
                # まずページIDとして試す（get_conversation_nodesでページIDを保存している場合）
                if hasattr(self.conversation_system, 'get_node_by_page_id'):
                    next_node = self.conversation_system.get_node_by_page_id(next_node_ref)
                
                # ページIDで見つからない場合、ノードIDとして試す
                if not next_node:
                    next_node = self.conversation_system.get_node_by_id(next_node_ref)
                
                if next_node:
                    # ノード名をボタンラベルとして使用
                    button_label = next_node.get("name", next_node_ref)
                    options.append(button_label)
                    logger.debug(f"[Banquet] ボタン追加: {button_label} (ref: {next_node_ref})")
                else:
                    logger.warning(f"[Banquet] 遷移先ノードが見つかりません: {next_node_ref}")
            
            # 各コースの詳細ページの場合、共通の候補選択肢を追加
            if node_id in ["banquet_course_3000", "banquet_course_4000", "banquet_course_5000", "banquet_oodorubu"]:
                # 共通候補の選択肢を追加（飲み放題詳細を優先）
                drink_options = []
                # 飲み放題アルコールノードを確認
                alcohol_node = self.conversation_system.get_node_by_id("banquet_drink_alcohol")
                if alcohol_node:
                    drink_options.append(alcohol_node.get("name", "飲み放題（アルコール90分）"))
                
                # 飲み放題ソフトノードを確認
                soft_node = self.conversation_system.get_node_by_id("banquet_drink_soft")
                if soft_node:
                    drink_options.append(soft_node.get("name", "飲み放題（ソフトドリンク）"))
                
                # 既存の「飲み放題プラン」ボタンも残す
                other_options = ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
                
                # 飲み放題詳細 → その他オプションの順で追加
                for option in drink_options + other_options:
                    if option not in options:
                        options.append(option)
                logger.info(f"[Banquet] コース詳細ページ: 共通候補選択肢を追加 (飲み放題詳細: {len(drink_options)}件, その他: {len(other_options)}件)")
            
            # banquet_entryにも飲み放題ボタンを追加
            if node_id == "banquet_entry" or "entry" in node_id.lower():
                drink_options = []
                alcohol_node = self.conversation_system.get_node_by_id("banquet_drink_alcohol")
                if alcohol_node:
                    drink_options.append(alcohol_node.get("name", "飲み放題（アルコール90分）"))
                soft_node = self.conversation_system.get_node_by_id("banquet_drink_soft")
                if soft_node:
                    drink_options.append(soft_node.get("name", "飲み放題（ソフトドリンク）"))
                
                # 既存のコースタブに追加（コースタブは既に表示されているので、ここでは追加のみ）
                for drink_option in drink_options:
                    if drink_option not in options:
                        options.insert(0, drink_option)  # 先頭に追加
                logger.info(f"[Banquet] 宴会入口: 飲み放題ボタンを追加 ({len(drink_options)}件)")
            
            # 遷移先が0件の場合はボタンなし
            state["response"] = response_text
            state["options"] = options if options else ["メニューを見る"]
            
            # クロスリフレクション適用（宴会・忘年会は重要な応答）
            engine_ready = False
            if state.get("response"):
                engine_ready = self._ensure_cross_reflection_engine()
                logger.info(f"[CrossReflection] 宴会応答検出: response_length={len(state.get('response', ''))}")
                logger.info(f"[CrossReflection] クロスリフレクションエンジン状態: {engine_ready}")
            
            if engine_ready and state.get("response"):
                try:
                    last_message = state.get("messages", [])[-1] if state.get("messages") else ""
                    initial_response = state.get("response", "")
                    logger.info(f"[CrossReflection] 宴会応答にクロスリフレクション適用開始: {len(initial_response)}文字")
                    
                    # コンテキストを構築
                    context_parts = []
                    if template:
                        context_parts.append(f"テンプレート:\n{template}")
                    if node_id:
                        context_parts.append(f"ノードID: {node_id}")
                    reflection_context = "\n\n".join(context_parts) if context_parts else None
                    
                    # クロスリフレクション適用
                    improved_response = self.cross_reflection_engine.apply_reflection(
                        user_message=last_message,
                        initial_response=initial_response,
                        intent="banquet",
                        context=reflection_context
                    )
                    
                    if improved_response != initial_response:
                        logger.info(f"[CrossReflection] ✅ 宴会応答を改善しました: {len(initial_response)}文字 → {len(improved_response)}文字")
                        state["response"] = improved_response
                    else:
                        logger.info("[CrossReflection] ℹ️ 宴会応答改善なし（スキップまたはスコア高）")
                except Exception as e:
                    logger.error(f"[CrossReflection] ❌ エラー（フォールバック）: {e}")
                    import traceback
                    logger.error(f"[CrossReflection] トレースバック: {traceback.format_exc()}")
                    # エラーが発生しても元の応答を使用
            
            logger.info(f"[Banquet] ノード表示完了: {node_id}, ボタン数: {len(options)}")
            return state
            
        except Exception as e:
            logger.error(f"[Banquet] エラー: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            state["response"] = "準備中です。少々お待ちください。"
            state["options"] = ["メニューを見る"]
            return state
    
    def _detect_banquet_intent(self, user_input: str) -> Optional[str]:
        """
        ユーザー入力から宴会インテントを検出（広範囲・柔軟な検出）
        
        【重要】「忘年会」「年末」関連キーワードは除外し、bonenkai_introノードに委ねる
        
        Args:
            user_input: ユーザーの入力
            
        Returns:
            インテント名（例: "intent.banquet"）またはNone
        """
        user_input_lower = user_input.lower()
        
        # 正規化：全角半角・大文字小文字・ひらがなカタカナを統一
        import re
        
        # カタカナをひらがなに変換する関数
        def katakana_to_hiragana(text):
            """カタカナをひらがなに変換"""
            result = []
            for char in text:
                # カタカナ範囲（\u30A1-\u30F6）をひらがな範囲（\u3041-\u3096）に変換
                if '\u30A1' <= char <= '\u30F6':
                    hiragana_char = chr(ord(char) - 0x60)
                    result.append(hiragana_char)
                else:
                    result.append(char)
            return ''.join(result)
        
        normalized_input = user_input_lower
        # 全角英数字を半角に変換
        normalized_input = normalized_input.translate(str.maketrans('０１２３４５６７８９ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ',
                                                                    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'))
        # カタカナをひらがなに変換
        normalized_input = katakana_to_hiragana(normalized_input)
        
        # 【重要】「忘年会」「年末」関連キーワードがある場合は、このメソッドでは検出せず
        # _find_node_by_keywords で bonenkai_intro が選ばれるようにする
        bonenkai_exclusive_keywords = [
            "忘年会", "ぼうねんかい", "bounenkai",
            "忘新年会", "ぼうしんねんかい",
            "年末", "ねんまつ", "年末の宴会", "年末飲み会"
        ]
        for bonenkai_kw in bonenkai_exclusive_keywords:
            if bonenkai_kw in user_input_lower or bonenkai_kw in normalized_input:
                logger.info(f"[Banquet] 忘年会専用キーワード検出: '{bonenkai_kw}' → キーワードマッチングに委ねる")
                return None  # 宴会インテントとして検出しない
        
        # 宴会関連キーワード（広範囲なバリエーション）
        # 【重要】「忘年会」は除外済み（bonenkai_introノードで処理）
        banquet_base_keywords = [
            # 基本表現（全文字種対応）
            "宴会", "えんかい", "エンカイ", "enkai",
            # 宴会の種類（忘年会は除く）
            "新年会", "しんねんかい", "シンネンカイ", "shinnenkai",
            "歓迎会", "かんげいかい", "カンゲイカイ", "kangeikai",
            "送別会", "そうべつかい", "ソウベツカイ", "sobetsukai",
            "懇親会", "こんしんかい", "コンシンカイ", "konshinkai",
            "打ち上げ", "うちあげ", "ウチアゲ", "uchiage",
            "歓送迎会", "かんそうげいかい", "カンソウゲイカイ",
            # 宴会関連語
            "コース", "コース料理", "course",
            "オードブル", "おーどぶる", "oodorubu", "hors d'oeuvre",
            "飲み放題", "のみほうだい", "ノミホウダイ", "nomihoudai",
            "飲み", "のみ", "ノミ", "nomi",
            # 予約・利用関連
            "予約", "よやく", "ヨヤク", "yoyaku", "reservation",
            "利用", "りよう", "リヨウ", "riyou", "use",
            "希望", "きぼう", "キボウ", "kibou",
            "したい", "シタイ", "shitai",
            # プラン・メニュー
            "プラン", "plan",
            "メニュー", "menu",
            # 人数・規模
            "大人数", "おおにんずう", "大勢", "おおぜい",
            "グループ", "group",
            "少人数", "しょうにんずう",
            # その他関連語
            "会食", "かいしょく", "カイショク",
            "パーティー", "party", "pa-ti-",
            "イベント", "event",
            # "会", "かい", "カイ",  # 単独の「会」は「いか刺」などに誤マッチするため削除
        ]
        
        # 質問パターン（柔軟な検出）
        question_patterns = [
            "ありますか", "できますか", "可能ですか", "やってますか", "やっていますか",
            "あります", "できます", "可能です", "やってます", "やっています",
            "したい", "したいです", "したいのですが", "したいんですが",
            "予約", "予約したい", "予約できますか", "予約は",
            "メニュー", "プラン", "コース",
            "について", "に関して", "を知りたい", "が知りたい",
        ]
        
        # 宴会キーワードの検出（柔軟なマッチング）
        has_banquet = False
        
        # 1. 直接キーワードマッチ
        for keyword in banquet_base_keywords:
            if keyword in normalized_input or keyword in user_input or keyword in user_input_lower:
                has_banquet = True
                logger.debug(f"[Banquet] キーワード検出: '{keyword}' in '{user_input}'")
                break
        
        # 2. 部分文字列マッチ（「宴会」を含む文字列）
        banquet_chars = ["宴会", "えんかい", "エンカイ", "enkai"]
        for char in banquet_chars:
            if char in user_input or char in normalized_input:
                has_banquet = True
                logger.debug(f"[Banquet] 文字列検出: '{char}' in '{user_input}'")
                break
        
        # 3. 正規表現パターンマッチ（「宴会」+ 助詞・動詞）
        banquet_patterns = [
            r"宴会[はがをにで]?",
            r"宴会[のもの]?",
            r"宴会[したい希望予約利用]",
            r"宴会.*[ありますかできますか可能ですか]",
            # r"[宴会えんかいエンカイ].*[会かいカイ]",  # 「いか刺」などに誤マッチするため削除
            r"(宴会|えんかい|エンカイ).*[会かいカイ]",  # 「宴会」や「えんかい」が先に存在することを確認
        ]
        
        for pattern in banquet_patterns:
            if re.search(pattern, user_input) or re.search(pattern, normalized_input):
                has_banquet = True
                logger.debug(f"[Banquet] パターンマッチ: '{pattern}' in '{user_input}'")
                break
        
        # 4. 質問形式の検出（「宴会」+ 質問語）
        if "宴会" in user_input or "えんかい" in normalized_input or "エンカイ" in user_input:
            for q_pattern in question_patterns:
                if q_pattern in user_input or q_pattern in normalized_input:
                    has_banquet = True
                    logger.debug(f"[Banquet] 質問形式検出: '{q_pattern}' in '{user_input}'")
                    break
        
        # 宴会関連キーワードが検出された場合
        if has_banquet:
            # より詳細なインテントを検出
            
            # 価格コース
            if any(price in user_input for price in ["3000円", "3000", "３０００"]):
                return "intent.banquet.course.3000"
            elif any(price in user_input for price in ["4000円", "4000", "４０００"]):
                return "intent.banquet.course.4000"
            elif any(price in user_input for price in ["5000円", "5000", "５０００"]):
                return "intent.banquet.course.5000"
            
            # オードブル
            if "オードブル" in user_input or "oodorubu" in user_input_lower:
                return "intent.banquet.oodorubu"
            
            # 飲み放題（詳細インテントを優先検出）
            # アルコール系のキーワード
            alcohol_keywords = [
                "アルコール", "ビール", "ハイボール", "サワー", "日本酒", "焼酎", "ワイン", "カクテル",
                "お酒", "おさけ", "アルコール飲み放題", "アルコールのみ"
            ]
            if any(kw in user_input for kw in alcohol_keywords):
                return "intent.banquet.drinks.alcohol"
            
            # ソフトドリンク系のキーワード
            soft_keywords = [
                "ソフト", "ノンアル", "ジュース", "ウーロン茶", "コーラ", "ジンジャーエール",
                "ソフトドリンク", "ノンアルコール", "ソフトのみ", "ドリンク"
            ]
            if any(kw in user_input for kw in soft_keywords):
                return "intent.banquet.drinks.soft"
            
            # 一般的な飲み放題
            if "飲み放題" in user_input or "飲み" in user_input:
                return "intent.banquet.drinks"
            
            # オプション
            option_keywords = [
                "すき焼き", "焼肉", "海鮮鍋", "鉄板焼き", "刺身グレードアップ", "肉料理追加",
                "カスタム", "オプション"
            ]
            if any(kw in user_input for kw in option_keywords):
                return "intent.banquet.options"
            
            # おすすめ
            recommend_keywords = [
                "店長おすすめ", "おすすめ", "お勧め", "会社宴会", "家族", "少人数",
                "しっかり食べたい", "しっかり飲みたい"
            ]
            if any(kw in user_input for kw in recommend_keywords):
                return "intent.banquet.recommend"
            
            # デフォルトは基本宴会
            return "intent.banquet"
        
        return None
    
    def _route_banquet_intent_to_node(self, intent: str) -> Optional[str]:
        """
        宴会インテントをノードIDに変換
        
        Args:
            intent: インテント名（例: "intent.banquet"）
            
        Returns:
            ノードID（例: "banquet_entry"）またはNone
        """
        intent_to_node = {
            "intent.banquet": "banquet_entry",
            "intent.banquet.course.3000": "banquet_course_3000",
            "intent.banquet.course.4000": "banquet_course_4000",
            "intent.banquet.course.5000": "banquet_course_5000",
            "intent.banquet.oodorubu": "banquet_oodorubu",
            "intent.banquet.drinks": "banquet_drink_plans",
            "intent.banquet.drinks.alcohol": "banquet_drink_alcohol",
            "intent.banquet.drinks.soft": "banquet_drink_soft",
            "intent.banquet.options": "banquet_custom_options",
            "intent.banquet.recommend": "banquet_recommend"
        }
        
        return intent_to_node.get(intent)
    
    def _get_banquet_course_details(self, course_name: str, node_id: str) -> Dict[str, Any]:
        """
        宴会コースの詳細情報を取得（フォールバック用）
        
        Args:
            course_name: コース名（例: "3,000円コース"）
            node_id: ノードID（例: "banquet_course_3000"）
        
        Returns:
            レスポンステキストと選択肢の辞書
        """
        course_templates = {
            "3,000円コース": {
                "response": """【3,000円コース】

刺身／天ぷら／焼き物／揚げ物／鍋 or 鉄板焼き／寿司／味噌汁／アイス

スタンダードな宴会セットです。飲み放題の追加や、鍋・鉄板焼きの選択も可能です。""",
                "options": ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
            },
            "4,000円コース": {
                "response": """【4,000円コース】

3,000円コース内容＋ご要望に応じて追加1品

（例：鍋、すき焼き、焼肉、特別料理、オードブル追加など）

飲み放題の組み合わせも可能です。""",
                "options": ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
            },
            "5,000円コース": {
                "response": """【5,000円コース】（店長おすすめ）

3,000円コース内容＋追加2品以上の豪華オプション

（例：特選刺身・肉料理・豪華オードブルセットなど）

飲み放題込み構成も人気です。""",
                "options": ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
            },
            "オードブル形式": {
                "response": """【オードブル形式】

刺身盛り／餃子／サラダ／上海焼きそば／揚げ物オードブル／寿司オードブル／アイス／味噌汁

大人数の忘年会に人気です。数量や内容は人数に合わせて調整可能です。""",
                "options": ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
            }
        }
        
        # コース名から直接検索
        if course_name in course_templates:
            return course_templates[course_name]
        
        # ノードIDから検索
        node_id_to_course = {
            "banquet_course_3000": "3,000円コース",
            "banquet_course_4000": "4,000円コース",
            "banquet_course_5000": "5,000円コース",
            "banquet_oodorubu": "オードブル形式"
        }
        
        if node_id in node_id_to_course:
            course_key = node_id_to_course[node_id]
            if course_key in course_templates:
                return course_templates[course_key]
        
        # デフォルト
        return {
            "response": f"{course_name}の詳細を準備中です。スタッフまでお問い合わせください。",
            "options": ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
        }
    
    def proactive_recommend(self, state: State) -> State:
        """プロアクティブおすすめノード（時間帯対応・改善版）"""
        logger.info("[Node] proactive_recommend")
        
        # コンテキストを最新の状態で再取得（時間帯を正確に判定）
        context = self._update_time_context(state)
        time_zone = context.get("time_zone", "other")
        season = context.get("season", "秋")
        hour = context.get("hour", 0)
        
        logger.info(f"[Proactive] 時間帯={time_zone}, 時刻={hour}時, 季節={season}")
        
        # 時間帯に応じたおすすめ
        if time_zone == "lunch":
            # ランチタイム（11-14時）のみ
            state["response"] = f"🍱 お昼の時間ですね。{season}のランチメニューはいかがですか？"
            state["options"] = [
                "日替わりランチはこちら",
                "寿司ランチはこちら",
                "おすすめ定食はこちら"
            ]
        
        elif time_zone == "dinner":
            # ディナータイム（17-22時）
            state["response"] = f"🍶 夜のメニューもございます。{season}の旬の食材を使った料理はいかがですか？"
            state["options"] = [
                "今晩のおすすめ一品はこちら",
                "おすすめ定食はこちら",
                "逸品料理はこちら",
                "お酒に合うつまみ"
            ]
        
        else:
            # その他の時間帯（14-17時、22時以降）- プロアクティブ送信しない
            logger.info("[Proactive] 営業時間外のため、プロアクティブ送信をスキップ")
            state["should_push"] = False  # 送信しない
            return state
        
        state["should_push"] = True  # プッシュ送信フラグ
        
        return state
    
    def option_click(self, state: State) -> State:
        """選択肢クリック処理ノード"""
        logger.info("[Node] option_click")
        
        messages = state.get("messages", [])
        selected_option = messages[-1] if messages else ""
        selected_option = selected_option.strip() if selected_option else ""
        
        logger.info(f"[選択肢クリック] '{selected_option}'")
        
        # 「おすすめ定食の続き」を最優先で処理（会話ノード検索より前に配置）
        if selected_option == "おすすめ定食の続き" or selected_option == "おすすめ定食はこちら":
            if self.notion_client and self.config:
                menu_db_id = self.config.get("notion.database_ids.menu_db")
                if menu_db_id:
                    logger.info(f"[Teishoku] おすすめ定食の続きクリック検出: '{selected_option}'")
                    # コンテキストから残りのメニューを取得
                    context = state.get("context", {})
                    remaining_menus = context.get("recommended_teishoku_remaining", [])
                    
                    if remaining_menus:
                        logger.info(f"[Teishoku] 残りのおすすめ定食を表示: {len(remaining_menus)}件")
                        response_lines = ["🍽️ **おすすめ定食（続き）**\n"]
                        for menu in remaining_menus:
                            name = menu.get("name", "")
                            price = menu.get("price", 0)
                            short_desc = menu.get("short_desc", "")
                            
                            price_text = ""
                            if isinstance(price, (int, float)) and price > 0:
                                price_text = f" ｜ ¥{int(price):,}"
                            
                            response_lines.append(f"• **{name}**{price_text}")
                            if short_desc:
                                response_lines.append(f"   {short_desc}")
                            response_lines.append("")
                        
                        state["response"] = "\n".join(response_lines).strip()
                        state["options"] = ["メニューを見る", "おすすめを教えて"]
                        logger.info(f"[Teishoku] 残りのおすすめ定食表示完了: {len(remaining_menus)}件")
                        return state
                    else:
                        # コンテキストに残りのメニューがない場合は、Notionから全件取得
                        logger.info("[Teishoku] コンテキストに残りのメニューなし、Notionから取得")
                        all_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="おすすめ定食",
                            limit=100,
                            sort_by_priority=True
                        )
                        
                        logger.info(f"[Teishoku] Notionから取得した全メニュー数: {len(all_menus) if all_menus else 0}件")
                        
                        if all_menus and len(all_menus) > 5:
                            remaining_menus = all_menus[5:]
                            logger.info(f"[Teishoku] 残りのメニュー（6件目以降）: {len(remaining_menus)}件")
                            response_lines = ["🍽️ **おすすめ定食（続き）**\n"]
                            for menu in remaining_menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                
                                price_text = ""
                                if isinstance(price, (int, float)) and price > 0:
                                    price_text = f" ｜ ¥{int(price):,}"
                                
                                response_lines.append(f"• **{name}**{price_text}")
                                if short_desc:
                                    response_lines.append(f"   {short_desc}")
                                response_lines.append("")
                            
                            state["response"] = "\n".join(response_lines).strip()
                            state["options"] = ["メニューを見る", "おすすめを教えて"]
                            logger.info(f"[Teishoku] 残りのおすすめ定食表示完了（Notionから）: {len(remaining_menus)}件")
                            return state
                        else:
                            logger.warning(f"[Teishoku] 残りのメニューが見つかりません: 全メニュー数={len(all_menus) if all_menus else 0}件")
                            state["response"] = "申し訳ございません。残りのおすすめ定食が見つかりませんでした。"
                            state["options"] = ["メニューを見る", "おすすめを教えて"]
                            return state
        
        if selected_option == "その他はこちらです":
            context = state.get("context") or {}
            logger.info(f"[Fried] コンテキスト確認: {list(context.keys())}")
            logger.info(f"[Fried] fried_food_remaining存在: {'fried_food_remaining' in context}")
            if 'fried_food_remaining' in context:
                logger.info(f"[Fried] fried_food_remaining件数: {len(context.get('fried_food_remaining', []))}")
            remaining_items = context.get("fried_food_remaining", []) or []
            if not remaining_items:
                logger.info("[Fried] コンテキストに残りメニューなし、再度取得を試みます")
                menus = self._fetch_fried_food_menus()
                if menus and len(menus) > 5:
                    remaining_items = menus[5:]
                    logger.info(f"[Fried] 再取得成功: 残り{len(remaining_items)}件")
            if remaining_items:
                lines = ["🍤 **その他の揚げ物メニュー**", ""]
                for menu in remaining_items:
                    name = menu.get("name", "メニュー名不明")
                    price = menu.get("price", 0)
                    short_desc = menu.get("short_desc", "")
                    price_text = ""
                    if isinstance(price, (int, float)) and price > 0:
                        price_text = f" ¥{int(price):,}"
                    lines.append(f"• **{name}**{price_text}")
                    if short_desc:
                        lines.append(f"  {short_desc}")
                    lines.append("")
                context["fried_food_remaining"] = []
                state["context"] = context
                state["response"] = self._add_order_instruction("\n".join(lines).strip())
                state["options"] = [
                    "今晩のおすすめ一品 確認",
                    "焼き鳥メニュー確認",
                    "天ぷらメニュー確認"
                ]
                logger.info(f"[Fried] その他の揚げ物メニュー表示: {len(remaining_items)}件")
            else:
                state["response"] = "申し訳ございません。その他の揚げ物メニューを現在ご案内できません。"
                state["options"] = [
                    "今晩のおすすめ一品 確認",
                    "焼き鳥メニュー確認",
                    "天ぷらメニュー確認"
                ]
                logger.warning("[Fried] 残りの揚げ物メニューが存在しません")
            return state
        
        # 宴会コースタブのクリックを最優先で処理
        course_tab_mapping = {
            "3,000円コース": "banquet_course_3000",
            "4,000円コース": "banquet_course_4000",
            "5,000円コース": "banquet_course_5000",
            "オードブル形式": "banquet_oodorubu",
            "オードブルコース": "banquet_oodorubu"  # 別名にも対応
        }
        
        # コースタブのクリック判定（最優先）
        if selected_option in course_tab_mapping:
            target_node_id = course_tab_mapping[selected_option]
            logger.info(f"[Banquet] コースタブクリック: '{selected_option}' → {target_node_id}")
            
            # ノードを取得
            if self.conversation_system:
                course_node = self.conversation_system.get_node_by_id(target_node_id)
                
                if course_node:
                    template = course_node.get("template", "")
                    next_nodes = course_node.get("next", [])
                    node_name = course_node.get("name", "")
                    
                    if not template or not template.strip():
                        # テンプレートが空の場合、フォールバック情報を使用
                        logger.warning(f"[Banquet] コースノードのテンプレートが空: {target_node_id}")
                        fallback_details = self._get_banquet_course_details(selected_option, target_node_id)
                        state["response"] = fallback_details["response"]
                        state["options"] = fallback_details["options"]
                        logger.info(f"[Banquet] フォールバック情報を表示: {selected_option}")
                        return state
                    else:
                        # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                        response_text = template
                    
                    # 共通候補の選択肢を追加
                    options = []
                    
                    # 遷移先からボタンを自動生成
                    for next_node_ref in next_nodes:
                        next_node = None
                        if hasattr(self.conversation_system, 'get_node_by_page_id'):
                            next_node = self.conversation_system.get_node_by_page_id(next_node_ref)
                        if not next_node:
                            next_node = self.conversation_system.get_node_by_id(next_node_ref)
                        if next_node:
                            options.append(next_node.get("name", next_node_ref))
                    
                    # 飲み放題詳細ボタンを追加（優先）
                    drink_options = []
                    alcohol_node = self.conversation_system.get_node_by_id("banquet_drink_alcohol")
                    if alcohol_node:
                        drink_options.append(alcohol_node.get("name", "飲み放題（アルコール90分）"))
                    soft_node = self.conversation_system.get_node_by_id("banquet_drink_soft")
                    if soft_node:
                        drink_options.append(soft_node.get("name", "飲み放題（ソフトドリンク）"))
                    
                    # 既存の共通候補
                    common_options = ["飲み放題プラン", "カスタムオプション", "ニーズ別おすすめ"]
                    
                    # 飲み放題詳細 → その他オプションの順で追加
                    for option in drink_options + common_options:
                        if option not in options:
                            options.append(option)
                    
                    state["response"] = response_text
                    state["options"] = options if options else common_options
                    logger.info(f"[Banquet] コース詳細表示: {target_node_id}, テンプレート使用, ボタン数: {len(options)}")
                    return state
                else:
                    logger.warning(f"[Banquet] コースノードが見つかりません: {target_node_id}")
                    # フォールバック：コース詳細情報を直接表示
                    course_details = self._get_banquet_course_details(selected_option, target_node_id)
                    state["response"] = course_details["response"]
                    state["options"] = course_details["options"]
                    logger.info(f"[Banquet] フォールバック情報を表示: {selected_option}")
                    return state
        
        # 「（続きを見る）」ボタンと「（続きはこちら）」ボタンの処理
        if "（続きを見る）" in selected_option or "（続きはこちら）" in selected_option:
            logger.info(f"[続きを見る] 選択肢: {selected_option}")
            
            # カテゴリ名を抽出
            category_name = selected_option.replace("（続きを見る）", "").replace("（続きはこちら）", "").replace("はこちら", "")
            
            # 「弁当（続きはこちら）」の特別処理
            if category_name == "弁当":
                context = state.get("context", {})
                remaining_menus = context.get("bento_remaining", []) or []
                
                logger.info(f"[弁当続き] コンテキストから残りメニュー取得: {len(remaining_menus)}件")
                
                if remaining_menus:
                    # 10品ずつ表示
                    display_menus = remaining_menus[:10]
                    remaining_after_display = remaining_menus[10:]
                    
                    response_text = "🍱 **弁当メニュー（続き）**\n\n"
                    
                    for menu in display_menus:
                        name = menu.get("name", "メニュー名不明")
                        price = menu.get("price", 0)
                        short_desc = menu.get("short_desc", "")
                        description = menu.get("description", "")
                        
                        response_text += f"• **{name}**"
                        if price > 0:
                            response_text += f" ¥{price:,}"
                        response_text += "\n"
                        
                        if short_desc:
                            response_text += f"  💬 {short_desc}\n"
                        
                        if description:
                            response_text += f"  {description}\n"
                        
                        response_text += "\n"
                    
                    # 残りメニューをコンテキストに保存
                    context["bento_remaining"] = remaining_after_display
                    state["context"] = context
                    
                    # 注文案内を追加
                    response_text += "\nご注文はスタッフにお伝えください。"
                    state["response"] = response_text
                    
                    # 残りがあれば再度「弁当（続きはこちら）」ボタンを表示
                    if remaining_after_display:
                        state["options"] = ["弁当（続きはこちら）"]
                    else:
                        state["options"] = []
                    
                    logger.info(f"[弁当続き] {len(display_menus)}件表示、残り{len(remaining_after_display)}件")
                else:
                    # コンテキストにない場合は再取得を試みる
                    logger.info("[弁当続き] コンテキストに残りメニューなし、再取得を試みます")
                    if self.notion_client and self.config:
                        try:
                            menu_db_id = self.config.get("notion.database_ids.menu_db")
                            karaage_menus = self.notion_client.get_menu_details_by_category(
                                database_id=menu_db_id,
                                category_property="Subcategory",
                                category_value="テイクアウト唐揚げ",
                                limit=50
                            )
                            ichipin_menus = self.notion_client.get_menu_details_by_category(
                                database_id=menu_db_id,
                                category_property="Subcategory",
                                category_value="テイクアウト一品",
                                limit=50
                            )
                            remaining_menus = karaage_menus + ichipin_menus
                            
                            if remaining_menus:
                                display_menus = remaining_menus[:10]
                                remaining_after_display = remaining_menus[10:]
                                
                                response_text = "🍱 **弁当メニュー（続き）**\n\n"
                                
                                for menu in display_menus:
                                    name = menu.get("name", "メニュー名不明")
                                    price = menu.get("price", 0)
                                    short_desc = menu.get("short_desc", "")
                                    description = menu.get("description", "")
                                    
                                    response_text += f"• **{name}**"
                                    if price > 0:
                                        response_text += f" ¥{price:,}"
                                    response_text += "\n"
                                    
                                    if short_desc:
                                        response_text += f"  💬 {short_desc}\n"
                                    
                                    if description:
                                        response_text += f"  {description}\n"
                                    
                                    response_text += "\n"
                                
                                context["bento_remaining"] = remaining_after_display
                                state["context"] = context
                                
                                response_text += "\nご注文はスタッフにお伝えください。"
                                state["response"] = response_text
                                
                                if remaining_after_display:
                                    state["options"] = ["弁当（続きはこちら）"]
                                else:
                                    state["options"] = []
                            else:
                                state["response"] = "申し訳ございません。弁当メニューは以上です。"
                                state["options"] = []
                        except Exception as e:
                            logger.error(f"[弁当続き] 再取得エラー: {e}")
                            state["response"] = "申し訳ございません。弁当メニューの続きを取得できませんでした。"
                            state["options"] = []
                    else:
                        state["response"] = "申し訳ございません。弁当メニューは以上です。"
                        state["options"] = []
                
                return state
            
            # その他のカテゴリの処理（既存のロジック）
            category_mapping = {
                "逸品料理": "逸品料理",
                "海鮮定食": "海鮮定食メニュー",
                "おすすめ定食": "おすすめ定食",
                "定食屋メニュー": "定食屋メニュー",
                "今晩のおすすめ一品": "今晩のおすすめ一品",
            }
            
            # マッピングがある場合はサブカテゴリー名を使用
            subcategory_name = category_mapping.get(category_name, category_name)
            logger.info(f"[続きを見る] 抽出されたカテゴリ: '{category_name}' → サブカテゴリ: '{subcategory_name}'")
            
            if not self.notion_client or not self.config:
                state["response"] = f"申し訳ございません。{category_name}の続きを取得できませんでした。"
                state["options"] = ["メニューを見る"]
                return state
            
            try:
                menu_db_id = self.config.get("notion.database_ids.menu_db")
                
                # 直接Notionから全ページを取得してフィルタリング
                pages = self.notion_client.get_all_pages(menu_db_id)
                logger.info(f"[続きを見る] 全ページ数: {len(pages)}件")
                
                # サブカテゴリでフィルタリング
                filtered_menus = []
                for page in pages:
                    name = self.notion_client._extract_property_value(page, "Name")
                    subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                    
                    if name and subcategory == subcategory_name:
                        price = self.notion_client._extract_property_value(page, "Price", 0)
                        short_desc = self.notion_client._extract_property_value(page, "一言紹介")
                        description = self.notion_client._extract_property_value(page, "詳細説明")
                        
                        filtered_menus.append({
                            "name": name,
                            "price": price,
                            "short_desc": short_desc,
                            "description": description
                        })
                        logger.info(f"[続きを見る] メニュー追加: {name} (サブカテゴリ: '{subcategory}')")
                
                logger.info(f"[続きを見る] フィルタ後メニュー数: {len(filtered_menus)}件")
                
                # 6件目以降を表示
                start_index = 6
                remaining_menus = filtered_menus[start_index:] if len(filtered_menus) > start_index else []
                
                if remaining_menus:
                    response_text = f"🍱 **{category_name}（続き）**\n\n"
                    
                    for menu in remaining_menus:
                        name = menu.get("name", "メニュー名不明")
                        price = menu.get("price", 0)
                        short_desc = menu.get("short_desc", "")
                        description = menu.get("description", "")
                        
                        # メニュー名と価格（必ず表示）
                        response_text += f"• **{name}**"
                        if price > 0:
                            response_text += f" ¥{price:,}"
                        response_text += "\n"
                        
                        # 一言紹介を表示
                        if short_desc:
                            response_text += f"  💬 {short_desc}\n"
                        
                        # 詳細説明を全文表示（一言紹介がある場合も表示）
                        if description:
                            response_text += f"  {description}\n"
                        
                        response_text += "\n"
                    
                    # 注文案内を追加
                    state["response"] = self._add_order_instruction(response_text)
                    state["options"] = []
                else:
                    state["response"] = f"申し訳ございません。{category_name}は以上です。"
                    state["options"] = ["メニューを見る"]
            
            except Exception as e:
                logger.error(f"続きを見るメニュー取得エラー: {e}")
                state["response"] = f"申し訳ございません。{category_name}の続きを取得できませんでした。"
                state["options"] = ["メニューを見る"]
            
            return state
        
        # 宴会関連のボタンクリック処理（飲み放題プラン、カスタムオプションなど）
        banquet_button_mapping = {
            "飲み放題プラン": "banquet_drink_plans",
            "カスタムオプション": "banquet_custom_options",
            "ニーズ別おすすめ": "banquet_recommend",
            "飲み放題（アルコール90分）": "banquet_drink_alcohol",
            "飲み放題（ソフトドリンク）": "banquet_drink_soft"
        }
        
        if selected_option in banquet_button_mapping:
            target_node_id = banquet_button_mapping[selected_option]
            logger.info(f"[Banquet] ボタンクリック: '{selected_option}' → {target_node_id}")
            
            if self.conversation_system:
                target_node = self.conversation_system.get_node_by_id(target_node_id)
                
                if target_node:
                    template = target_node.get("template", "")
                    next_nodes = target_node.get("next", [])
                    node_name = target_node.get("name", "")
                    
                    if not template or not template.strip():
                        response_text = f"{node_name}\n\n詳細はスタッフまでお問い合わせください。"
                    else:
                        # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                        response_text = template
                    
                    # 遷移先からボタンを自動生成
                    options = []
                    for next_node_ref in next_nodes:
                        next_node = None
                        if hasattr(self.conversation_system, 'get_node_by_page_id'):
                            next_node = self.conversation_system.get_node_by_page_id(next_node_ref)
                        if not next_node:
                            next_node = self.conversation_system.get_node_by_id(next_node_ref)
                        if next_node:
                            options.append(next_node.get("name", next_node_ref))
                    
                    # 飲み放題プランの場合は詳細ボタンを追加
                    if target_node_id == "banquet_drink_plans":
                        drink_options = []
                        alcohol_node = self.conversation_system.get_node_by_id("banquet_drink_alcohol")
                        if alcohol_node:
                            drink_options.append(alcohol_node.get("name", "飲み放題（アルコール90分）"))
                        soft_node = self.conversation_system.get_node_by_id("banquet_drink_soft")
                        if soft_node:
                            drink_options.append(soft_node.get("name", "飲み放題（ソフトドリンク）"))
                        for drink_option in drink_options:
                            if drink_option not in options:
                                options.append(drink_option)
                    
                    state["response"] = response_text
                    state["options"] = options if options else ["メニューを見る"]
                    logger.info(f"[Banquet] ボタン詳細表示: {target_node_id}, ボタン数: {len(options)}")
                    return state
                else:
                    logger.warning(f"[Banquet] ノードが見つかりません: {target_node_id}")
                    # フォールバック
                    if target_node_id == "banquet_drink_plans":
                        # 飲み放題プランが見つからない場合でも、詳細ボタンを表示
                        drink_options = []
                        
                        # アルコールノードを検索（複数の方法を試す）
                        alcohol_node = self.conversation_system.get_node_by_id("banquet_drink_alcohol")
                        logger.info(f"[Banquet] アルコールノード検索1: get_node_by_id('banquet_drink_alcohol') → {alcohol_node is not None}")
                        
                        if not alcohol_node:
                            # 大文字小文字を無視して検索（ノンアルコールを厳密に除外）
                            conversation_nodes = self.conversation_system.get_conversation_nodes()
                            logger.info(f"[Banquet] 代替検索開始: 全ノード数 {len(conversation_nodes)}件")
                            
                            # デバッグ: 宴会関連ノードをすべてログ出力
                            banquet_related = []
                            for node_id, node_data in conversation_nodes.items():
                                node_name = str(node_data.get("name", ""))
                                if "banquet" in node_id.lower() or "宴会" in node_name or "飲み放題" in node_name:
                                    banquet_related.append(f"{node_id} (name: {node_name})")
                            
                            if banquet_related:
                                logger.info(f"[Banquet] 宴会関連ノード一覧: {banquet_related}")
                            
                            for node_id, node_data in conversation_nodes.items():
                                node_id_lower = node_id.lower()
                                node_name = str(node_data.get("name", ""))
                                
                                # ノンアルコールを厳密に除外
                                if ("ノンアル" in node_name or "ノンアルコール" in node_name or 
                                    "nonalc" in node_id_lower or "non-alc" in node_id_lower or 
                                    "non_alcohol" in node_id_lower or "beer_nonalc" in node_id_lower):
                                    continue
                                
                                # アルコールノードの厳密な判定
                                # 1. ノードIDがbanquet_drink_alcohol（完全一致または部分一致）
                                # 2. ノード名に「飲み放題」と「アルコール」の両方を含むが、「ノン」を含まない
                                is_alcohol_node = False
                                if "banquet_drink" in node_id_lower and "alcohol" in node_id_lower:
                                    # banquet_drink_alcoholの完全一致または部分一致
                                    is_alcohol_node = True
                                    logger.debug(f"[Banquet] ノードID判定: {node_id} → アルコールノード候補")
                                elif "飲み放題" in node_name and "アルコール" in node_name:
                                    # ノード名に「飲み放題」と「アルコール」の両方を含む
                                    if "ノン" not in node_name:
                                        is_alcohol_node = True
                                        logger.debug(f"[Banquet] ノード名判定: {node_id} ({node_name}) → アルコールノード候補")
                                
                                if is_alcohol_node:
                                    alcohol_node = node_data
                                    logger.info(f"[Banquet] アルコールノード発見（代替検索）: {node_id} (name: {node_name})")
                                    break
                        
                        if alcohol_node:
                            drink_options.append(alcohol_node.get("name", "飲み放題（アルコール90分）"))
                            logger.info(f"[Banquet] アルコールノード追加: {alcohol_node.get('name', '飲み放題（アルコール90分）')}")
                        else:
                            logger.warning("[Banquet] アルコールノードが見つかりません: banquet_drink_alcohol")
                        
                        # ソフトノードを検索（複数の方法を試す）
                        soft_node = self.conversation_system.get_node_by_id("banquet_drink_soft")
                        if not soft_node:
                            # 大文字小文字を無視して検索
                            conversation_nodes = self.conversation_system.get_conversation_nodes()
                            for node_id, node_data in conversation_nodes.items():
                                if "soft" in node_id.lower() or "ソフト" in str(node_data.get("name", "")):
                                    soft_node = node_data
                                    logger.info(f"[Banquet] ソフトノード発見（代替検索）: {node_id}")
                                    break
                        
                        if soft_node:
                            drink_options.append(soft_node.get("name", "飲み放題（ソフトドリンク）"))
                            logger.info(f"[Banquet] ソフトノード追加: {soft_node.get('name', '飲み放題（ソフトドリンク）')}")
                        else:
                            logger.warning("[Banquet] ソフトノードが見つかりません: banquet_drink_soft")
                        
                        if drink_options:
                            state["response"] = """🍺 **飲み放題プラン**

以下のプランをご用意しております。

• アルコール飲み放題（90分）：2,200円
• ソフトドリンク飲み放題（90分）：1,100円

詳しい内容をご覧になりたい方は、下記ボタンからお選びください。"""
                            state["options"] = drink_options + ["カスタムオプション", "ニーズ別おすすめ"]
                            logger.info(f"[Banquet] フォールバック: 飲み放題詳細ボタンを表示 ({len(drink_options)}件)")
                        else:
                            state["response"] = "飲み放題プランの詳細を準備中です。スタッフまでお問い合わせください。"
                            state["options"] = ["メニューを見る"]
                    elif target_node_id == "banquet_drink_alcohol":
                        state["response"] = "飲み放題（アルコール90分）の詳細を準備中です。スタッフまでお問い合わせください。"
                        state["options"] = ["メニューを見る"]
                    elif target_node_id == "banquet_drink_soft":
                        state["response"] = "飲み放題（ソフトドリンク）の詳細を準備中です。スタッフまでお問い合わせください。"
                        state["options"] = ["メニューを見る"]
                    else:
                        state["response"] = f"{selected_option}の詳細を準備中です。スタッフまでお問い合わせください。"
                        state["options"] = ["メニューを見る"]
                    return state
        
        # 「天ぷら」タブが選択された場合、天ぷらメニューを表示
        if selected_option == "天ぷら":
            logger.info(f"[Tempura] 天ぷらタブ選択: '{selected_option}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # 天ぷら関連のメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="市場の天ぷら",
                            limit=8
                        )
                        
                        if menus:
                            response_text = "🍤 **天ぷらメニュー**\n\n"
                            response_text += "市場の天ぷらメニューをご案内いたします。野菜、海鮮、かき揚げなど豊富にご用意しております。\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 天ぷら盛り合わせの推奨を追加
                            response_text += "🌟 **おすすめ**: いろいろ少しずつ楽しめる『天ぷら盛り合せ』もございます。\n\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = [
                                "今晩のおすすめ一品 確認",
                                "揚げ物・酒つまみ 確認"
                            ]
                        else:
                            state["response"] = "申し訳ございません。天ぷらメニューを準備中です。"
                            state["options"] = ["逸品料理", "メニューを見る"]
                except Exception as e:
                    logger.error(f"天ぷらメニュー取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["メニューを見る"]
            else:
                state["response"] = "天ぷらメニューもございます。"
                state["options"] = ["メニューを見る"]
            
            return state
        
        # 「焼き鳥メニュー確認」が選択された場合、焼き鳥メニューを表示
        if selected_option == "焼き鳥メニュー確認":
            logger.info(f"[Yakitori] option_click: 焼き鳥メニュー確認選択: '{selected_option}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    logger.info(f"[Yakitori] option_click: menu_db_id={menu_db_id}")
                    if menu_db_id:
                        # 焼き鳥のメニューを取得
                        logger.info(f"[Yakitori] option_click: Notionからメニュー取得開始 (Subcategory='焼き鳥')")
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="焼き鳥",
                            limit=20  # 多めに取得
                        )
                        logger.info(f"[Yakitori] option_click: メニュー取得完了 ({len(menus) if menus else 0}件)")
                        
                        if menus and len(menus) > 0:
                            response_text = "🍢 **焼き鳥メニュー**\n\n"
                            response_text += "焼き鳥メニューをご案内いたします。各種串焼きをご用意しております。\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = [
                                "今晩のおすすめ一品 確認",
                                "揚げ物・酒つまみ 確認",
                                "天ぷらメニュー確認"
                            ]
                            logger.info(f"[Yakitori] option_click: 焼き鳥メニュー表示完了 ({len(menus)}件)")
                            return state
                        else:
                            logger.warning("[Yakitori] option_click: 焼き鳥メニューが見つかりません（menusが空またはNone）")
                            state["response"] = "申し訳ございません。焼き鳥メニューを準備中です。"
                            state["options"] = ["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認", "天ぷらメニュー確認"]
                            return state
                    else:
                        logger.warning("[Yakitori] option_click: menu_db_idが設定されていません")
                        state["response"] = "🍢 焼き鳥メニューもございます。"
                        state["options"] = ["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認", "天ぷらメニュー確認"]
                        return state
                except Exception as e:
                    logger.error(f"[Yakitori] option_click: 焼き鳥メニュー取得エラー: {e}")
                    import traceback
                    logger.error(f"[Yakitori] option_click: トレースバック: {traceback.format_exc()}")
                    state["response"] = "申し訳ございません。焼き鳥メニューの取得中にエラーが発生しました。"
                    state["options"] = ["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認", "天ぷらメニュー確認"]
                    return state
            else:
                logger.warning("[Yakitori] option_click: notion_clientまたはconfigがNoneです")
                state["response"] = "🍢 焼き鳥メニューもございます。"
                state["options"] = ["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認", "天ぷらメニュー確認"]
                return state
        
        # 「寿司」タブが選択された場合、全寿司メニューを表示（最優先）
        if selected_option == "寿司":
            logger.info(f"[Sushi] 寿司タブ選択: '{selected_option}'")
            # MenuServiceを使用して全寿司メニューを検索
            if self.notion_client:
                try:
                    from core.menu_service import MenuService
                    menu_service = MenuService(self.notion_client)
                    
                    # 全寿司メニューを検索
                    if self.config:
                        menu_db_id = self.config.get("notion.database_ids.menu_db")
                        if menu_db_id:
                            try:
                                # MenuServiceで寿司キーワード検索
                                menu_result = menu_service.search_menu("寿司")
                                if menu_result:
                                    result_lines = menu_result.split('\n')
                                    logger.info(f"[Sushi] 全寿司メニュー検索成功: {len(result_lines)}件")
                                    state["response"] = f"🍣 **寿司メニュー一覧**\n\n{menu_result}"
                                    state["options"] = ["お好み寿司", "盛り合わせ", "メニューを見る"]
                                    return state
                                else:
                                    logger.warning("[Sushi] 全寿司メニュー検索結果なし")
                            except Exception as e:
                                logger.error(f"全寿司メニュー検索エラー: {e}")
                        else:
                            logger.warning("[Sushi] メニューDB IDが設定されていません")
                    else:
                        logger.warning("[Sushi] 設定が読み込まれていません")
                except Exception as e:
                    logger.error(f"[Sushi] MenuService検索エラー: {e}")
            
            # フォールバック
            state["response"] = "🍣 寿司メニューをお選びください。"
            state["options"] = ["お好み寿司", "盛り合わせ", "メニューを見る"]
            return state
        
        # 「サラダ」タブが選択された場合、サブカテゴリー「サラダ」のメニューを表示
        if selected_option == "サラダ":
            logger.info(f"[Salad] サラダタブ選択: '{selected_option}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # Notionからサブカテゴリー「サラダ」のメニューのみを取得
                        pages = self.notion_client.get_all_pages(menu_db_id)
                        salad_items = []
                        
                        logger.info(f"[Salad] 全ページ数: {len(pages)}件")
                        
                        for page in pages:
                            name = self.notion_client._extract_property_value(page, "Name")
                            subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                            category = self.notion_client._extract_property_value(page, "Category")
                            
                            # デバッグ情報を出力
                            if name and ("サラダ" in str(subcategory) or "サラダ" in str(category) or "サラダ" in str(name)):
                                logger.info(f"[Salad] 候補ページ: {name}, Subcategory={subcategory}, Category={category}")
                            
                            # より柔軟な検索条件
                            if name and (
                                subcategory == "サラダ" or 
                                (isinstance(subcategory, list) and "サラダ" in subcategory) or
                                "サラダ" in str(name) or
                                (category and "サラダ" in str(category))
                            ):
                                price = self.notion_client._extract_property_value(page, "Price")
                                one_liner = self.notion_client._extract_property_value(page, "一言紹介")
                                salad_items.append({
                                    "name": name,
                                    "price": price,
                                    "one_liner": one_liner
                                })
                                logger.info(f"[Salad] サラダアイテム追加: {name}")
                        
                        logger.info(f"[Salad] サラダアイテム数: {len(salad_items)}件")
                        
                        # 結果をフォーマット
                        if salad_items:
                            menu_lines = []
                            for item in salad_items:
                                line = f"- {item['name']}"
                                if item['price'] and item['price'] > 0:
                                    line += f" ｜ {item['price']}円"
                                if item['one_liner']:
                                    line += f"\n  {item['one_liner']}"
                                menu_lines.append(line)
                            menu_result = "\n".join(menu_lines)
                        else:
                            menu_result = ""
                            
                        if menu_result:
                            state["response"] = f"🥗 **サラダメニュー**\n\n{menu_result}\n\nサラダは新鮮な野菜を使った自慢の一品です。どれがお好みでしょうか？"
                            state["options"] = ["逸品料理", "おすすめ定食はこちら", "メニューを見る"]
                            return state
                        else:
                            logger.warning("[Salad] サラダメニューが見つかりません")
                except Exception as e:
                    logger.error(f"サラダメニュー検索エラー: {e}")
            
            # フォールバック - サラダメニューが見つからない場合の代替案
            state["response"] = "🥗 申し訳ございません。現在サラダメニューの詳細を準備中です。\n\n代わりに逸品料理や定食メニューはいかがでしょうか？"
            state["options"] = ["逸品料理", "おすすめ定食はこちら", "メニューを見る"]
            return state
        
        # 「刺身単品」タブが選択された場合、サブカテゴリー「海鮮刺身」の会話ノードを表示
        if selected_option == "刺身単品":
            logger.info(f"[Sashimi] 刺身単品タブ選択: '{selected_option}'")
            if self.conversation_system:
                try:
                    # サブカテゴリー「海鮮刺身」の会話ノードを検索
                    conversation_nodes = self.conversation_system.get_conversation_nodes()
                    sashimi_nodes = []
                    
                    for node_id, node_data in conversation_nodes.items():
                        subcategory = node_data.get("subcategory", "")
                        node_name = node_data.get("name", "")
                        
                        # サブカテゴリー「海鮮刺身」のノードを検索
                        if subcategory == "海鮮刺身":
                            sashimi_nodes.append(node_data)
                            logger.info(f"[Sashimi] 海鮮刺身ノード発見: {node_id} ({node_name})")
                    
                    if sashimi_nodes:
                        # 最初のノード（または優先度が高いノード）を表示
                        target_node = sashimi_nodes[0]
                        if len(sashimi_nodes) > 1:
                            # 優先度でソート
                            sashimi_nodes.sort(key=lambda x: x.get("priority", 999))
                            target_node = sashimi_nodes[0]
                        
                        template = target_node.get("template", "")
                        next_nodes = target_node.get("next", [])
                        
                        # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                        response_text = template
                        
                        # 海鮮系ノードのテキスト装飾
                        response_text = self._add_seafood_text_decorations(response_text, target_node)
                        
                        # 選択肢を構築
                        options = []
                        for next_node_id in next_nodes:
                            next_node = self.conversation_system.get_node_by_id(next_node_id)
                            if next_node:
                                options.append(next_node.get("name", next_node_id))
                        
                        state["response"] = response_text
                        state["options"] = options if options else ["おすすめメニューはこちら", "メニューを見る"]
                        logger.info(f"[Sashimi] 海鮮刺身ノード表示: {len(options)}件の選択肢")
                        return state
                    else:
                        logger.warning("[Sashimi] サブカテゴリー「海鮮刺身」の会話ノードが見つかりません")
                except Exception as e:
                    logger.error(f"[Sashimi] 海鮮刺身ノード検索エラー: {e}")
                    import traceback
                    logger.error(f"トレースバック: {traceback.format_exc()}")
            
            # フォールバック: 会話ノードが見つからない場合はメニューを直接検索
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="海鮮刺身",
                            limit=10
                        )
                        
                        if menus:
                            response_text = "🐟 **刺身単品メニュー**\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = ["おすすめメニューはこちら", "メニューを見る"]
                            return state
                except Exception as e:
                    logger.error(f"刺身メニュー取得エラー: {e}")
            
            # 最終フォールバック
            state["response"] = "🐟 刺身単品メニューをご案内いたします。"
            state["options"] = ["おすすめメニューはこちら", "メニューを見る"]
            return state
        
        # ここには到達しない（コースタブは最初に処理される）
        
        # その他の宴会ノードのボタンクリック処理
        if self.conversation_system:
            try:
                conversation_nodes = self.conversation_system.get_conversation_nodes()
                for node_id, node_data in conversation_nodes.items():
                    node_name = node_data.get("name", "")
                    # 宴会関連のノードIDかチェック
                    if node_id.startswith("banquet_") or "banquet" in node_id.lower():
                        # ボタンラベル（ノード名）と一致した場合
                        if selected_option == node_name:
                            logger.info(f"[Banquet] 宴会ノード選択: {node_id} ({node_name})")
                            # コンテキストにノードIDを保存
                            if "context" not in state:
                                state["context"] = {}
                            state["context"]["banquet_node_id"] = node_id
                            # banquet_flowに再ルーティング
                            # ただし、option_click内なので直接処理
                            template = node_data.get("template", "")
                            next_nodes = node_data.get("next", [])
                            
                            if not template or not template.strip():
                                response_text = f"{node_name}\n\n詳細はスタッフまでお問い合わせください。"
                            else:
                                # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                                response_text = template
                            
                            # 遷移先からボタンを自動生成（高速化）
                            options = []
                            for next_node_ref in next_nodes:
                                # ページIDまたはノードIDの可能性がある
                                next_node = None
                                
                                # まずページIDとして試す
                                if hasattr(self.conversation_system, 'get_node_by_page_id'):
                                    next_node = self.conversation_system.get_node_by_page_id(next_node_ref)
                                
                                # ページIDで見つからない場合、ノードIDとして試す
                                if not next_node:
                                    next_node = self.conversation_system.get_node_by_id(next_node_ref)
                                
                                if next_node:
                                    options.append(next_node.get("name", next_node_ref))
                            
                            state["response"] = response_text
                            state["options"] = options if options else ["メニューを見る"]
                            return state
            except Exception as e:
                logger.error(f"[Banquet] 宴会ノード検索エラー: {e}")
        
        # 「逸品料理」タブが選択された場合、サブカテゴリー「逸品料理」のメニューを表示
        if selected_option == "逸品料理":
            logger.info(f"[Special] 逸品料理タブ選択: '{selected_option}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # Notionからサブカテゴリー「逸品料理」のメニューのみを取得
                        pages = self.notion_client.get_all_pages(menu_db_id)
                        special_items = []
                        
                        for page in pages:
                            name = self.notion_client._extract_property_value(page, "Name")
                            subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                            
                            if name and subcategory == "逸品料理":
                                price = self.notion_client._extract_property_value(page, "Price")
                                special_items.append({
                                    "name": name,
                                    "price": price
                                })
                        
                        # 結果をフォーマット
                        if special_items:
                            menu_lines = []
                            for item in special_items:
                                line = f"- {item['name']}"
                                if item['price'] and item['price'] > 0:
                                    line += f" ｜ {item['price']}円"
                                menu_lines.append(line)
                            menu_result = "\n".join(menu_lines)
                        else:
                            menu_result = ""
                            
                        if menu_result:
                            state["response"] = f"🍽️ **逸品料理メニュー**\n\n{menu_result}"
                            state["options"] = ["サラダ", "おすすめ定食はこちら", "メニューを見る"]
                            return state
                        else:
                            logger.warning("[Special] 逸品料理メニューが見つかりません")
                except Exception as e:
                    logger.error(f"逸品料理メニュー検索エラー: {e}")
            
            # フォールバック
            state["response"] = "🍽️ 逸品料理メニューをお選びください。"
            state["options"] = ["サラダ", "おすすめ定食はこちら", "メニューを見る"]
            return state
        
        # 「お好み寿司」の処理
        if selected_option == "お好み寿司":
            logger.info("[Sushi] お好み寿司選択（option_click）")
            # MenuServiceを使用して寿司メニューを検索
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # Notionからサブカテゴリー「寿司」のメニューのみを取得
                        pages = self.notion_client.get_all_pages(menu_db_id)
                        sushi_items = []
                        
                        for page in pages:
                            name = self.notion_client._extract_property_value(page, "Name")
                            subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                            
                            if name and subcategory == "寿司":
                                price = self.notion_client._extract_property_value(page, "Price")
                                sushi_items.append({
                                    "name": name,
                                    "price": price
                                })
                        
                        # 結果をフォーマット
                        if sushi_items:
                            menu_lines = []
                            for item in sushi_items:
                                line = f"- {item['name']}"
                                if item['price'] and item['price'] > 0:
                                    line += f" ｜ {item['price']}円"
                                menu_lines.append(line)
                            menu_result = "\n".join(menu_lines)
                            
                            state["response"] = f"お好み寿司をお選びください。\n\n{menu_result}"
                            state["options"] = ["盛り合わせ", "メニューを見る"]
                            return state
                        else:
                            logger.warning("[Sushi] サブカテゴリー「寿司」のメニューが見つかりません")
                except Exception as e:
                    logger.error(f"[Sushi] お好み寿司検索エラー: {e}")
            
            # フォールバック
            state["response"] = "お好み寿司をお選びください。"
            state["options"] = ["盛り合わせ", "メニューを見る"]
            return state
        
        # 「盛り合わせ」の処理
        elif selected_option == "盛り合わせ":
            logger.info("[Sushi] 盛り合わせ選択（option_click）")
            # 盛り合わせメニューを表示
            state["response"] = "盛り合わせをお選びください。"
            state["options"] = ["おまかせ6貫寿司", "おまかせ10貫寿司", "うにいくら入り12貫盛り", "お好み寿司"]
            return state
        
        # 一般的なナビゲーションボタンの処理
        if selected_option == "メニューを見る":
            state["response"] = "メニューをご案内しますね。どのカテゴリをご覧になりますか？"
            state["options"] = [
                "ランチ",
                "夜メニュー",
                "おすすめを教えて",
                "お酒に合うつまみ"
            ]
            return state
        
        elif selected_option == "おすすめを教えて":
            # コンテキストを確認
            context = self._update_time_context(state)
            time_zone = context.get("time_zone", "other")
            
            if time_zone == "lunch":
                state["response"] = "本日のおすすめランチです。"
                state["options"] = [
                    "日替わりランチはこちら",
                    "寿司ランチはこちら", 
                    "おすすめ定食はこちら"
                ]
            elif time_zone == "dinner":
                state["response"] = "本日のおすすめです。"
                state["options"] = [
                    "今晩のおすすめ一品はこちら",
                    "おすすめ定食はこちら",
                    "海鮮刺身はこちら"
                ]
            else:
                state["response"] = "おすすめメニューです。"
                state["options"] = [
                    "おすすめ定食はこちら",
                    "今晩のおすすめ一品はこちら",
                    "海鮮刺身はこちら"
                ]
            return state
        
        elif selected_option == "お酒に合うつまみ":
            state["response"] = "🍶 つまみメニューです。"
            state["options"] = [
                "酒のつまみはこちら",
                "焼き鳥はこちら",
                "海鮮刺身はこちら",
                "逸品料理はこちら"
            ]
            return state
        
        elif selected_option == "ドリンクメニュー":
            # ドリンクメニューを表示
            state["response"] = "🍶 ドリンクメニューです。"
            state["options"] = [
                "ビール",
                "日本酒",
                "焼酎グラス",
                "ボトル焼酎",
                "酎ハイ",
                "ハイボール",
                "梅酒・果実酒",
                "ソフトドリンク"
            ]
            return state
        
        # 全ドリンクカテゴリーの個別処理
        elif selected_option in ["ビール", "日本酒", "焼酎グラス", "ボトル焼酎", "酎ハイ", "ハイボール", "梅酒・果実酒", "ソフトドリンク"]:
            # Notionからドリンクメニューを取得
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # カテゴリに応じてメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value=selected_option,
                            limit=20
                        )
                        
                        if menus:
                            # ドリンク名に応じた絵文字
                            emoji_map = {
                                "ビール": "🍺",
                                "日本酒": "🍶",
                                "焼酎グラス": "🥃",
                                "ボトル焼酎": "🍾",
                                "酎ハイ": "🍹",
                                "ハイボール": "🥃",
                                "梅酒・果実酒": "🍇",
                                "ソフトドリンク": "🥤"
                            }
                            emoji = emoji_map.get(selected_option, "🍶")
                            response_text = f"{emoji} **{selected_option}**\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = []
                        else:
                            state["response"] = f"申し訳ございません。{selected_option}は現在準備中です。"
                            state["options"] = ["ドリンクメニュー"]
                except Exception as e:
                    logger.error(f"{selected_option}取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["ドリンクメニュー"]
            else:
                state["response"] = f"{selected_option}もございます。"
                state["options"] = ["ドリンクメニュー"]
            
            return state
        
        elif selected_option == "せんべろセット":
            # せんべろセットを表示
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # せんべろセットのメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="せんべろセット",
                            limit=10
                        )
                        
                        if menus:
                            response_text = "🍶 **せんべろセット**\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = []
                        else:
                            state["response"] = "申し訳ございません。せんべろセットは現在準備中です。"
                            state["options"] = ["ドリンクメニュー", "夜メニュー"]
                except Exception as e:
                    logger.error(f"せんべろセット取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["ドリンクメニュー", "夜メニュー"]
            else:
                state["response"] = "せんべろセットもございます。"
                state["options"] = ["ドリンクメニュー", "夜メニュー"]
            
            return state
        
        # 新しい弁当選択肢処理
        elif selected_option in ["テイクアウト唐揚げ弁当", "テイクアウトまごころ弁当", "テイクアウト一品"]:
            # 新しい弁当カテゴリの処理
            logger.info(f"[弁当] {selected_option}カテゴリ選択")
            
            if selected_option == "テイクアウト唐揚げ弁当":
                state["response"] = "🍱 テイクアウト唐揚げ弁当をご案内いたします！"
                state["options"] = [
                    "鶏カツ弁当",
                    "唐揚げ弁当（標準）",
                    "自家製しゅうまい弁当"
                ]
            elif selected_option == "テイクアウトまごころ弁当":
                state["response"] = "🍱 テイクアウトまごころ弁当をご案内いたします！"
                state["options"] = [
                    "豚ニラ弁当",
                    "麻婆豆腐弁当",
                    "餃子弁当",
                    "豚唐揚げ弁当",
                    "酢豚弁当",
                    "生姜焼き肉弁当",
                    "フライ盛り弁当",
                    "タレ付き焼き肉弁当"
                ]
            elif selected_option == "テイクアウト一品":
                state["response"] = "🍱 テイクアウト一品をご案内いたします！"
                state["options"] = [
                    "白ごはん（並・大）",
                    "天ぷら盛合せ",
                    "焼餃子",
                    "海老天丼",
                    "タレ焼肉丼",
                    "酢豚"
                ]
            
            return state
        
        # 弁当関連の選択肢処理（既存）
        elif selected_option in ["弁当", "鶏カツ弁当", "唐揚げ弁当（並）", "唐揚げ弁当（大）", 
                               "唐揚げ弁当（小）", "唐揚げ弁当（特大）", "自家製しゅうまい弁当", 
                               "唐揚げ弁当（標準）", "まごころ弁当", "豚ニラ弁当", "麻婆豆腐弁当", 
                               "餃子弁当", "豚唐揚げ弁当", "酢豚弁当", "生姜焼き肉弁当", 
                               "フライ盛り弁当", "タレ付き焼き肉弁当", "並", "大", "小", "特大"]:
            
            # 弁当メニューを表示
            logger.info(f"[弁当] {selected_option}メニュー取得開始")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    logger.info(f"[弁当] データベースID: {menu_db_id}")
                    if menu_db_id:
                        # 弁当のメニューを取得
                        menus, show_more = self._get_menu_by_option(selected_option, menu_db_id)
                        logger.info(f"[弁当] {len(menus)}件のメニューを取得")
                        
                        if menus:
                            # 弁当の本文短文化
                            bento_descriptions = {
                                "鶏カツ弁当": "揚げたて鶏カツを自家製ソースで。",
                                "唐揚げ弁当（標準）": "サクッとジューシー。ご飯が進む定番です。",
                                "唐揚げ弁当（並）": "サクッとジューシー。定番サイズでバランス良く。",
                                "唐揚げ弁当（大）": "サクッとジューシー。ボリュームたっぷり。",
                                "唐揚げ弁当（小）": "サクッとジューシー。少なめでちょうど良く。",
                                "唐揚げ弁当（特大）": "サクッとジューシー。がっつり派におすすめ。",
                                "自家製しゅうまい弁当": "自家製しゅうまいを熱々で。"
                            }
                            
                            response_text = f"🍱 **{selected_option}**\n\n"
                            
                            # 弁当の短い説明文を表示
                            if selected_option in bento_descriptions:
                                response_text += f"{bento_descriptions[selected_option]}\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 海鮮系の場合、クイック訴求を追加
                            if any(kw in selected_option.lower() for kw in ["海鮮", "寿司", "刺身", "海鮮丼"]):
                                response_text += "\n💨 **ランチはすぐお出しできます**\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            
                            # 弁当詳細の場合、テイクアウト希望ボタンを追加
                            if selected_option in ["鶏カツ弁当", "唐揚げ弁当（並）", "唐揚げ弁当（大）", 
                                                 "唐揚げ弁当（小）", "唐揚げ弁当（特大）", "自家製しゅうまい弁当", 
                                                 "唐揚げ弁当（標準）", "豚ニラ弁当", "麻婆豆腐弁当", 
                                                 "餃子弁当", "豚唐揚げ弁当", "酢豚弁当", "生姜焼き肉弁当", 
                                                 "フライ盛り弁当", "タレ付き焼き肉弁当"]:
                                state["options"] = ["テイクアウト希望", "他のメニューを見る"]
                            elif selected_option == "弁当":
                                # menu_listノードの選択肢
                                state["options"] = [
                                    "鶏カツ弁当",
                                    "唐揚げ弁当（標準）",
                                    "自家製しゅうまい弁当",
                                    "まごころ弁当"
                                ]
                            elif selected_option in ["唐揚げ弁当（標準）"]:
                                # size_selectionノードの選択肢
                                state["options"] = [
                                    "並",
                                    "大", 
                                    "小",
                                    "特大"
                                ]
                            elif selected_option == "まごころ弁当":
                                # まごころ弁当の選択肢
                                state["options"] = [
                                    "豚ニラ弁当",
                                    "麻婆豆腐弁当",
                                    "餃子弁当",
                                    "豚唐揚げ弁当",
                                    "酢豚弁当",
                                    "生姜焼き肉弁当",
                                    "フライ盛り弁当",
                                    "タレ付き焼き肉弁当"
                                ]
                            else:
                                state["options"] = ["他のメニューを見る"]
                        else:
                            state["response"] = f"申し訳ございません。{selected_option}は現在準備中です。"
                            state["options"] = ["弁当", "ドリンクメニュー"]
                except Exception as e:
                    logger.error(f"{selected_option}取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["弁当", "ドリンクメニュー"]
            else:
                state["response"] = f"{selected_option}もございます。"
                state["options"] = ["弁当", "ドリンクメニュー"]
            
            return state
        
        elif selected_option == "basashi_akami":
            # 馬刺し赤身ノードの処理
            logger.info("[馬刺し赤身] 馬刺し赤身ノード選択")
            
            # 会話ノードシステムから馬刺し赤身ノードを取得
            if self.conversation_system:
                try:
                    node_data = self.conversation_system.get_node_by_id("basashi_akami")
                    if node_data:
                        template = node_data.get("template", "")
                        next_nodes = node_data.get("next", [])
                        
                        # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                        response_text = template
                        
                        # クロスセール文言を追加
                        response_text = self._add_cross_sell_text(response_text, "basashi_akami")
                        
                        # 選択肢を構築
                        options = []
                        for next_node_id in next_nodes:
                            next_node = self.conversation_system.get_node_by_id(next_node_id)
                            if next_node:
                                options.append(next_node.get("name", next_node_id))
                        
                        # 横断導線を追加
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                        
                        state["response"] = response_text
                        state["options"] = options
                        return state
                except Exception as e:
                    logger.error(f"会話ノード取得エラー: {e}")
            
            # フォールバック: メニューDBから取得
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # 馬刺し赤身のメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="馬刺し赤身",
                            limit=1
                        )
                        
                        if menus:
                            menu = menus[0]
                            name = menu.get("name", "馬刺し赤身")
                            price = menu.get("price", 0)
                            short_desc = menu.get("short_desc", "")
                            description = menu.get("description", "")
                            
                            response_text = f"🐎 **{name}**"
                            if price > 0:
                                response_text += f" ¥{price:,}"
                            response_text += "\n\n"
                            
                            if short_desc:
                                response_text += f"💬 {short_desc}\n\n"
                            
                            if description:
                                response_text += f"{description}\n\n"
                            
                            response_text += "熊本県直送の新鮮な馬刺し赤身です。\nお酒のつまみにもぴったりですよ。"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = ["他のメニューを見る", "お酒に合うつまみ"]
                        else:
                            state["response"] = "申し訳ございません。馬刺し赤身は現在準備中です。"
                            state["options"] = ["他のメニューを見る"]
                except Exception as e:
                    logger.error(f"馬刺し赤身取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["他のメニューを見る"]
            else:
                state["response"] = "馬刺し赤身もございます。"
                state["options"] = ["他のメニューを見る"]
            
            return state
        
        elif selected_option == "テイクアウト希望":
            # テイクアウト希望の処理（takeout_flowへの導線）
            state["response"] = "テイクアウトをご希望ですね！\n\nテイクアウトのご注文についてご案内いたします。"
            state["options"] = ["注文手順を確認", "テイクアウトメニューを見る", "電話で注文"]
            # takeout_flowへの遷移を設定（Notionの指示書に基づく）
            state["context"] = state.get("context", {})
            state["context"]["takeout_flow"] = True
            return state
        
        elif selected_option == "テイクアウト":
            # テイクアウトメニューを表示
            logger.info("[テイクアウト] テイクアウトメニュー取得開始")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    logger.info(f"[テイクアウト] データベースID: {menu_db_id}")
                    if menu_db_id:
                        # 指定された順序でカテゴリーからメニューを取得
                        # 1. テイクアウトまごころ弁当（上位8品）
                        # 2. テイクアウト唐揚げ（全件）
                        # 3. テイクアウト一品（全件）
                        
                        response_text = "🏪 **テイクアウトメニュー**\n\n"
                        total_count = 0
                        
                        # 1. テイクアウトまごころ弁当（上位8品）
                        logger.info(f"[テイクアウト] カテゴリー取得中: テイクアウトまごころ弁当")
                        magokoro_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="テイクアウトまごころ弁当",
                            limit=8
                        )
                        logger.info(f"[テイクアウト] テイクアウトまごころ弁当 から {len(magokoro_menus)}件取得")
                        
                        if magokoro_menus:
                            for menu in magokoro_menus:
                                name = menu.get("name", "")
                                price = menu.get("price") or 0
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                response_text += f"• **{name}**"
                                if price and price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                                total_count += 1
                        
                        # 2. テイクアウト唐揚げ（全件）
                        logger.info(f"[テイクアウト] カテゴリー取得中: テイクアウト唐揚げ")
                        karaage_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="テイクアウト唐揚げ",
                            limit=50
                        )
                        logger.info(f"[テイクアウト] テイクアウト唐揚げ から {len(karaage_menus)}件取得")
                        
                        if karaage_menus:
                            for menu in karaage_menus:
                                name = menu.get("name", "")
                                price = menu.get("price") or 0
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                response_text += f"• **{name}**"
                                if price and price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                                total_count += 1
                        
                        # 3. テイクアウト一品（全件）
                        logger.info(f"[テイクアウト] カテゴリー取得中: テイクアウト一品")
                        ichipin_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="テイクアウト一品",
                            limit=50
                        )
                        logger.info(f"[テイクアウト] テイクアウト一品 から {len(ichipin_menus)}件取得")
                        
                        if ichipin_menus:
                            for menu in ichipin_menus:
                                name = menu.get("name", "")
                                price = menu.get("price") or 0
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                response_text += f"• **{name}**"
                                if price and price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                                total_count += 1
                        
                        logger.info(f"[テイクアウト] 合計 {total_count}件のメニューを取得")
                        
                        if total_count > 0:
                            # テイクアウト専用の注文案内を追加
                            response_text += "\nご注文はスタッフにお伝えください。"
                            state["response"] = response_text
                            state["options"] = []
                        else:
                            state["response"] = "申し訳ございません。テイクアウトメニューは現在準備中です。"
                            state["options"] = ["メニューを見る"]
                except Exception as e:
                    logger.error(f"テイクアウト取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["メニューを見る"]
            else:
                state["response"] = "テイクアウトメニューもございます。"
                state["options"] = ["メニューを見る"]
            
            return state
        
        elif selected_option == "逸品料理":
            # 逸品料理を提案
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # 逸品料理のメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="逸品料理",
                            limit=6
                        )
                        
                        if menus:
                            response_text = "🍽️ **逸品料理**\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = []
                        else:
                            state["response"] = "申し訳ございません。逸品料理メニューを準備中です。"
                            state["options"] = ["サラダ", "メニューを見る"]
                except Exception as e:
                    logger.error(f"一品料理取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["メニューを見る"]
            else:
                state["response"] = "一品料理もございます。"
                state["options"] = ["メニューを見る"]
            
            return state
        
        elif selected_option in ["天ぷら", "天ぷらメニュー確認"]:
            # 天ぷらメニューを提案
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # 天ぷら関連のメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="市場の天ぷら",
                            limit=8
                        )
                        
                        if menus:
                            response_text = "🍤 **天ぷらメニュー**\n\n"
                            response_text += "市場の天ぷらメニューをご案内いたします。野菜、海鮮、かき揚げなど豊富にご用意しております。\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 天ぷら盛り合わせの推奨を追加
                            response_text += "🌟 **おすすめ**: いろいろ少しずつ楽しめる『天ぷら盛り合せ』もございます。\n\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = [
                                "今晩のおすすめ一品 確認",
                                "揚げ物・酒つまみ 確認"
                            ]
                        else:
                            state["response"] = "申し訳ございません。天ぷらメニューを準備中です。"
                            state["options"] = ["逸品料理", "メニューを見る"]
                except Exception as e:
                    logger.error(f"天ぷらメニュー取得エラー: {e}")
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["メニューを見る"]
            else:
                state["response"] = "天ぷらメニューもございます。"
                state["options"] = ["メニューを見る"]
            
            return state
        
        elif selected_option == "ランチメニュー":
            state["response"] = "ランチメニューはこちらです。どれがよろしいですか？"
            state["options"] = [
                "日替わりランチはこちら",
                "寿司ランチはこちら",
                "おすすめ定食はこちら"
            ]
            return state
        
        elif selected_option == "夜の定食":
            state["response"] = "夜の定食メニューはこちらです。"
            state["options"] = [
                "おすすめ定食はこちら",
                "海鮮定食はこちら",
                "定食屋メニューはこちら"
            ]
            return state
        
        # 特別な処理：「ランチ」「夜メニュー」をクリックした場合
        if selected_option == "ランチ":
            # コンテキストを再収集（時間帯判定を最新にする）
            context = self._update_time_context(state)
            time_zone = context.get("time_zone", "other")
            
            if time_zone == "lunch":
                state["response"] = "ランチメニューはこちらです。"
                state["options"] = [
                    "日替わりランチはこちら",
                    "寿司ランチはこちら", 
                    "おすすめ定食はこちら",
                    "土曜日のおすすめはこちら"
                ]
            else:
                state["response"] = "🍽️ お食事メニューをご覧いただけます。"
                state["options"] = [
                    "日替わりランチはこちら",
                    "おすすめ定食はこちら",
                    "海鮮定食はこちら",
                    "寿司ランチはこちら",
                    "定食屋メニューはこちら"
                ]
            return state
        
        elif selected_option == "夜メニュー":
            state["response"] = "🍽️ 夜はおすすめ定食、海鮮定食、季節の焼き魚定食などがございます。\n\n🥗 サラダ・一品料理も豊富にご用意しております。"
            state["options"] = [
                "おすすめ定食はこちら",
                "海鮮定食はこちら",
                "サラダ",
                "逸品料理はこちら",
                "今晩のおすすめ一品はこちら"
            ]
            return state
        
        elif selected_option == "静岡名物料理フェア":
            logger.info("[ShizuokaFair] option_click: 静岡名物料理フェア（固定文）")
            response_text = """🏔️ **静岡名物料理フェア**
駿河湾の恵みと地元の味をお楽しみください！

🐟 **生シラス** ¥580
ぷちぷち食感、鮮度が命。駿河湾直送の透き通る旨み。

🦐 **桜えびかき揚げ** ¥640
サクッと香ばしい、駿河湾だけの希少な桜えび。

🦐 **桜えび焼きそば** ¥880
桜えびの香りが広がる、静岡ならではの一皿。

🥟 **大月餃子** ¥420
当店自慢の手作り餃子。ビールとの相性抜群！

🐟 **黒はんぺんフライ** ¥580
静岡名物の黒はんぺんをカリッと揚げました。

🐟 **焼きはんぺん** ¥180
シンプルだからこそ旨い。香ばしい焼き目が食欲をそそります。

👉 まずは **生シラス** と **桜えびかき揚げ** のセットがおすすめ！"""
            state["response"] = self._add_order_instruction(response_text)
            state["options"] = [
                "今晩のおすすめ一品 確認",
                "揚げ物・酒つまみ 確認",
                "天ぷらメニュー確認",
            ]
            return state
        
        # 会話ノードシステムからノードを検索
        if self.conversation_system:
            try:
                # 「（続きを見る）」「おすすめ定食の続き」「おすすめ定食はこちら」を含む選択肢の場合は通常の検索をスキップ
                skip_node_search = False
                selected_option_clean = selected_option.strip() if selected_option else ""
                if "（続きを見る）" in selected_option_clean or selected_option_clean == "おすすめ定食の続き" or selected_option_clean == "おすすめ定食はこちら":
                    logger.info(f"[選択肢] 続きを見る選択肢のため通常検索をスキップ: '{selected_option}'")
                    skip_node_search = True
                
                if not skip_node_search:
                    # Notion DBから全ノードを取得
                    conversation_nodes = self.conversation_system.get_conversation_nodes()
                    logger.info(f"[選択肢] 検索開始: '{selected_option}'")
                    logger.info(f"[選択肢] 全ノード数: {len(conversation_nodes)}")
                    
                    # デバッグ: 最初の10件のノードIDとノード名を表示
                    for i, (node_id, node_data) in enumerate(list(conversation_nodes.items())[:10]):
                        node_name = node_data.get("name", "")
                        keywords = node_data.get("keywords", [])
                        logger.info(f"[選択肢デバッグ] ノード{i+1}: ID='{node_id}', Name='{node_name}', Keywords={keywords}")
                    
                    matched_node = None
                    
                    # ノード名、ノードID、キーワードで柔軟にマッチング
                    for node_id, node_data in conversation_nodes.items():
                        node_name = node_data.get("name", "")
                        keywords = node_data.get("keywords", [])
                        
                        # マッチング条件（優先順）
                        # 1. 選択肢テキストとノード名が完全一致
                        # 2. 選択肢テキストとノードIDが完全一致
                        # 3. 選択肢テキストがキーワードに含まれる
                        # 4. 選択肢テキストから接尾辞（「はこちら」「を確認」など）を除去してノード名と部分一致
                        # 5. ノード名やキーワードが選択肢テキストに含まれる（部分一致）
                        if selected_option == node_name or selected_option == node_id:
                            matched_node = node_data
                            logger.info(f"✅ [選択肢] 完全一致: {node_name} (ID: {node_id})")
                            break
                        elif keywords and selected_option in keywords:
                            matched_node = node_data
                            logger.info(f"✅ [選択肢] キーワード一致: {node_name} (ID: {node_id}), Keyword: {selected_option}")
                            break
                        else:
                            # 接尾辞を除去してマッチング
                            cleaned_option = selected_option.replace("はこちら", "").replace("を確認", "").replace("を見る", "").strip()
                            if cleaned_option and (cleaned_option in node_name or node_name in cleaned_option):
                                matched_node = node_data
                                logger.info(f"✅ [選択肢] 部分一致（接尾辞除去後）: {node_name} (ID: {node_id}), 選択肢: '{selected_option}' → '{cleaned_option}'")
                                break
                            # ノード名やキーワードが選択肢に含まれるかチェック
                            elif node_name and node_name in selected_option:
                                matched_node = node_data
                                logger.info(f"✅ [選択肢] ノード名部分一致: {node_name} (ID: {node_id})")
                                break
                            elif keywords:
                                for keyword in keywords:
                                    if keyword and keyword in selected_option:
                                        matched_node = node_data
                                        logger.info(f"✅ [選択肢] キーワード部分一致: {node_name} (ID: {node_id}), Keyword: '{keyword}'")
                                        break
                                if matched_node:
                                    break
                
                if not matched_node:
                    logger.warning(f"[選択肢] 会話ノードが見つかりません: '{selected_option}'")
                    # 会話ノードが見つからない場合でも、_get_menu_by_optionのマッピングに存在する場合は
                    # メニューDB検索処理に進む（早期リターンしない）
                    # ここでは何もせず、後続のメニューDB検索処理に進む
                
                if matched_node:
                    template = matched_node.get("template", "")
                    if not template or not template.strip():
                        template = matched_node.get("一言紹介", "") or matched_node.get("詳細説明", "")
                    next_nodes = matched_node.get("next", [])
                    category = matched_node.get("category", "")
                    subcategory = matched_node.get("subcategory", "")
                    
                    # {{STORE_HOURS}}を営業時間に置き換え
                    if "{{STORE_HOURS}}" in template or "STORE_HOURS" in template:
                        try:
                            from core.store_info_service import StoreInfoService
                            
                            store_db_id = self.config.get("notion.database_ids.store_db")
                            if self.notion_client and store_db_id:
                                store_service = StoreInfoService(self.notion_client, store_db_id)
                                
                                # 現在有効な営業時間を取得
                                current_hours = store_service.get_current_business_hours()
                                
                                # 特別営業期間かチェック
                                if store_service.is_special_period():
                                    hours_text = f"{current_hours}\n\n※現在、特別営業時間で営業しております"
                                else:
                                    hours_text = current_hours
                                
                                # テンプレートを置き換え
                                template = template.replace("{{STORE_HOURS}}", hours_text)
                                template = template.replace("STORE_HOURS", hours_text)
                                logger.info(f"[StoreHours] 営業時間を置き換えました")
                        except Exception as e:
                            logger.error(f"[StoreHours] 営業時間取得エラー: {e}")
                            template = template.replace("{{STORE_HOURS}}", "営業時間については店舗にお問い合わせください")
                            template = template.replace("STORE_HOURS", "営業時間については店舗にお問い合わせください")
                    
                    # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                    response_text = template
                    
                    # 定食屋メニューの本文整形フック
                    response_text = self._normalize_teishoku_text(response_text, matched_node)
                    
                    # 推しトーンの適用
                    response_text = self._apply_recommended_tone(response_text, matched_node)
                    
                    # 海鮮系ノードのテキスト装飾（馬刺し横断と天ぷら推奨）
                    if subcategory in ["海鮮刺身", "海鮮定食メニュー", "刺身・盛り合わせ"]:
                        response_text = self._add_seafood_text_decorations(response_text, matched_node)
                    
                    # おすすめ定食トップのテキスト装飾
                    if subcategory == "おすすめ定食":
                        response_text = self._add_recommended_teishoku_text_decorations(response_text, matched_node)
                    
                    # クロスセール文言を追加（対象ノードの場合）
                    if self._should_add_cross_sell_text_for_node(matched_node):
                        response_text = self._add_cross_sell_text(response_text, matched_node.get("id"))
                    
                    # 選択肢を構築
                    options = []
                    for next_node_id in next_nodes:
                        next_node = self.conversation_system.get_node_by_id(next_node_id)
                        if next_node:
                            options.append(next_node.get("name", next_node_id))
                    
                    # 横断導線を追加
                    if subcategory == "今晩のおすすめ一品":
                        options.extend(["揚げ物・酒つまみ 確認", "焼き鳥メニュー確認", "天ぷらメニュー確認"])
                        # 推し3品の推薦文を追加
                        response_text = self._add_recommended_3_items(response_text)
                    elif subcategory == "揚げ物・酒のつまみ":
                        options.extend(["今晩のおすすめ一品 確認", "焼き鳥メニュー確認", "天ぷらメニュー確認"])
                    elif subcategory == "定食":
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                        # 定食屋メニューの看板4品をピン留め
                        options = self._add_pinned_teishoku_items(options, matched_node)
                    elif subcategory in ["海鮮刺身", "刺身・盛り合わせ"]:
                        # 刺身詳細に天ぷら、揚げ物、馬刺し、確認系を追加
                        if "天ぷらメニュー確認" not in options:
                            options.insert(0, "天ぷらメニュー確認")
                        if "エビフライ" not in options and "aji_fry_2" not in options:
                            options.append("エビフライ")
                        if "aji_fry_2" not in options and "aji_fry_2" not in options:
                            options.append("アジフライ")
                        if "馬刺し赤身" not in options and "basashi_akami" not in options:
                            options.append("馬刺し赤身")
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                    elif subcategory == "海鮮定食メニュー":
                        # 海鮮定食メニューに馬刺しと確認系を追加
                        if "馬刺し赤身" not in options and "basashi_akami" not in options:
                            options.append("馬刺し赤身")
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                    elif subcategory == "おすすめ定食":
                        # おすすめ定食詳細に横断導線を追加
                        if "今晩のおすすめ一品 確認" not in options:
                            options.append("今晩のおすすめ一品 確認")
                        if "揚げ物・酒つまみ 確認" not in options:
                            options.append("揚げ物・酒つまみ 確認")
                        # 人気6選を固定したボタン並び替え
                        options = self._arrange_recommended_teishoku_buttons(options, matched_node)
                    
                    # 優先度でソート（おすすめ定食以外）
                    if subcategory != "おすすめ定食":
                        options = self._sort_options_by_priority(options)
                    
                    # ボタンの並び順を「推し→馬刺し赤身→確認系→近縁」で安定化（おすすめ定食以外）
                    if subcategory != "おすすめ定食":
                        options = self._arrange_buttons_by_priority(options, matched_node)
                    
                    state["response"] = response_text
                    state["options"] = options
                    return state
                    
            except Exception as e:
                logger.error(f"会話ノード検索エラー: {e}")
        
        if not self.notion_client or not self.config:
            state["response"] = f"申し訳ございません。{selected_option}の詳細情報を取得できませんでした。"
            state["options"] = []
            return state
        
        try:
            menu_db_id = self.config.get("notion.database_ids.menu_db")
            
            # 選択肢に応じてNotionからメニュー取得
            menu_details, show_more_button = self._get_menu_by_option(selected_option, menu_db_id)
            
            # 「ランチ」「夜メニュー」の場合は特別処理で選択肢のみ表示（メニューは表示しない）
            if selected_option in ["ランチ", "夜メニュー"]:
                # 既に選択肢は設定済みなので、そのまま返す
                return state
            
            if menu_details:
                response_text = f"🍽️ **{selected_option}**\n\n"
                
                for menu in menu_details:
                    name = menu.get("name", "メニュー名不明")
                    price = menu.get("price", 0)
                    short_desc = menu.get("short_desc", "")
                    description = menu.get("description", "")
                    
                    # メニュー名と価格（必ず表示）
                    response_text += f"• **{name}**"
                    if price > 0:
                        response_text += f" ¥{price:,}"
                    response_text += "\n"
                    
                    # 一言紹介を表示
                    if short_desc:
                        response_text += f"  💬 {short_desc}\n"
                    
                    # 詳細説明を全文表示（一言紹介がある場合も表示）
                    if description:
                        # 詳細説明を全文表示（改行を保持）
                        response_text += f"  {description}\n"
                    
                    response_text += "\n"
                
                # 注文案内を追加
                state["response"] = self._add_order_instruction(response_text)
                
                # その他ボタンの表示判定
                if show_more_button:
                    # 6件以上ある場合は「もっと見る」ボタンを表示
                    state["options"] = [f"{selected_option}（続きを見る）"]
                else:
                    state["options"] = []
                
                # 馬刺し赤身へのクロスセール文言を追加
                state["response"] = self._add_cross_sell_text(state["response"], selected_option)
                
                # 対象ノードの場合は馬刺し赤身ボタンを追加
                if self._should_add_basashi_button(selected_option):
                    # 既存の選択肢に馬刺し赤身ボタンを追加
                    if "options" not in state:
                        state["options"] = []
                    
                    # 馬刺し赤身ボタンを先頭に追加（強調表示）
                    basashi_button = {"label": "馬刺し赤身", "value": "basashi_akami", "style": "primary"}
                    state["options"].insert(0, basashi_button)
            else:
                state["response"] = f"申し訳ございません。{selected_option}のメニューが見つかりませんでした。"
                state["options"] = []
        
        except Exception as e:
            logger.error(f"選択肢処理エラー: {e}")
            state["response"] = f"申し訳ございません。エラーが発生しました。"
            state["options"] = []
        
        return state
    
    def general_response(self, state: State) -> State:
        """一般応答ノード（人間味のある会話対応・RAG統合）"""
        logger.info("[Node] general_response")
        
        last_message = state.get("messages", [])[-1] if state.get("messages") else ""
        if not isinstance(state.get("context"), dict):
            state["context"] = {}
        
        # 「おすすめ定食の続き」は除外（option_clickで処理）
        if last_message == "おすすめ定食の続き" or last_message == "おすすめ定食はこちら":
            # option_clickで処理されるため、ここでは何もしない
            pass
        # 「おすすめ定食は何ですか?」などの質問を検出（優先処理）
        elif any(kw in last_message for kw in ["おすすめ定食", "おすすめ定食は", "おすすめ定食は何", "おすすめ定食は何ですか", "おすすめ定食はなんですか"]):
            logger.info(f"[Teishoku] おすすめ定食質問検出: '{last_message}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # Notionからサブカテゴリー「おすすめ定食」のメニューを取得
                        all_menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="おすすめ定食",
                            limit=100,  # 全件取得
                            sort_by_priority=True
                        )
                        
                        logger.info(f"[Teishoku] おすすめ定食取得: {len(all_menus)}件")
                        
                        if all_menus:
                            # 上位5品を表示
                            top5_menus = all_menus[:5]
                            remaining_menus = all_menus[5:] if len(all_menus) > 5 else []
                            
                            # レスポンステキストを構築
                            response_lines = ["🍽️ **おすすめ定食**\n"]
                            for i, menu in enumerate(top5_menus, 1):
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                
                                price_text = ""
                                if isinstance(price, (int, float)) and price > 0:
                                    price_text = f" ｜ ¥{int(price):,}"
                                
                                response_lines.append(f"{i}. **{name}**{price_text}")
                                if short_desc:
                                    response_lines.append(f"   {short_desc}")
                                response_lines.append("")
                            
                            state["response"] = "\n".join(response_lines).strip()
                            
                            # 選択肢を構築
                            options = []
                            
                            # 残りのメニューがある場合は「おすすめ定食の続き」タブを追加
                            if remaining_menus:
                                # 残りのメニューをコンテキストに保存
                                state["context"]["recommended_teishoku_remaining"] = remaining_menus
                                options.append("おすすめ定食の続き")
                                logger.info(f"[Teishoku] 残りのおすすめ定食: {len(remaining_menus)}件、タブ追加: おすすめ定食の続き")
                            
                            # デフォルトの選択肢を追加
                            options.extend(["メニューを見る", "おすすめを教えて"])
                            
                            state["options"] = options
                            logger.info(f"[Teishoku] 最終オプション: {options}")
                            logger.info(f"[Teishoku] コンテキスト保存確認: recommended_teishoku_remaining={len(remaining_menus)}件")
                            return state
                        else:
                            logger.warning("[Teishoku] おすすめ定食が見つかりません")
                except Exception as e:
                    logger.error(f"[Teishoku] おすすめ定食取得エラー: {e}")
        
        # 寿司入力時の意図確認分岐（優先処理）
        sushi_keywords = ["寿司", "すし", "sushi"]
        omakase_keywords = ["おまかせ", "盛り合わせ", "6貫", "10貫", "12貫"]
        
        # 「お好み寿司」が選択された場合、MenuServiceで寿司メニューを検索（最優先）
        if "お好み寿司" in last_message:
            logger.info(f"[Sushi] お好み寿司選択: '{last_message}'")
            logger.info(f"[Sushi] 現在のノード: {state.get('current_step', 'unknown')}")
            # MenuServiceを使用して寿司メニューを検索
            if self.notion_client:
                try:
                    from core.menu_service import MenuService
                    menu_service = MenuService(self.notion_client)
                    
                    # サブカテゴリー「寿司」のメニューのみを直接検索
                    if self.config:
                        menu_db_id = self.config.get("notion.database_ids.menu_db")
                        if menu_db_id:
                            try:
                                # Notionからサブカテゴリー「寿司」のメニューのみを取得
                                pages = self.notion_client.get_all_pages(menu_db_id)
                                sushi_items = []
                                
                                for page in pages:
                                    name = self.notion_client._extract_property_value(page, "Name")
                                    subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                                    
                                    if name and subcategory == "寿司":
                                        price = self.notion_client._extract_property_value(page, "Price")
                                        sushi_items.append({
                                            "name": name,
                                            "price": price
                                        })
                                
                                # 結果をフォーマット
                                if sushi_items:
                                    menu_lines = []
                                    for item in sushi_items:
                                        line = f"- {item['name']}"
                                        if item['price'] and item['price'] > 0:
                                            line += f" ｜ {item['price']}円"
                                        menu_lines.append(line)
                                    menu_result = "\n".join(menu_lines)
                                else:
                                    menu_result = ""
                                    
                            except Exception as e:
                                logger.error(f"サブカテゴリー「寿司」検索エラー: {e}")
                                menu_result = ""
                        else:
                            menu_result = ""
                    else:
                        menu_result = ""
                    
                    if menu_result:
                        result_lines = menu_result.split('\n')
                        logger.info(f"[Sushi] MenuService検索成功: {len(result_lines)}件")
                        state["response"] = f"お好み寿司をお選びください。\n\n{menu_result}"
                        state["options"] = ["盛り合わせ", "メニューを見る"]
                        return state
                    else:
                        logger.warning("[Sushi] MenuService検索結果なし")
                except Exception as e:
                    logger.error(f"[Sushi] MenuService検索エラー: {e}")
            
            # フォールバック
            state["response"] = "お好み寿司をお選びください。"
            state["options"] = ["盛り合わせ", "メニューを見る"]
            return state
        
        # 「寿司」を含む入力の場合は、必ず先に寿司の意図確認を行う
        if any(kw in last_message for kw in sushi_keywords):
            logger.info(f"[Sushi] 寿司キーワード検出: '{last_message}'")
            # コンテキストチェック: すでに意図確認済みかどうか
            if "context" not in state:
                state["context"] = {}
            
            # おまかせ/盛り合わせのキーワードが含まれている場合は、すでに選択済みと判断
            if any(kw in last_message for kw in omakase_keywords):
                logger.info("[Sushi] おまかせキーワード検出、盛り合わせ処理に進む")
                # 盛り合わせの処理に進む（下で処理）
                pass
            elif not state["context"].get("sushi_intent_confirmed", False):
                logger.info("[Sushi] 初回寿司入力、意図確認を表示")
                # 初回の寿司入力時は意図確認
                state["response"] = "お好み寿司ですか？それとも盛り合わせですか？"
                state["options"] = ["寿司", "お好み寿司", "盛り合わせ"]
                state["context"]["sushi_intent_confirmed"] = True
                # return state を削除して、その後の処理に進む
            else:
                logger.info("[Sushi] 既に意図確認済み、通常の処理に進む")
        
        # 「天ぷら」を含む入力の場合、NotionDBから「市場の天ぷら」サブカテゴリーのメニューを表示（最優先処理）
        tempura_keywords = ["天ぷら", "てんぷら", "天麩羅", "tempura"]
        logger.info(f"[Tempura] チェック開始: last_message='{last_message}', キーワードリスト={tempura_keywords}")
        tempura_detected = any(kw in last_message for kw in tempura_keywords)
        logger.info(f"[Tempura] 検出結果: {tempura_detected}")
        
        if tempura_detected:
            logger.info(f"[Tempura] 天ぷらキーワード検出: '{last_message}'")
            if self.notion_client and self.config:
                try:
                    menu_db_id = self.config.get("notion.database_ids.menu_db")
                    if menu_db_id:
                        # 市場の天ぷらのメニューを取得
                        menus = self.notion_client.get_menu_details_by_category(
                            database_id=menu_db_id,
                            category_property="Subcategory",
                            category_value="市場の天ぷら",
                            limit=20  # 多めに取得
                        )
                        
                        if menus:
                            response_text = "🍤 **天ぷらメニュー**\n\n"
                            response_text += "市場の天ぷらメニューをご案内いたします。野菜、海鮮、かき揚げなど豊富にご用意しております。\n\n"
                            
                            for menu in menus:
                                name = menu.get("name", "")
                                price = menu.get("price", 0)
                                short_desc = menu.get("short_desc", "")
                                description = menu.get("description", "")
                                
                                # メニュー名と価格（必ず表示）
                                response_text += f"• **{name}**"
                                if price > 0:
                                    response_text += f" ¥{price:,}"
                                response_text += "\n"
                                
                                # 一言紹介を表示
                                if short_desc:
                                    response_text += f"  💬 {short_desc}\n"
                                
                                # 詳細説明を全文表示
                                if description:
                                    response_text += f"  {description}\n"
                                
                                response_text += "\n"
                            
                            # 天ぷら盛り合わせの推奨を追加
                            response_text += "🌟 **おすすめ**: いろいろ少しずつ楽しめる『天ぷら盛り合せ』もございます。\n\n"
                            
                            # 注文案内を追加
                            state["response"] = self._add_order_instruction(response_text)
                            state["options"] = [
                                "今晩のおすすめ一品 確認",
                                "揚げ物・酒つまみ 確認"
                            ]
                            return state
                        else:
                            logger.warning("[Tempura] 天ぷらメニューが見つかりません")
                except Exception as e:
                    logger.error(f"[Tempura] 天ぷらメニュー取得エラー: {e}")
                    import traceback
                    traceback.print_exc()
            
            # フォールバック
            state["response"] = "🍤 天ぷらメニューをご案内いたします。市場の天ぷらは野菜、海鮮、かき揚げなど豊富にご用意しております。"
            state["options"] = [
                "今晩のおすすめ一品 確認",
                "揚げ物・酒つまみ 確認"
            ]
            return state
        
        fried_keywords = ["揚げ物", "フライ", "唐揚げ", "からあげ", "カツ", "串カツ", "フリッター", "コロッケ", "エビフライ", "海老フライ"]
        fried_detected = any(kw in last_message for kw in fried_keywords)
        if fried_detected:
            logger.info(f"[Fried] 揚げ物キーワード検出: '{last_message}'")
            menus = self._fetch_fried_food_menus()
            response_text, remaining_items = self._format_fried_food_response(menus)
            response_text = self._add_order_instruction(response_text)
            if "context" not in state or state["context"] is None:
                state["context"] = {}
            options: List[str] = []
            if remaining_items:
                state["context"]["fried_food_remaining"] = remaining_items
                options.append("その他はこちらです")
            else:
                state["context"].pop("fried_food_remaining", None)
            options.extend(["今晩のおすすめ一品 確認", "焼き鳥メニュー確認", "天ぷらメニュー確認"])
            state["response"] = response_text
            state["options"] = options
            return state
        
        # 「盛り合わせ」が選択された場合、おまかせ寿司を優先表示
        if "盛り合わせ" in last_message or any(kw in last_message for kw in ["おまかせ6貫", "おまかせ10貫", "おまかせ12貫"]):
            logger.info("[Sushi] 盛り合わせ選択")
            logger.info(f"[Sushi] conversation_system exists: {self.conversation_system is not None}")
            
            # conversation_systemが利用できない場合は固定ボタンを表示
            if not self.conversation_system:
                logger.warning("[Sushi] conversation_systemが利用できません")
                
                # 具体的なメニュー名がクリックされた場合は、Notionから情報を取得
                if "おまかせ6貫寿司" in last_message or "おまかせ10貫寿司" in last_message or "うにいくら入り12貫盛り" in last_message:
                    logger.info(f"[Sushi] 具体的なメニュー選択: {last_message}")
                    # Notionからメニュー情報を取得して表示
                    if self.notion_client and self.config:
                        try:
                            menu_db_id = self.config.get("notion.database_ids.menu_db")
                            if menu_db_id:
                                # 全メニューを取得して名前で検索
                                pages = self.notion_client.get_all_pages(menu_db_id)
                                for page in pages:
                                    name = self.notion_client._extract_property_value(page, "Name")
                                    if name and last_message in name:
                                        logger.info(f"[Sushi] メニュー発見: {name}")
                                        price = self.notion_client._extract_property_value(page, "Price")
                                        description = self.notion_client._extract_property_value(page, "Description")
                                        
                                        response_text = f"**{name}**"
                                        if price and price > 0:
                                            response_text += f" ¥{price:,}"
                                        response_text += "\n\n"
                                        if description:
                                            response_text += description
                                        
                                        state["response"] = response_text
                                        state["options"] = ["盛り合わせ", "お好み寿司", "メニューを見る"]
                                        return state
                                
                                logger.warning(f"[Sushi] メニューが見つかりません: {last_message}")
                        except Exception as e:
                            logger.error(f"Notionメニュー取得エラー: {e}")
                
                # 通常の場合は固定ボタンを表示
                state["response"] = "盛り合わせをお選びください。"
                state["options"] = ["おまかせ6貫寿司", "おまかせ10貫寿司", "うにいくら入り12貫盛り"]
                return state
            
            if self.conversation_system:
                try:
                    # おまかせ寿司ノードを検索
                    conversation_nodes = self.conversation_system.get_conversation_nodes()
                    logger.info(f"[Sushi] 全ノード数: {len(conversation_nodes)}")
                    omakase_nodes = []
                    
                    # おまかせノードを検索
                    for node in conversation_nodes:
                        node_name = node.get("name", "")
                        subcategory = node.get("subcategory", "")
                        logger.info(f"[Sushi] ノード: {node_name}, サブカテゴリ: {subcategory}")
                        if "寿司盛り合わせ" in subcategory or any(kw in node_name for kw in ["おまかせ", "6貫", "10貫", "12貫"]):
                            omakase_nodes.append(node)
                            logger.info(f"[Sushi] おまかせノード発見: {node_name}")
                    
                    logger.info(f"[Sushi] おまかせノード数: {len(omakase_nodes)}")
                    
                    if omakase_nodes:
                        # 6貫、10貫、12貫の順で並べる
                        omakase_ordered = []
                        for target in ["おまかせ6貫寿司", "おまかせ10貫寿司", "うにいくら入り12貫盛り"]:
                            for node in omakase_nodes:
                                if target in node.get("name", ""):
                                    omakase_ordered.append(node.get("name", ""))
                                    logger.info(f"[Sushi] 追加: {node.get('name', '')}")
                                    break
                        
                        state["response"] = "盛り合わせをお選びください。"
                        state["options"] = omakase_ordered
                        logger.info(f"[Sushi] 最終オプション: {omakase_ordered}")
                        return state
                    else:
                        logger.warning("[Sushi] おまかせノードが見つかりません")
                except Exception as e:
                    logger.error(f"おまかせ寿司検索エラー: {e}")
        
        # キーワードマッチングによる柔軟なノード検索
        if self.conversation_system:
            try:
                conversation_nodes = self.conversation_system.get_conversation_nodes()
                matched_node = self._find_node_by_keywords(last_message, conversation_nodes)
                
                if matched_node:
                    template = matched_node.get("template", "")
                    next_nodes = matched_node.get("next", [])
                    subcategory = matched_node.get("subcategory", "")
                    
                    # {{STORE_HOURS}}を営業時間に置き換え
                    if "{{STORE_HOURS}}" in template or "STORE_HOURS" in template:
                        try:
                            from core.store_info_service import StoreInfoService
                            
                            store_db_id = self.config.get("notion.database_ids.store_db")
                            if self.notion_client and store_db_id:
                                store_service = StoreInfoService(self.notion_client, store_db_id)
                                
                                # 現在有効な営業時間を取得
                                current_hours = store_service.get_current_business_hours()
                                
                                # 特別営業期間かチェック
                                if store_service.is_special_period():
                                    hours_text = f"{current_hours}\n\n※現在、特別営業時間で営業しております"
                                else:
                                    hours_text = current_hours
                                
                                # テンプレートを置き換え
                                template = template.replace("{{STORE_HOURS}}", hours_text)
                                template = template.replace("STORE_HOURS", hours_text)
                                logger.info(f"[StoreHours] 営業時間を置き換えました")
                        except Exception as e:
                            logger.error(f"[StoreHours] 営業時間取得エラー: {e}")
                            template = template.replace("{{STORE_HOURS}}", "営業時間については店舗にお問い合わせください")
                            template = template.replace("STORE_HOURS", "営業時間については店舗にお問い合わせください")
                    
                    # テンプレートは正規化せずにそのまま使用（応答テキストとして使用するため）
                    response_text = template
                    
                    # 定食屋メニューの本文整形フック
                    response_text = self._normalize_teishoku_text(response_text, matched_node)
                    
                    # 推しトーンの適用
                    response_text = self._apply_recommended_tone(response_text, matched_node)
                    
                    # 海鮮系ノードのテキスト装飾
                    if subcategory in ["海鮮刺身", "海鮮定食メニュー", "刺身・盛り合わせ"]:
                        response_text = self._add_seafood_text_decorations(response_text, matched_node)
                    
                    # おすすめ定食トップのテキスト装飾
                    if subcategory == "おすすめ定食":
                        response_text = self._add_recommended_teishoku_text_decorations(response_text, matched_node)
                    
                    # クロスセール文言を追加（既存の馬刺し赤身へのクロスセル）
                    if self._should_add_cross_sell_text_for_node(matched_node):
                        response_text = self._add_cross_sell_text(response_text, matched_node.get("id"))
                    
                    # URLプロパティがある場合、レスポンス末尾にリンクを追加
                    node_url = matched_node.get("url", "")
                    if node_url and node_url.strip():
                        # レスポンステキストの末尾に改行を追加（まだない場合）
                        if response_text and not response_text.endswith('\n'):
                            response_text += '\n'
                        # URLが相対パスの場合は、設定からbase_urlを取得して正規化
                        full_url = node_url.strip()
                        if full_url.startswith('/'):
                            # 相対パスの場合、設定からbase_urlを取得（なければ空文字のまま）
                            base_url = self.config.get("server.base_url", "") if self.config else ""
                            if base_url:
                                # base_urlの末尾のスラッシュを除去してから結合
                                base_url = base_url.rstrip('/')
                                full_url = f"{base_url}{full_url}"
                        # Markdown形式のリンクを追加
                        response_text += f"\n[詳細はこちら]({full_url})"
                    
                    # 選択肢を構築（先に構築してからクロスセル選択肢を追加）
                    options = []
                    for next_node_id in next_nodes:
                        next_node = self.conversation_system.get_node_by_id(next_node_id)
                        if next_node:
                            options.append(next_node.get("name", next_node_id))
                    
                    # Notionの「一緒におすすめ」プロパティを使ったクロスセル機能を追加
                    cross_sell_options_to_add = []
                    if self.notion_client and self.config:
                        try:
                            menu_db_id = self.config.get("notion.database_ids.menu_db")
                            logger.info(f"[CrossSell] 会話ノードマッチ: menu_db_id={menu_db_id}, notion_client={self.notion_client is not None}")
                            
                            if menu_db_id:
                                # 会話ノードのテンプレートからメニュー名を抽出
                                node_name = matched_node.get("name", "")
                                node_id = matched_node.get("id", "")
                                logger.info(f"[CrossSell] ノード情報: id={node_id}, name={node_name}, template={template[:50] if template else 'None'}...")
                                
                                # メニュー名を抽出（テンプレートの最初の行やノード名から）
                                menu_name = None
                                if template:
                                    # テンプレートの最初の行からメニュー名を抽出
                                    first_line = template.split("\n")[0].strip()
                                    logger.info(f"[CrossSell] テンプレート最初の行: {first_line}")
                                    # 「をご案内」「があります」などの前の部分を取得
                                    for marker in ["をご案内", "があります", "は", "の"]:
                                        if marker in first_line:
                                            menu_name = first_line.split(marker)[0].strip()
                                            logger.info(f"[CrossSell] テンプレートから抽出: {menu_name} (マーカー: {marker})")
                                            break
                                
                                # ノード名からも抽出を試みる
                                if not menu_name and node_name:
                                    # 「まぐろ刺身」「刺身定食」などの形式を想定
                                    menu_name = node_name.replace("確認", "").replace("メニュー", "").strip()
                                    logger.info(f"[CrossSell] ノード名から抽出: {menu_name}")
                                
                                # ノードIDからも抽出を試みる（maguro_sashimi → まぐろ刺身）
                                if not menu_name and node_id:
                                    # ノードIDをメニュー名に変換するマッピング
                                    id_to_name = {
                                        "maguro_sashimi": "まぐろ刺身",
                                        "salmon_sashimi": "サーモン刺身",
                                        "tai_sashimi": "鯛刺身",
                                        "aji_sashimi": "あじ刺身",
                                        "ika_sashimi": "いか刺身",
                                        "hotate_sashimi": "ほたて刺身",
                                    }
                                    if node_id in id_to_name:
                                        menu_name = id_to_name[node_id]
                                        logger.info(f"[CrossSell] ノードIDから抽出: {menu_name} (ID: {node_id})")
                                
                                # メニュー名が見つかった場合、Notionのクロスセル機能を呼び出す
                                if menu_name:
                                    logger.info(f"[CrossSell] 会話ノードからメニュー名抽出成功: {menu_name}")
                                    cross_sell_data = self.notion_client.cross_sell_message(
                                        database_id=menu_db_id,
                                        current_menu_name=menu_name
                                    )
                                    
                                    logger.info(f"[CrossSell] cross_sell_data取得結果: {cross_sell_data is not None}")
                                    
                                    if cross_sell_data:
                                        cross_sell_msg = cross_sell_data.get("text", "")
                                        cross_sell_items = cross_sell_data.get("items", [])
                                        
                                        logger.info(f"[CrossSell] メッセージ: {cross_sell_msg[:50] if cross_sell_msg else 'None'}..., アイテム数: {len(cross_sell_items)}")
                                        
                                        if cross_sell_msg and cross_sell_items:
                                            # 既存のクロスセル文言と重複しない場合のみ追加
                                            if "馬刺し赤身" not in cross_sell_msg or "馬刺し赤身" not in response_text:
                                                response_text += f"\n\n{cross_sell_msg}"
                                                
                                                # 選択肢に追加するリストを作成
                                                for item in cross_sell_items[:2]:
                                                    option_text = f"{item}も注文"
                                                    if option_text not in options:
                                                        cross_sell_options_to_add.append(option_text)
                                                
                                                logger.info(f"[CrossSell] 会話ノードにクロスセル追加成功: {menu_name} → {cross_sell_items}")
                                            else:
                                                logger.info(f"[CrossSell] 馬刺し赤身と重複のためスキップ")
                                        else:
                                            logger.info(f"[CrossSell] メッセージまたはアイテムが空のためスキップ")
                                    else:
                                        logger.info(f"[CrossSell] cross_sell_dataがNone")
                                else:
                                    logger.info(f"[CrossSell] メニュー名が抽出できませんでした: node_id={node_id}, node_name={node_name}, template={template[:50] if template else 'None'}")
                            else:
                                logger.warning(f"[CrossSell] menu_db_idが設定されていません")
                        except Exception as e:
                            logger.error(f"[CrossSell] 会話ノードでのクロスセル取得エラー: {e}")
                            import traceback
                            logger.error(f"[CrossSell] トレースバック: {traceback.format_exc()}")
                    
                    # クロスセル選択肢を追加
                    if cross_sell_options_to_add:
                        options.extend(cross_sell_options_to_add)
                    
                    # 横断導線を追加
                    if subcategory == "今晩のおすすめ一品":
                        options.extend(["揚げ物・酒つまみ 確認", "焼き鳥メニュー確認", "天ぷらメニュー確認"])
                        response_text = self._add_recommended_3_items(response_text)
                    elif subcategory == "揚げ物・酒のつまみ":
                        options.extend(["今晩のおすすめ一品 確認", "焼き鳥メニュー確認", "天ぷらメニュー確認"])
                    elif subcategory == "定食":
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                        options = self._add_pinned_teishoku_items(options, matched_node)
                    elif subcategory in ["海鮮刺身", "刺身・盛り合わせ"]:
                        if "天ぷらメニュー確認" not in options:
                            options.insert(0, "天ぷらメニュー確認")
                        if "エビフライ" not in options:
                            options.append("エビフライ")
                        if "アジフライ" not in options:
                            options.append("アジフライ")
                        if "馬刺し赤身" not in options:
                            options.append("馬刺し赤身")
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                    elif subcategory == "海鮮定食メニュー":
                        if "馬刺し赤身" not in options:
                            options.append("馬刺し赤身")
                        options.extend(["今晩のおすすめ一品 確認", "揚げ物・酒つまみ 確認"])
                    elif subcategory == "おすすめ定食":
                        if "今晩のおすすめ一品 確認" not in options:
                            options.append("今晩のおすすめ一品 確認")
                        if "揚げ物・酒つまみ 確認" not in options:
                            options.append("揚げ物・酒つまみ 確認")
                        options = self._arrange_recommended_teishoku_buttons(options, matched_node)
                    elif subcategory in ["寿司", "寿司盛り合わせ"]:
                        # 寿司ノードのボタン並びを修正: おまかせを先頭に
                        options = self._arrange_sushi_buttons(options, matched_node)
                    
                    # 優先度でソート（おすすめ定食以外）
                    if subcategory != "おすすめ定食":
                        options = self._sort_options_by_priority(options)
                    
                    # ボタンの並び順を安定化（おすすめ定食以外）
                    if subcategory != "おすすめ定食":
                        options = self._arrange_buttons_by_priority(options, matched_node)
                    
                    state["response"] = response_text
                    state["options"] = options
                    return state
            except Exception as e:
                logger.error(f"会話ノード検索エラー: {e}")
        
        # 「他に」「サラダ」「何がある」などの一般的なメニュー問い合わせを検出
        general_menu_keywords = ["他に", "他の", "何がある", "何か", "サラダ", "一品", "料理", "メニュー", "教えて", "寿司", "すし", "sushi"]
        is_general_menu_query = any(kw in last_message for kw in general_menu_keywords)
        
        # 具体的なメニュー名が含まれているか確認（ドリンク・せんべろ関連を追加）
        menu_keywords = ["定食", "丼", "刺身", "天ぷら", "焼き鳥", "唐揚げ", "ランチ", 
                        "ドリンク", "せんべろ", "ビール", "日本酒", "焼酎", "アルコール", "飲み物",
                        "ビール", "焼酎", "酎ハイ", "海鮮", "逸品", "煮込み", "カツ", "かつ", "カツ",
                        "寿司", "すし", "握り", "にぎり", "盛り合わせ", "もりあわせ"]
        is_specific_menu_query = any(kw in last_message for kw in menu_keywords)
        
        is_menu_query = is_specific_menu_query or is_general_menu_query
        
        # 新しいメニュー検索機能を使用
        menu_result = ""
        
        if is_menu_query and self.notion_client:
            try:
                # 新しいMenuServiceを使用してメニュー検索
                from core.menu_service import MenuService
                menu_service = MenuService(self.notion_client)
                
                # ユーザーの質問からメニューを検索
                menu_result = menu_service.search_menu_by_query(last_message, limit=5)
                
                if menu_result:
                    logger.info(f"[MenuService] メニュー検索成功: '{last_message}'")
                    result_lines = menu_result.split('\n')
                    logger.info(f"[MenuService] 結果: {len(result_lines)}件")
                else:
                    logger.info(f"[MenuService] メニュー検索結果なし: '{last_message}'")
                    
            except Exception as e:
                logger.error(f"[MenuService] エラー: {e}")
                menu_result = ""
        
        # 従来のRAG検索もフォールバックとして保持
        context = ""
        matching_menus = []
        
        if is_menu_query and self.notion_client and self.config and not menu_result:
            try:
                menu_db_id = self.config.get("notion.database_ids.menu_db")
                if menu_db_id:
                    pages = self.notion_client.get_all_pages(menu_db_id)
                    
                    # 一般的な問い合わせ（「他に何がある？」など）の場合
                    if is_general_menu_query and not is_specific_menu_query:
                        # 人気メニューやおすすめをピックアップ
                        logger.info("[RAG] 一般的なメニュー問い合わせを検出")
                        
                        # カテゴリ別にサンプルを取得
                        category_samples = {
                            "サラダ": [],
                            "一品料理": [],
                            "つまみ": [],
                            "定食": []
                        }
                        
                        for page in pages[:50]:
                            name = self.notion_client._extract_property_value(page, "Name")
                            category = self.notion_client._extract_property_value(page, "Category")
                            subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                            
                            if name:
                                # カテゴリ分類
                                if "サラダ" in name or (subcategory and "サラダ" in subcategory):
                                    if len(category_samples["サラダ"]) < 2:
                                        category_samples["サラダ"].append(name)
                                elif "逸品" in str(subcategory) or "一品" in name:
                                    if len(category_samples["一品料理"]) < 2:
                                        category_samples["一品料理"].append(name)
                                elif "つまみ" in str(subcategory) or "酒" in str(subcategory):
                                    if len(category_samples["つまみ"]) < 2:
                                        category_samples["つまみ"].append(name)
                                elif "定食" in name:
                                    if len(category_samples["定食"]) < 2:
                                        category_samples["定食"].append(name)
                        
                        # コンテキストに追加
                        context = "【当店のメニュー（一部）】\n"
                        for cat, items in category_samples.items():
                            if items:
                                context += f"\n{cat}:\n"
                                for item in items:
                                    context += f"- {item}\n"
                        
                        logger.info(f"[RAG] カテゴリ別メニューを取得")
                    
                    # 具体的なメニュー名の検索
                    else:
                        for page in pages[:30]:
                            name = self.notion_client._extract_property_value(page, "Name")
                            if name and any(kw in name for kw in last_message.split()):
                                price = self.notion_client._extract_property_value(page, "Price", 0)
                                short_desc = self.notion_client._extract_property_value(page, "一言紹介")
                                matching_menus.append({
                                    "id": page["id"],
                                    "name": name,
                                    "price": price,
                                    "desc": short_desc
                                })
                        
                        if matching_menus:
                            context = "【該当するメニュー】\n"
                            for menu in matching_menus[:3]:
                                context += f"- {menu['name']}"
                                if menu['price'] > 0:
                                    context += f" ¥{menu['price']:,}"
                                if menu['desc']:
                                    context += f"\n  {menu['desc']}"
                                context += "\n"
                            
                            logger.info(f"[RAG] {len(matching_menus)}件のメニューを検出")
            except Exception as e:
                logger.error(f"RAG検索エラー: {e}")
        
        # ===== クロスセル推薦を取得 =====
        cross_sell_options = []
        cross_sell_message_text = None
        recommendations = []
        cross_sell_data = None
        if matching_menus and self.notion_client:
            try:
                # 最初のマッチしたメニューの推薦を取得
                first_menu = matching_menus[0]
                first_menu_id = first_menu.get("id")
                first_menu_name = first_menu.get("name", "")
                
                menu_db_id = self.config.get("notion.database_ids.menu_db") if self.config else None
                
                # 方法1: ページIDベース（既存の方法）
                if first_menu_id:
                    logger.info(f"[CrossSell] {first_menu_name}の推薦を取得中（ページIDベース）...")
                    recommendations = self.notion_client.get_cross_sell_recommendations(
                        page_id=first_menu_id,
                        limit=2
                    )
                    
                    if recommendations:
                        context += "\n\n【一緒におすすめ】\n"
                        for rec in recommendations:
                            name = rec.get("name", "")
                            price = rec.get("price", 0)
                            message = rec.get("suggest_message", "")
                            short_desc = rec.get("short_desc", "")
                            
                            context += f"- {name}"
                            if price > 0:
                                context += f" ¥{price:,}"
                            if message:
                                context += f" - {message}"
                            elif short_desc:
                                context += f" - {short_desc}"
                            context += "\n"
                            
                            # 選択肢として追加
                            cross_sell_options.append(f"{name}も注文")
                        
                        logger.info(f"[CrossSell] {len(recommendations)}件の推薦を追加（ページIDベース）")
                
                # 方法2: メニュー名ベース（指示書の方法）- フォールバックまたは追加
                if menu_db_id and first_menu_name and not recommendations:
                    logger.info(f"[CrossSell] {first_menu_name}の推薦を取得中（メニュー名ベース）...")
                    cross_sell_data = self.notion_client.cross_sell_message(
                        database_id=menu_db_id,
                        current_menu_name=first_menu_name
                    )
                    
                    if cross_sell_data:
                        cross_sell_message_text = cross_sell_data.get("text", "")
                        cross_sell_items = cross_sell_data.get("items", [])
                        
                        if cross_sell_message_text:
                            context += f"\n\n【一緒におすすめ】\n{cross_sell_message_text}\n"
                            
                            # 選択肢として追加
                            for item in cross_sell_items[:2]:
                                cross_sell_options.append(f"{item}も注文")
                            
                            logger.info(f"[CrossSell] メッセージ生成: {cross_sell_message_text[:50]}...")
                            logger.info(f"[CrossSell] {len(cross_sell_items)}件の推薦を追加（メニュー名ベース）")
                
                if not recommendations and not cross_sell_data:
                    logger.info(f"[CrossSell] {first_menu_name}に推薦なし")
                    
            except Exception as e:
                logger.error(f"[CrossSell] 取得エラー: {e}")
                import traceback
                logger.error(f"[CrossSell] トレースバック: {traceback.format_exc()}")
        
        # LLMを使用して人間味のある応答を生成
        if self.llm:
            try:
                # 人間味のあるシステムプロンプト（褒める要素追加）
                system_prompt = """あなたは小料理屋「おおつき」のスタッフです。
お客様の質問に温かく応答してください。

応答スタイル：
- メニューの特徴や魅力を褒める・強調する
- 「新鮮」「人気」「おすすめ」などのポジティブな言葉を使う
- 「私もおすすめです！」「ぜひどうぞ」など、スタッフの推薦を入れる
- 2-3文で応答（短すぎず、長すぎず）
- 丁寧だけど堅すぎない口調

例1（具体的なメニュー）：
「はい、刺身定食ございます。当店の刺身は毎朝仕入れているので新鮮なんですよ。人気の定食です、私もおすすめします！」

例2（一般的な質問）：
「他にもサラダや一品料理、お酒に合うつまみなど色々ございますよ。サラダは新鮮な野菜を使っていて人気なんです。」

【重要】「一緒におすすめ」情報がある場合は、自然に追加提案してください：
例：「唐揚げもご一緒にいかがですか？お酒のつまみにもぴったりですよ。」"""
                
                if menu_result:
                    system_prompt += f"\n\n【メニュー情報】\n{menu_result}"
                    logger.info(f"[MenuService] システムプロンプトにメニュー情報を追加: {len(menu_result)}文字")
                elif context:
                    system_prompt += f"\n\n{context}"
                
                messages = build_chat_messages(
                    system_prompt,
                    state.get("context", {}).get("conversation_turns", []) or [],
                    last_message,
                )
                response = self.llm.invoke(messages)
                
                # メニュー問い合わせの場合は注文案内を追加
                response_text = response.content
                if is_menu_query or is_general_menu_query:
                    response_text = self._add_order_instruction(response_text)
                
                # クロスリフレクション適用（重要な応答の場合）
                if self._ensure_cross_reflection_engine():
                    try:
                        # 意図を取得（stateから）
                        detected_intent = state.get("intent", "")
                        
                        # 重要な意図かどうかを確認
                        is_critical = self.cross_reflection_engine.is_critical_intent(last_message, detected_intent)
                        logger.info(f"[CrossReflection] general_response: 重要な意図={is_critical}, intent={detected_intent}, message='{last_message[:50]}...'")
                        
                        if is_critical:
                            logger.info(f"[CrossReflection] general_responseにクロスリフレクション適用開始: {len(response_text)}文字")
                            
                            # コンテキストを構築
                            context_parts = []
                            if menu_result:
                                context_parts.append(f"メニュー情報:\n{menu_result}")
                            if context:
                                context_parts.append(f"追加コンテキスト:\n{context}")
                            reflection_context = "\n\n".join(context_parts) if context_parts else None
                            
                            # クロスリフレクション適用
                            improved_response = self.cross_reflection_engine.apply_reflection(
                                user_message=last_message,
                                initial_response=response_text,
                                intent=detected_intent,
                                context=reflection_context
                            )
                            
                            if improved_response != response_text:
                                logger.info(f"[CrossReflection] ✅ general_response応答を改善しました: {len(response_text)}文字 → {len(improved_response)}文字")
                                response_text = improved_response
                            else:
                                logger.info("[CrossReflection] ℹ️ general_response応答改善なし（スキップまたはスコア高）")
                        else:
                            logger.debug(f"[CrossReflection] general_response: 重要な意図ではないためスキップ")
                    except Exception as e:
                        logger.error(f"[CrossReflection] ❌ general_responseエラー（フォールバック）: {e}")
                        import traceback
                        logger.error(f"[CrossReflection] トレースバック: {traceback.format_exc()}")
                        # エラーが発生しても元の応答を使用
                
                state["response"] = response_text
                
                # 選択肢を設定（クロスセル + 通常選択肢）
                tempura_asked = any(kw in last_message for kw in ["天ぷら", "てんぷら", "天麩羅"])
                lunch_asked = any(kw in last_message for kw in ["ランチ", "昼", "昼食"])
                
                if is_menu_query and cross_sell_options:
                    # クロスセル提案がある場合
                    state["options"] = cross_sell_options[:2] + [
                        "いいえ、結構です"
                    ]
                elif lunch_asked:
                    # ランチの問い合わせの場合
                    state["options"] = [
                        "寿司ランチ",
                        "海鮮定食はこちら",
                        "おすすめ定食はこちら",
                        "テイクアウトメニュー"
                    ]
                elif is_general_menu_query:
                    # 一般的なメニュー問い合わせの場合
                    # 寿司キーワードが含まれている場合は「寿司」タブを追加
                    if any(kw in last_message for kw in ["寿司", "すし", "sushi"]):
                        state["options"] = (
                            ["寿司", "サラダ"]
                            + (["天ぷら"] if tempura_asked else [])
                            + ["逸品料理", "おすすめ定食はこちら"]
                        )
                    else:
                        base_opts = [
                            "サラダ",
                            "逸品料理",
                            "おすすめ定食はこちら",
                            "海鮮定食はこちら"
                        ]
                        state["options"] = (["天ぷら"] + base_opts) if tempura_asked else base_opts
                elif is_menu_query:
                    # 具体的なメニュー検索（クロスセル提案なし）
                    base_opts = [
                        "サラダ",
                        "おすすめ定食はこちら",
                        "メニューを見る"
                    ]
                    state["options"] = (["天ぷら"] + base_opts) if tempura_asked else base_opts
                else:
                    state["options"] = [
                        "メニューを見る",
                        "おすすめを教えて"
                    ]
                
                logger.info(f"[LLM応答] {response.content[:50]}...")
                return state
            
            except Exception as e:
                logger.error(f"LLM応答生成エラー: {e}")
                # フォールバック：一般的なメニュー提案
                lunch_asked = any(kw in last_message for kw in ["ランチ", "昼", "昼食"])
                
                if lunch_asked:
                    # ランチの問い合わせの場合
                    state["response"] = "ランチメニューは、定食や丼物など色々ございます。"
                    state["options"] = [
                        "寿司ランチ",
                        "海鮮定食はこちら",
                        "おすすめ定食はこちら",
                        "テイクアウトメニュー"
                    ]
                elif is_general_menu_query:
                    # 寿司キーワードが含まれている場合は「寿司」タブを追加
                    if any(kw in last_message for kw in ["寿司", "すし", "sushi"]):
                        state["response"] = "サラダ、一品料理、お酒に合うつまみなど色々ございますよ。"
                        state["options"] = [
                            "寿司",
                            "サラダ",
                            "逸品料理",
                            "メニューを見る"
                        ]
                    else:
                        state["response"] = "サラダ、一品料理、お酒に合うつまみなど色々ございますよ。"
                        state["options"] = [
                            "サラダ",
                            "逸品料理",
                            "メニューを見る"
                        ]
                else:
                    state["response"] = "申し訳ございません。"
                    state["options"] = ["メニューを見る"]
        else:
            # LLMが利用できない場合
            if is_general_menu_query:
                # 寿司キーワードが含まれている場合は「寿司」タブを追加
                if any(kw in last_message for kw in ["寿司", "すし", "sushi"]):
                    state["response"] = "サラダ、一品料理、お酒に合うつまみなど色々ございますよ。"
                    state["options"] = [
                        "寿司",
                        "サラダ",
                        "逸品料理",
                        "メニューを見る"
                    ]
                else:
                    state["response"] = "サラダ、一品料理、お酒に合うつまみなど色々ございますよ。"
                    state["options"] = [
                        "サラダ",
                        "逸品料理",
                        "メニューを見る"
                    ]
            else:
                state["response"] = "何かお探しですか？"
                state["options"] = ["メニューを見る", "おすすめを教えて"]
        
        return state
    
    def end_flow(self, state: State) -> State:
        """終了案内ノード"""
        logger.info("[Node] end_flow")
        
        # 既にレスポンスがある場合はそのまま
        if not state.get("response"):
            state["response"] = "ご注文が決まりましたらお声がけください。"
        
        # 元のレスポンスを保持しておく（不明キーワード判定用）
        original_response = state.get("response", "")
        state["original_response"] = original_response

        # すべての最終応答にLINE問い合わせリンクを付与
        try:
            state["response"] = append_line_contact_link(original_response)
        except Exception as e:
            logger.error(f"[LineContact] LINEリンク付与エラー: {e}")
        
        # 不明な質問をNotionに記録
        self._log_unknown_keywords(state)
        
        return state
    
    def _log_unknown_keywords(self, state: State) -> None:
        """不明なキーワードをNotionに記録（LINEリンク付きの最終応答を保存）"""
        if not self.config or not self.notion_client:
            return
        
        messages = state.get("messages", [])
        if not messages:
            return
        
        last_message = messages[-1]
        # 不明キーワード判定にはLINEリンク付与前のテキストを使用する
        original_response = state.get("original_response", state.get("response", ""))
        current_step = state.get("current_step", "")
        
        # end_flowに到達した場合は記録
        should_log = False
        
        # 条件1: end_flowノードに到達した場合
        if current_step == "end_flow":
            should_log = True
            logger.info(f"[UnknownKeywords] end_flow到達: {last_message}")
        
        # 条件2: デフォルトレスポンスやエラーメッセージの場合
        unknown_patterns = [
            "申し訳ございません",
            "わかりません",
            "もう少し詳しく教えていただけますか",
            "ご注文が決まりましたらお声がけください"
        ]
        
        if any(pattern in original_response for pattern in unknown_patterns):
            should_log = True
            logger.info(f"[UnknownKeywords] パターンマッチ: {last_message}")
        
        # 条件3: RAG検索結果がない、または信頼度が低い場合
        rag_results = state.get("rag_results", [])
        if not rag_results or len(rag_results) == 0:
            if not any(pattern in original_response for pattern in ["ありがとう", "メニュー", "おすすめ"]):
                should_log = True
                logger.info(f"[UnknownKeywords] RAG結果なし: {last_message}")
        
        if should_log:
            try:
                # 直近メッセージをコンテキストとして渡す
                context_messages = messages[-3:] if len(messages) >= 3 else messages
                
                # state["response"] には既にLINEリンク付きの最終応答が入っている
                full_response = state.get("response", "")
                logger.info(f"[UnknownKeywords] 保存用フルレスポンス: {full_response}")
                
                log_unknown_keyword_to_notion(
                    question=last_message,
                    context={
                        "messages": context_messages,
                        "current_step": current_step,
                        "rag_results": rag_results,
                    },
                    response=full_response,
                    notion_client=self.notion_client,
                    config=self.config,
                    session_id=state.get("session_id", ""),
                )
                logger.info(f"[UnknownKeywords] 記録完了: {last_message}")
            except Exception as e:
                logger.error(f"不明キーワード記録エラー: {e}")
    
    # --- 条件分岐 ---
    
    def route_intent(self, state: State) -> str:
        """意図判定ルーティング"""
        messages = state.get("messages", [])
        
        # メッセージが空の場合（初回接続）
        if not messages or len(messages) == 0:
            return END
        
        last_message = messages[-1] if messages else ""
        logger.info(f"[Route] メッセージ: '{last_message}'")
        logger.info(f"[Route] SimpleGraphEngine動作確認: ルーティング開始")
        
        # 正規化したメッセージを作成（キーワードマッチング用）
        normalized_last_message = self._normalize_text(last_message)
        
        # 「（続きを見る）」と「（続きはこちら）」を含むメッセージは最優先でoption_clickにルーティング
        if "（続きを見る）" in last_message or "（続きはこちら）" in last_message:
            logger.info(f"[Route] 続きを見る/続きはこちら検出: '{last_message}' → option_click")
            return "option_click"
        
        # プロアクティブトリガー（内部からの呼び出し）
        if state.get("context", {}).get("trigger") == "proactive":
            return "proactive_recommend"
        
        # コースタブのクリック判定（最優先） - 宴会コースタブを特別に処理
        course_tab_options = [
            "3,000円コース",
            "4,000円コース",
            "5,000円コース",
            "オードブル形式",
            "オードブルコース"
        ]
        if last_message in course_tab_options:
            logger.info(f"[Route] 宴会コースタブクリック検出: '{last_message}' → option_click")
            return "option_click"
        
        # 宴会関連ボタンのクリック判定（最優先）
        banquet_button_options = [
            "飲み放題プラン",
            "カスタムオプション",
            "ニーズ別おすすめ",
            "飲み放題（アルコール90分）",
            "飲み放題（ソフトドリンク）"
        ]
        if last_message in banquet_button_options:
            logger.info(f"[Route] 宴会ボタンクリック検出: '{last_message}' → option_click")
            return "option_click"
        
        # 「おすすめ定食の続き」を優先的にoption_clickにルーティング
        if last_message == "おすすめ定食の続き" or last_message == "おすすめ定食はこちら":
            logger.info(f"[Route] おすすめ定食の続き検出: '{last_message}' → option_click")
            return "option_click"
        
        # 選択肢クリック判定（最優先）
        if self._is_option_click(last_message):
            logger.info(f"[Route] 選択肢クリック判定: '{last_message}' → option_click")
            return "option_click"
        
        # 【重要】忘年会キーワードを最優先検出（刺身キーワードより前に配置）
        # 会話ノードDBから忘年会ノードを検索
        bonenkai_keywords = [
            "忘年会", "ぼうねんかい", "bounenkai",
            "忘新年会", "ぼうしんねんかい",
            "年末", "ねんまつ", "年末の宴会", "年末飲み会"
        ]
        if any(kw in last_message for kw in bonenkai_keywords):
            # 会話ノードDBから忘年会ノードを検索
            if self.conversation_system:
                conversation_nodes = self.conversation_system.get_conversation_nodes()
                matched_node = self._find_node_by_keywords(last_message, conversation_nodes)
                if matched_node:
                    node_id = matched_node.get("id", "")
                    # 忘年会関連のノードIDか確認
                    if "bonenkai" in node_id.lower() or "忘年会" in str(matched_node.get("name", "")):
                        logger.info(f"[Route] 忘年会ノード検出: '{last_message}' → {node_id} (キーワードマッチング)")
                        return "general"  # general_responseで処理される
        
        # テイクアウト/弁当キーワードを宴会インテント検出より前に配置（誤検出防止）
        # 完全一致検索でテイクアウト/弁当キーワードをチェック
        bento_keywords_precheck = [
            "弁当", "お弁当", "べんとう", "BENTO", "bento",
            "テイクアウト", "takeout", "TAKEOUT", "テークアウト", "テイク",
            "持ち帰り", "お持ち帰り", "持帰り",
            "テイクアウトメニュー", "テイクアウト メニュー",
            "持ち帰りメニュー", "持ち帰り メニュー",
            "弁当メニュー", "弁当 メニュー"
        ]
        if any(kw in last_message for kw in bento_keywords_precheck):
            # テイクアウト/弁当キーワードが含まれている場合は、後で詳細にルーティング
            # ここでは宴会インテント検出をスキップするため、何もしない
            pass
        else:
            # テイクアウト/弁当キーワードがない場合のみ宴会インテントを検出
            # 宴会関連キーワードを最優先検出（intent.banquet）- 刺身より前に配置
            banquet_intent = self._detect_banquet_intent(last_message)
            if banquet_intent:
                node_id = self._route_banquet_intent_to_node(banquet_intent)
                if node_id:
                    logger.info(f"[Route] 宴会インテント検出: {banquet_intent} → {node_id}")
                    # ノードIDをコンテキストに保存
                    if "context" not in state:
                        state["context"] = {}
                    state["context"]["banquet_node_id"] = node_id
                    return "banquet_flow"
        
        # 刺身関連キーワードを検出（intent.sashimi）- 「たい」の誤検出を防ぐため、より厳密に
        sashimi_keywords = [
            # 基本的な刺身表現
            "刺身", "さしみ", "お刺身", "海鮮刺身", "刺身盛り", "刺身定食",
            "刺身盛合", "刺し身", "造り", "お造り", "盛り合わせ", "刺盛", "さしもり",
            
            # 短縮形・口語表現（「〇〇刺」パターン）
            "まぐろ刺", "マグロ刺", "鮪刺", "サーモン刺", "さーもん刺", "鯛刺", "タイ刺",
            "あじ刺", "アジ刺", "鯵刺", "いか刺", "イカ刺", "烏賊刺", "ほたて刺", "ホタテ刺", "帆立刺",
            "さば刺", "サバ刺", "鯖刺", "ぶり刺", "ブリ刺", "鰤刺", "かつお刺", "カツオ刺", "鰹刺",
            "たこ刺", "タコ刺", "蛸刺", "えび刺", "エビ刺", "海老刺", "あなご刺", "アナゴ刺", "穴子刺",
            
            # 魚名のみ（刺身文脈）- 「たい」は単独では検出しない（誤検出防止）
            "まぐろ", "鮪", "tuna", "ツナ", "つな",
            "サーモン", "さーもん", "鮭", "しゃけ", "salmon",
            "鯛", "真鯛", "まだい", "タイ",  # 「たい」を削除（誤検出防止）
            "あじ", "鯵", "アジ",
            "いか", "烏賊", "イカ",
            "ほたて", "帆立", "ホタテ",
            "さば", "鯖", "サバ",
            "ぶり", "鰤", "ブリ",
            "かつお", "鰹", "カツオ",
            "たこ", "蛸", "タコ",
            "えび", "海老", "エビ",
            "はまち", "ハマチ", "ねぎとろ", "ネギトロ",
            
            # その他の刺身表現
            "生魚", "なまざかな", "海鮮", "かいせん", "活魚", "鮮魚", "新鮮", "生"
        ]
        
        # 正規化して比較（ただし「たい」は単独では検出しない）
        sashimi_matches = []
        for kw in sashimi_keywords:
            normalized_kw = self._normalize_text(kw)
            if normalized_kw in normalized_last_message:
                # 「たい」の場合は、文脈を確認（「鯛」「タイ」などと組み合わせた場合のみ）
                if normalized_kw == "たい":
                    # 「たい」が単独で含まれている場合はスキップ（誤検出防止）
                    # 「鯛」「タイ」などと組み合わせた場合のみ検出
                    if "鯛" in last_message or "タイ" in last_message or "たい刺" in last_message or "タイ刺" in last_message:
                        sashimi_matches.append(kw)
                else:
                    sashimi_matches.append(kw)
        
        if sashimi_matches:
            logger.info(f"[Route] 刺身キーワード検出: {sashimi_matches}")
            logger.info(f"[Route] '{last_message}' → sashimi_flow にルーティング")
            return "sashimi_flow"
        
        # 焼き鳥キーワードを最優先検出（焼き魚・煮魚より前に配置して誤マッチを防止）
        yakitori_keywords_route = ["焼き鳥", "やきとり", "ヤキトリ", "yakitori"]
        if any(kw in last_message for kw in yakitori_keywords_route):
            logger.info(f"[Route] 焼き鳥キーワード検出: '{last_message}' → food_flow")
            return "food_flow"
        
        # 揚げ物キーワード（誤マッチを防ぐため、より具体的なキーワードに限定）
        fried_keywords = [
            # 基本的な揚げ物表現
            "揚げ物", "揚げもの", "あげもの", "フライ", "唐揚げ", "からあげ", "から揚げ", "カラアゲ",
            "串カツ", "串かつ", "フリッター", "コロッケ", "メンチカツ", "とんかつ", "トンカツ", "豚カツ",
            "チキンカツ", "鶏カツ", "エビフライ", "海老フライ", "あじフライ", "アジフライ", "鯵フライ",
            "かさご唐揚げ", "カサゴ唐揚げ", "たこ唐揚げ", "タコ唐揚げ", "天ぷら", "天麩羅", "てんぷら"
            # 注意: 「焼き鳥」は上で既にチェック済み
            # 注意: 単純な「揚げ」「カツ」は除外（誤マッチ防止）
        ]
        if any(kw in last_message for kw in fried_keywords):
            logger.info(f"[Route] 揚げ物キーワード検出: '{last_message}' → food_flow")
            return "food_flow"
        
        # 「おすすめ定食の続き」を定食キーワード検出より前にチェック（誤マッチ防止）
        if last_message == "おすすめ定食の続き" or last_message == "おすすめ定食はこちら":
            logger.info(f"[Route] おすすめ定食の続き検出（定食キーワード前）: '{last_message}' → option_click")
            return "option_click"
        
        # 定食関連キーワード（柔軟な表現対応）
        teishoku_keywords = [
            # 基本的な定食表現
            "定食", "ていしょく", "お定食", "おていしょく", "セット", "せっと",
            
            # 具体的な定食名
            "刺身定食", "刺し身定食", "海鮮定食", "かいせん定食", "焼き魚定食", "焼魚定食", "やきざかな定食",
            "煮魚定食", "煮付定食", "煮付け定食", "にざかな定食", "揚げ物定食", "あげもの定食", "フライ定食", "唐揚げ定食", "からあげ定食",
            "天ぷら定食", "てんぷら定食", "天麩羅定食", "とんかつ定食", "トンカツ定食", "豚カツ定食", "かつ定食",
            "チキンカツ定食", "鶏カツ定食", "とりかつ定食", "アジフライ定食", "鯵フライ定食", "あじふらい定食", "ミックスフライ定食",
            
            # おすすめ・日替わり系
            "おすすめ定食", "お勧め定食", "お薦め定食", "推奨定食", "人気定食", "にんき定食",
            "日替わり定食", "日替定食", "ひがわり定食", "本日の定食", "今日の定食", "きょうの定食",
            
            # ランチ定食
            "ランチ定食", "らんち定食", "ランチセット", "らんちせっと", "昼定食", "ひる定食", "お昼定食"
        ]
        
        teishoku_matches = [kw for kw in teishoku_keywords if self._normalize_text(kw) in normalized_last_message]
        if teishoku_matches:
            logger.info(f"[Route] 定食キーワード検出: {teishoku_matches}")
            logger.info(f"[Route] '{last_message}' → general (定食)")
            return "general"
        
        # 丼物関連キーワード（柔軟な表現対応）
        donburi_keywords = [
            # 基本的な丼表現
            "丼", "どんぶり", "ドンブリ", "丼物", "どんぶりもの",
            
            # 具体的な丼名
            "海鮮丼", "かいせん丼", "かいせんどん", "マグロ丼", "まぐろ丼", "鮪丼",
            "サーモン丼", "さーもん丼", "鮭丼", "ネギトロ丼", "ねぎとろ丼",
            "鉄火丼", "てっかどん", "てっか丼", "いくら丼", "イクラ丼", "筋子丼",
            "天丼", "てんどん", "天麩羅丼", "かつ丼", "カツ丼", "かつどん",
            "親子丼", "おやこどん", "おやこ丼", "牛丼", "ぎゅうどん", "ぎゅう丼",
            "豚丼", "ぶたどん", "ぶた丼", "うな丼", "ウナ丼", "鰻丼"
        ]
        
        donburi_matches = [kw for kw in donburi_keywords if kw in last_message]
        if donburi_matches:
            logger.info(f"[Route] 丼物キーワード検出: {donburi_matches}")
            logger.info(f"[Route] '{last_message}' → general (丼物)")
            return "general"
        
        # 寿司関連キーワード（柔軟な表現対応）
        sushi_keywords = [
            # 基本的な寿司表現
            "寿司", "すし", "お寿司", "おすし", "スシ", "SUSHI", "sushi",
            "鮨", "鮓", "握り", "にぎり", "ニギリ",
            
            # 寿司の種類
            "にぎり寿司", "握り寿司", "握りずし", "巻き寿司", "巻きずし", "巻物", "まきもの",
            "ちらし寿司", "ちらしずし", "散らし寿司", "お好み寿司", "おこのみ寿司", "好み寿司",
            "おまかせ寿司", "お任せ寿司", "任せ寿司", "特上寿司", "とくじょう寿司", "特上",
            "上寿司", "じょうずし", "並寿司", "なみずし",
            
            # 寿司ランチ
            "寿司ランチ", "すしランチ", "寿司セット", "すしセット", "寿司定食", "すし定食",
            "にぎりランチ", "握りランチ",
            
            # ネタの表現
            "トロ", "とろ", "大トロ", "おおとろ", "中トロ", "ちゅうとろ", "赤身", "あかみ", 
            "光物", "ひかりもの", "ひかりもん", "白身", "しろみ", "青魚", "あおざかな"
        ]
        
        sushi_matches = [kw for kw in sushi_keywords if self._normalize_text(kw) in normalized_last_message]
        if sushi_matches:
            logger.info(f"[Route] 寿司キーワード検出: {sushi_matches}")
            logger.info(f"[Route] '{last_message}' → general (寿司)")
            return "general"
        
        # 焼き魚・煮魚関連キーワード（「焼き」単独は除外して誤マッチを防止）
        grilled_fish_keywords = [
            # 焼き魚（「焼き」単独は除外）
            "焼き魚", "焼魚", "やきざかな", "グリル", "塩焼き", "しおやき",
            "さんま焼き", "サンマ焼き", "秋刀魚焼き", "さば焼き", "サバ焼き", "鯖焼き",
            "ぶり焼き", "ブリ焼き", "鰤焼き", "あじ焼き", "アジ焼き", "鯵焼き",
            
            # 煮魚
            "煮魚", "煮付け", "煮付", "にざかな", "煮物", "煮つけ",
            "さば煮付け", "サバ煮付け", "鯖煮付け", "ぶり煮付け", "ブリ煮付け", "鰤煮付け",
            "かれい煮付け", "カレイ煮付け", "鰈煮付け"
        ]
        
        grilled_fish_matches = [kw for kw in grilled_fish_keywords if kw in last_message]
        if grilled_fish_matches:
            logger.info(f"[Route] 焼き魚・煮魚キーワード検出: {grilled_fish_matches}")
            logger.info(f"[Route] '{last_message}' → general (焼き魚・煮魚)")
            return "general"
        
        # ランチキーワードの優先判定（弁当の前に実行）
        # 「ランチ」単独または「ランチメニュー」などは店内飲食のランチとして扱う
        lunch_exclusive_keywords = [
            "ランチメニュー", "ランチは何", "ランチの種類", "ランチある", "ランチのおすすめ",
            "ランチ教えて", "ランチを教えて", "ランチについて", "ランチを見たい", "ランチ見せて",
            "ランチどんな", "ランチで", "ランチに", "ランチが"
        ]
        
        # 「ランチ」単独チェック - ただし「弁当」「テイクアウト」「持ち帰り」が含まれない場合のみ
        has_lunch_keyword = any(kw in last_message for kw in lunch_exclusive_keywords)
        has_bento_keywords = any(kw in last_message for kw in ["弁当", "テイクアウト", "持ち帰り"])
        
        # 「ランチ」が含まれ、かつ弁当関連キーワードがない場合は、店内ランチメニューとして扱う
        if "ランチ" in last_message and not has_bento_keywords:
            logger.info(f"[Route] ランチキーワード検出（弁当除外）: '{last_message}' → general (ランチメニュー)")
            return "general"
        
        # キーワードベース判定（選択肢クリック判定の後に実行）
        # 弁当関連（優先度高）- 柔軟なキーワード対応
        bento_keywords = [
            # 基本的な弁当表現
            "弁当", "お弁当", "べんとう", "BENTO", "bento",
            
            # 質問パターン
            "どういう弁当", "弁当の種類", "弁当メニュー", "弁当は何がありますか", "弁当について",
            "どんな弁当", "弁当ありますか", "弁当はありますか", "弁当のメニュー", "弁当を見たい",
            "弁当を教えて", "弁当を紹介して", "弁当を案内して", "弁当を知りたい",
            
            # おすすめ・人気系
            "おすすめの弁当", "人気の弁当", "おいしい弁当", "美味しい弁当", "弁当のおすすめ",
            "どの弁当", "どの弁当が", "弁当で何が", "弁当でおすすめ",
            
            # 種類・カテゴリ系
            "弁当の種類", "弁当のカテゴリ", "弁当の分類", "どんな種類の弁当",
            "弁当には何が", "弁当のラインナップ", "弁当の品揃え",
            
            # 具体的な弁当名（部分一致）
            "唐揚げ弁当", "からあげ弁当", "カラアゲ弁当", "鶏カツ弁当", "チキンカツ弁当",
            "しゅうまい弁当", "シュウマイ弁当", "まごころ弁当", "まごころ",
            
            # テイクアウト・持ち帰り系
            "テイクアウト弁当", "持ち帰り弁当", "お持ち帰り弁当", "弁当テイクアウト",
            "弁当持ち帰り", "弁当のお持ち帰り",
            
            # ランチ・昼食系
            "ランチ弁当", "昼食弁当", "お昼の弁当", "昼の弁当", "弁当ランチ",
            
            # 価格・注文系
            "弁当の値段", "弁当の価格", "弁当を注文", "弁当を頼みたい", "弁当をお願い",
            "弁当ください", "弁当を食べたい",
            
            # その他の表現
            "弁当好き", "弁当が好き", "弁当を探して", "弁当を選びたい", "弁当を決めたい",
            "弁当で迷って", "弁当で悩んで", "弁当の選択肢"
        ]
        
        # テイクアウト関連（弁当と連携）
        takeout_keywords = [
            # 基本的なテイクアウト表現
            "テイクアウト", "takeout", "TAKEOUT", "テークアウト", "テイク",
            
            # 持ち帰り表現
            "持ち帰り", "お持ち帰り", "持帰り", "持って帰る", "持ち帰る",
            
            # 質問パターン
            "テイクアウトありますか", "テイクアウトはありますか", "テイクアウトメニュー", "テイクアウト メニュー",
            "持ち帰りありますか", "持ち帰りはありますか", "持ち帰りメニュー", "持ち帰り メニュー",
            "テイクアウトを教えて", "持ち帰りを教えて", "テイクアウトについて",
            "持ち帰りについて", "テイクアウトを知りたい", "持ち帰りを知りたい",
            "どんなテイクアウト", "どんな持ち帰り", "どんなテイクアウトありますか", "どんな持ち帰りありますか",
            
            # おすすめ・人気系
            "おすすめのテイクアウト", "人気のテイクアウト", "おすすめの持ち帰り",
            "人気の持ち帰り", "テイクアウトのおすすめ", "持ち帰りのおすすめ",
            "どのテイクアウト", "どの持ち帰り", "テイクアウトで何が", "持ち帰りで何が",
            
            # 種類・カテゴリ系
            "テイクアウトの種類", "テイクアウトのカテゴリ", "テイクアウトの分類",
            "持ち帰りの種類", "持ち帰りのカテゴリ", "持ち帰りの分類",
            "どんなテイクアウト", "どんな持ち帰り", "テイクアウトには何が", "持ち帰りには何が",
            "どんなテイクアウトがありますか", "どんな持ち帰りがありますか",
            "テイクアウトにはどんな", "持ち帰りにはどんな", "テイクアウトのラインナップ", "持ち帰りのラインナップ",
            
            # 価格・注文系
            "テイクアウトの値段", "テイクアウトの価格", "持ち帰りの値段", "持ち帰りの価格",
            "テイクアウトを注文", "持ち帰りを注文", "テイクアウトを頼みたい", "持ち帰りを頼みたい",
            "テイクアウトください", "持ち帰りください", "テイクアウトをお願い", "持ち帰りをお願い",
            
            # 弁当と連携する表現
            "テイクアウト弁当", "持ち帰り弁当", "お持ち帰り弁当", "弁当テイクアウト",
            "弁当持ち帰り", "弁当のお持ち帰り", "テイクアウトで弁当", "持ち帰りで弁当",
            
            # その他の表現
            "テイクアウト好き", "持ち帰り好き", "テイクアウトを探して", "持ち帰りを探して",
            "テイクアウトを選びたい", "持ち帰りを選びたい", "テイクアウトを決めたい", "持ち帰りを決めたい",
            "テイクアウトで迷って", "持ち帰りで迷って", "テイクアウトで悩んで", "持ち帰りで悩んで"
        ]
        
        # 包括的な部分一致検索システム
        logger.info(f"[Route] メッセージ確認: '{last_message}'")
        
        # 1. 完全一致検索
        matched_keywords = [kw for kw in bento_keywords + takeout_keywords if kw in last_message]
        
        # 2. 部分一致検索（キーワードの一部が含まれている場合）
        if not matched_keywords:
            # 包括的な部分一致キーワード
            # おすすめ関連キーワードを優先判定（部分一致検出より前に配置）
            recommend_keywords_priority = [
                "おすすめ", "お勧め", "お薦め", "オススメ", "推奨", "人気", "一押し", "イチオシ",
                "おすすめ一品", "おすすめ定食", "おすすめメニュー", "おすすめ料理"
            ]
            recommend_matches_priority = [kw for kw in recommend_keywords_priority if kw in last_message]
            if recommend_matches_priority:
                logger.info(f"[Route] おすすめキーワード優先検出: {recommend_matches_priority}")
                return "proactive_recommend"
            
            partial_keywords = {
                "bento": [
                    "弁当", "べんとう", "お弁当", "おべんとう",
                    "唐揚げ", "からあげ", "カラアゲ", "鶏", "チキン", "しゅうまい", "シュウマイ", "まごころ",
                    "カツ", "セット", "おかず", "おかず", "テイクアウト", "持ち帰り",
                    "各種", "豚", "鶏", "豚唐揚げ", "鶏唐揚げ", "豚カツ", "鶏カツ"
                ],
                "takeout": [
                    "テイクアウト", "持ち帰り", "テイク", "持ち", "帰り", "アウト", "持帰り",
                    "お持ち帰り", "テークアウト", "テイク", "takeout", "TAKEOUT"
                ],
                "question": [
                    "どんな", "ありますか", "何が", "メニュー", "ラインナップ", "種類", "カテゴリ",
                    "分類", "どういう", "について", "教えて", "紹介", "案内", "知りたい",
                    "おすすめ", "人気", "おいしい", "美味しい", "どれが", "どの", "で何が",
                    "値段", "価格", "いくら", "料金", "注文", "頼みたい", "お願い", "ください"
                ],
                "food": [
                    "料理", "食べ物", "食事", "食べたい", "お腹", "おなか", "腹", "はら",
                    "サラダ", "一品", "つまみ", "おつまみ", "肴", "おかず", "おかず",
                    "魚", "肉", "野菜", "海鮮", "焼き物", "煮物", "定食"
                    # 注意: "刺身"は除外（専用のsashimi_flowで処理）
                ],
                "drink": [
                    "ビール", "酒", "飲み物", "アルコール", "日本酒", "焼酎", "ワイン",
                    "ドリンク", "飲みたい", "飲む", "乾杯", "一杯", "お酒", "おさけ"
                ]
            }
            
            # 部分一致チェック
            partial_matches = []
            category_matches = []
            
            for category, keywords in partial_keywords.items():
                for kw in keywords:
                    if kw in last_message:
                        partial_matches.append(f"{category}部分一致: {kw}")
                        category_matches.append(category)
            
            if partial_matches:
                logger.info(f"[Route] 部分一致キーワード検出: {partial_matches}")
                
                # カテゴリに基づくルーティング
                if "bento" in category_matches or "takeout" in category_matches:
                    matched_keywords = ["部分一致検出"]
                elif "drink" in category_matches:
                    return "alcohol_flow"
                elif "food" in category_matches:
                    return "food_flow"
                elif "question" in category_matches:
                    # 質問系の場合は、他のキーワードと組み合わせて判定
                    if any(cat in category_matches for cat in ["bento", "takeout"]):
                        matched_keywords = ["部分一致検出"]
                    elif any(cat in category_matches for cat in ["drink"]):
                        return "alcohol_flow"
                    elif any(cat in category_matches for cat in ["food"]):
                        return "food_flow"
        
        if matched_keywords:
            # 丼系の個別商品（例: 海鮮丼、まぐろ丼 など）は弁当ではなく商品検索へ
            if ("丼" in last_message) and not any(kw in last_message for kw in ["弁当", "テイクアウト", "持ち帰り"]):
                logger.info(f"[Route] 丼系の個別メニュー検出 → general にルーティング")
                return "general"
            logger.info(f"[Route] 弁当/テイクアウトキーワード検出: {matched_keywords}")
            # 選択肢クリックの場合は優先的にoption_clickにルーティング
            if self._is_option_click(last_message):
                logger.info(f"[Route] 選択肢クリック優先 → option_click にルーティング")
                return "option_click"
            else:
                logger.info(f"[Route] → bento_flow にルーティング")
                return "bento_flow"
        else:
            logger.info(f"[Route] 弁当/テイクアウトキーワード未検出")
        
        # お酒・つまみ関連（部分一致対応）
        alcohol_keywords = [
            "ビール", "酒", "飲み物", "アルコール", "つまみ", "おつまみ", "肴",
            "日本酒", "焼酎", "ワイン", "ドリンク", "飲みたい", "飲む", "乾杯", "一杯", "お酒", "おさけ",
            "ビア", "生ビール", "ドラフト", "清酒", "純米酒", "芋焼酎", "麦焼酎", "泡盛"
        ]
        
        # 部分一致でお酒・つまみ関連を検出
        alcohol_matches = [kw for kw in alcohol_keywords if kw in last_message]
        if alcohol_matches:
            logger.info(f"[Route] お酒・つまみキーワード検出: {alcohol_matches}")
            # つまみの場合、コンテキストに記録
            if any(kw in last_message for kw in ["つまみ", "おつまみ", "肴"]):
                if "context" not in state:
                    state["context"] = {}
                state["context"]["show_snacks"] = True
            return "alcohol_flow"
        
        # 寿司・逸品料理などの専門キーワードを優先
        specific_food_keywords = [
            "寿司", "すし", "海鮮", "逸品", "煮込み", "カツ", "かつ", "定食",
            "おまかせ", "盛り合わせ", "餃子", "焼豚", "にら炒め", "天ぷら"
        ]
        
        specific_food_matches = [kw for kw in specific_food_keywords if kw in last_message]
        if specific_food_matches:
            logger.info(f"[Route] 専門キーワード検出: {specific_food_matches}")
            logger.info(f"[Route] '{last_message}' → general にルーティング")
            return "general"  # 会話ノード検索を優先
        
        # 食事・料理関連（部分一致対応）
        food_keywords = [
            "メニュー", "食事", "定食", "見せて", "見たい", "料理", "食べ物", "食べたい",
            "お腹", "おなか", "腹", "はら", "サラダ", "一品", "魚", "肉", "野菜", "海鮮",
            "焼き物", "煮物", "ランチ", "昼食", "夜", "ディナー"
            # 注意: "刺身"は除外（専用のsashimi_flowで処理）
        ]
        
        food_matches = [kw for kw in food_keywords if kw in last_message]
        if food_matches:
            logger.info(f"[Route] 食事・料理キーワード検出: {food_matches}")
            return "food_flow"
        
        # おすすめ関連（部分一致対応）- general_responseの後で処理
        recommend_keywords = [
            "おすすめ", "お勧め", "オススメ", "お薦め", "推奨", "何が", "人気", "一押し", "どれが", "どの",
            "おいしい", "美味しい", "うまい", "旨い", "最高", "ベスト", "イチオシ", "いちおし",
            "何がいい", "どれがいい", "何がおすすめ", "どれがおすすめ", "食べるべき", "頼むべき"
        ]
        
        recommend_matches = [kw for kw in recommend_keywords if self._normalize_text(kw) in normalized_last_message]
        if recommend_matches:
            logger.info(f"[Route] おすすめキーワード検出: {recommend_matches}")
            return "proactive_recommend"
        
        # メニュー質問関連（部分一致対応）
        menu_question_keywords = [
            "ありますか", "ある？", "あるか", "ください", "頼みたい", "注文", "お願い", "教えて",
            "何が", "どんな", "メニュー", "めにゅー", "ラインナップ", "種類", "カテゴリ", "分類",
            "について", "紹介", "案内", "知りたい", "見たい", "見せて", "表示", "確認"
        ]
        
        menu_question_matches = [kw for kw in menu_question_keywords if self._normalize_text(kw) in normalized_last_message]
        if menu_question_matches:
            logger.info(f"[Route] メニュー質問キーワード検出: {menu_question_matches}")
            return "general"
        
        # おすすめ関連キーワードを優先判定（food_keywordsより前に配置）
        recommend_keywords = [
            "おすすめ", "お勧め", "お薦め", "オススメ", "推奨", "人気", "一押し", "イチオシ",
            "おすすめ一品", "おすすめ定食", "おすすめメニュー", "おすすめ料理"
        ]
        recommend_matches = [kw for kw in recommend_keywords if kw in last_message]
        if recommend_matches:
            logger.info(f"[Route] おすすめキーワード検出: {recommend_matches}")
            return "proactive_recommend"
        
        # 食事・料理関連（部分一致対応）- 寿司は除外（上で処理済み）
        food_keywords = [
            "メニュー", "めにゅー", "食事", "定食", "ていしょく", "セット", "せっと",
            "見せて", "見たい", "料理", "りょうり", "食べ物", "食べたい",
            "お腹", "おなか", "腹", "はら", "空いた", "減った",
            "サラダ", "一品", "魚", "さかな", "肉", "にく", "野菜", "やさい", "海鮮", "かいせん",
            "刺身", "さしみ", "焼き物", "煮物", "揚げ物", "ランチ", "らんち", "昼食", "お昼", "夜", "よる", "ディナー", "でぃなー"
        ]
        
        food_matches = [kw for kw in food_keywords if self._normalize_text(kw) in normalized_last_message]
        if food_matches:
            logger.info(f"[Route] 食事・料理キーワード検出: {food_matches}")
            return "food_flow"
        
        # 土曜日限定ランチ
        if "土曜日限定ランチ" in last_message:
            return "option_click"
        
        # 包括的なフォールバック検索（最後の手段）
        logger.info(f"[Route] 包括的フォールバック検索を実行")
        
        # 一般的な質問パターン
        general_question_patterns = [
            "何", "どんな", "どう", "どの", "いつ", "どこ", "なぜ", "なぜ", "どうして",
            "教えて", "知りたい", "聞きたい", "説明", "案内", "紹介", "見せて", "見たい",
            "ありますか", "ある？", "ください", "お願い", "頼みたい", "注文", "食べたい", "飲みたい"
        ]
        
        # メニュー関連の一般的なキーワード
        general_menu_keywords = [
            "メニュー", "料理", "食べ物", "食事", "飲み物", "お酒", "つまみ", "おかず",
            "ランチ", "昼食", "夜", "ディナー", "定食", "セット", "一品", "サラダ",
            "魚", "肉", "野菜", "海鮮", "寿司", "刺身", "焼き物", "煮物", "唐揚げ", "カツ"
        ]
        
        # フォールバック検索
        fallback_matches = []
        for pattern in general_question_patterns:
            if pattern in last_message:
                fallback_matches.append(f"質問パターン: {pattern}")
        
        for keyword in general_menu_keywords:
            if keyword in last_message:
                fallback_matches.append(f"メニューキーワード: {keyword}")
        
        if fallback_matches:
            logger.info(f"[Route] フォールバック検索結果: {fallback_matches}")
            return "general"
        
        # 完全にマッチしない場合でも、何らかの応答を返す
        logger.info(f"[Route] 完全にマッチしない質問: '{last_message}' → general")
        return "general"
    
    # --- ヘルパー関数 ---
    
    def _add_order_instruction(self, response_text: str) -> str:
        """
        メニュー説明文に注文方法の案内を追加
        
        Args:
            response_text: 元のレスポンステキスト
        
        Returns:
            注文案内を追加したテキスト
        """
        if not response_text:
            return response_text
        
        # 既に注文案内が含まれている場合はスキップ
        if "注文タッチパネル" in response_text or "スタッフまで" in response_text:
            return response_text
        
        # 末尾に注文案内を追加
        order_instruction = "\n\nご注文は注文タッチパネル、またはスタッフまでお気軽にどうぞ。"
        return response_text + order_instruction
    
    def _add_cross_sell_text(self, response_text: str, node_id: str = None) -> str:
        """
        馬刺し赤身へのクロスセール文言を追加
        
        Args:
            response_text: 元のレスポンステキスト
            node_id: ノードID（対象ノード判定用）
        
        Returns:
            クロスセール文言を追加したテキスト
        """
        if not response_text:
            return response_text
        
        # 対象ノードのIDリスト
        target_node_ids = [
            "chicken_kushi_katsu_2",
            "pork_kushi_katsu_2", 
            "tako_karaage",
            "kasago_karaage_numazu",
            "aji_fry_3"
        ]
        
        # 対象ノードでない場合はそのまま返す
        if node_id not in target_node_ids:
            return response_text
        
        # クロスセール文言
        cross_sell_text = "熊本県直送の馬刺し赤身もご一緒にいかがですか？"
        
        # 既に文言が含まれている場合はスキップ
        if cross_sell_text in response_text:
            return response_text
        
        # 文末の句読点を統一してから追加
        if response_text.endswith("。") or response_text.endswith("！"):
            response_text = response_text.rstrip("。！")
        
        # クロスセール文言を追加
        response_text += f" {cross_sell_text}"
        
        # 終端の案内を統一
        if not any(response_text.endswith(p) for p in ["？", "?", "。", "！"]):
            response_text += "どちらにされますか？"
        
        return response_text
    
    def _should_add_basashi_button(self, selected_option: str) -> bool:
        """
        馬刺し赤身ボタンを追加するかどうかを判定
        
        Args:
            selected_option: 選択されたオプション
        
        Returns:
            ボタンを追加するかどうか
        """
        # 対象ノードのIDリスト
        target_node_ids = [
            "chicken_kushi_katsu_2",
            "pork_kushi_katsu_2", 
            "tako_karaage",
            "kasago_karaage_numazu",
            "aji_fry_3"
        ]
        
        # 対象ノードの場合は馬刺し赤身ボタンを追加
        return selected_option in target_node_ids
    
    def _normalize_text(self, text: str) -> str:
        """
        テキストを正規化（NFKC、全角半角・かなカナ統一、句読点統一、表記ゆれ対応）
        
        Args:
            text: 正規化するテキスト
        
        Returns:
            正規化されたテキスト
        """
        if not text:
            return text
        
        import unicodedata
        import re
        
        # NFKC正規化
        text = unicodedata.normalize('NFKC', text)
        
        # 全角半角統一
        text = text.replace('，', ',').replace('。', '.').replace('？', '?').replace('！', '!')
        
        # カタカナをひらがなに統一（より広範囲に）
        katakana_to_hiragana = str.maketrans(
            'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォャュョッ',
            'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉゃゅょっ'
        )
        text = text.translate(katakana_to_hiragana)
        
        # 句読点統一（, を採用）
        text = re.sub(r'[,，、]', ',', text)
        
        # スペース・記号の除去（柔軟なマッチングのため）
        text = text.replace(' ', '').replace('　', '').replace('-', '').replace('・', '')
        
        return text
    
    def _expand_keywords(self, keywords: List[str]) -> List[str]:
        """
        キーワードを拡張（表記ゆれ、類義語、短縮形を追加）
        
        Args:
            keywords: 元のキーワードリスト
        
        Returns:
            拡張されたキーワードリスト
        """
        expanded = list(keywords)  # コピー
        
        # 表記ゆれマッピング（より広範囲に）
        variations = {
            # 定食関連
            "定食": ["ていしょく", "セット", "せっと"],
            "おすすめ定食": ["おすすめ", "おすすめセット", "お勧め定食", "お薦め定食", "推奨定食", "人気定食"],
            "日替わり": ["日替わりランチ", "本日の定食", "今日の定食", "デイリー"],
            
            # 刺身関連
            "刺身": ["さしみ", "お刺身", "刺し身", "造り", "お造り"],
            "海鮮刺身": ["海鮮", "かいせん", "海の幸", "魚介"],
            
            # 丼物関連
            "丼": ["どんぶり", "どん", "丼物", "ライス"],
            "海鮮丼": ["かいせん丼", "海の幸丼", "魚介丼"],
            
            # 寿司関連
            "寿司": ["すし", "お寿司", "にぎり", "握り", "鮨", "鮓"],
            "寿司ランチ": ["すしランチ", "寿司セット", "寿司定食", "にぎりランチ"],
            
            # 揚げ物関連
            "揚げ物": ["あげもの", "フライ", "揚物"],
            "唐揚げ": ["からあげ", "から揚げ", "空揚げ", "竜田揚げ"],
            "天ぷら": ["てんぷら", "天麩羅", "天婦羅"],
            
            # ドリンク関連
            "ドリンク": ["飲み物", "のみもの", "お飲物", "ドリンクメニュー", "飲料"],
            "お酒": ["酒", "さけ", "アルコール", "日本酒", "焼酎", "ビール"],
            "ビール": ["びーる", "生ビール", "生", "draft"],
            
            # その他
            "メニュー": ["めにゅー", "品書き", "お品書き", "料理", "食事"],
            "ランチ": ["らんち", "昼食", "お昼", "lunch"],
            "予約": ["よやく", "reservation", "予約したい", "席を取りたい"],
            "店舗情報": ["店の情報", "お店の情報", "営業時間", "場所", "アクセス", "住所", "電話番号"],
            "テイクアウト": ["持ち帰り", "お持ち帰り", "弁当", "お弁当"],
            
            # 魚名
            "まぐろ": ["マグロ", "鮪", "tuna"],
            "サーモン": ["さーもん", "鮭", "しゃけ", "salmon"],
            "鯛": ["たい", "タイ", "真鯛"],
            "あじ": ["アジ", "鯵", "あじ刺", "アジ刺"],
            "いか": ["イカ", "烏賊"],
            "ぶり": ["ブリ", "鰤"],
        }
        
        # キーワードごとに拡張
        for keyword in keywords:
            if keyword in variations:
                for variant in variations[keyword]:
                    if variant not in expanded:
                        expanded.append(variant)
        
        return expanded
    
    def _apply_recommended_tone(self, response_text: str, node_data: Dict[str, Any]) -> str:
        """
        推しトーンを適用
        
        Args:
            response_text: 元のレスポンステキスト
            node_data: ノードデータ
        
        Returns:
            推しトーンを適用したテキスト
        """
        if not response_text:
            return response_text
        
        node_id = node_data.get("id", "")
        priority = node_data.get("priority", 999)
        
        # 推し3品（優先度1の逸品料理）
        recommended_3_items = ["nikomi_katsu", "homemade_chashu", "buta_nira_itame"]
        
        # お酒のつまみ推し
        recommended_snacks = ["gyoza_5", "gyoza_15", "sakura_ebi_kakiage", "ika_ninniku_me_itame"]
        
        # 推しトーンの文言
        recommended_tone = "少しボリュームありますが、満足の一皿です。"
        
        # 既に推しトーンが含まれている場合はスキップ
        if recommended_tone in response_text:
            return response_text
        
        # 推し3品の場合
        if node_id in recommended_3_items and priority == 1:
            if not response_text.endswith("。"):
                response_text = response_text.rstrip("。！？")
            response_text += f" {recommended_tone}"
        
        # お酒のつまみ推しの場合
        elif node_id in recommended_snacks:
            if not response_text.endswith("。"):
                response_text = response_text.rstrip("。！？")
            response_text += f" {recommended_tone}"
        
        return response_text
    
    def _add_recommended_3_items(self, response_text: str) -> str:
        """
        推し3品の推薦文を追加
        
        Args:
            response_text: 元のレスポンステキスト
        
        Returns:
            推し3品の推薦文を追加したテキスト
        """
        if not response_text:
            return response_text
        
        # 推し3品の推薦文
        recommended_text = "\n\n【推し3品】\n• 煮込みカツ　付 - 少しボリュームありますが、満足の一皿です。\n• 自家製焼豚 - 少しボリュームありますが、満足の一皿です。\n• 豚ニラ炒め - 少しボリュームありますが、満足の一皿です。"
        
        # 既に推し3品の推薦文が含まれている場合はスキップ
        if "【推し3品】" in response_text:
            return response_text
        
        # 推し3品の推薦文を追加
        response_text += recommended_text
        
        return response_text
    
    def _normalize_teishoku_text(self, response_text: str, node_data: Dict[str, Any]) -> str:
        """
        定食屋メニューの本文整形フック
        
        Args:
            response_text: 元のレスポンステキスト
            node_data: ノードデータ
        
        Returns:
            整形されたテキスト
        """
        if not response_text:
            return response_text
        
        node_id = node_data.get("id", "")
        
        # 看板4品のキャッチコピー
        brand_items = [
            "teishoku_nikomi_katsu",
            "teishoku_otsuki_yakiniku", 
            "don_katsudon",
            "teishoku_buta_nira"
        ]
        
        catch_phrase = "この店の一番の売りの商品はこれ！！"
        
        # 看板4品の場合、キャッチコピーを先頭に追加
        if node_id in brand_items and not response_text.startswith(catch_phrase):
            response_text = f"{catch_phrase} {response_text}"
        
        # 文末トーン統一
        if not response_text.endswith("？") and not response_text.endswith("?"):
            if not response_text.endswith("。"):
                response_text += "。"
            response_text += "どちらにされますか？"
        
        return response_text
    
    def _add_pinned_teishoku_items(self, options: List[str], node_data: Dict[str, Any]) -> List[str]:
        """
        定食屋メニューの看板4品をピン留め
        
        Args:
            options: 選択肢のリスト
            node_data: ノードデータ
        
        Returns:
            看板4品をピン留めした選択肢のリスト
        """
        if not options:
            return options
        
        node_id = node_data.get("id", "")
        
        # 定食メニュー確認ノードの場合のみピン留めを適用
        if node_id != "teishoku_overview":
            return options
        
        # 看板4品（ピン留め順）
        pinned_items = [
            "煮込みカツ定食",
            "元祖おおつき焼肉定食", 
            "かつ丼",
            "豚にら炒め定食"
        ]
        
        # ピン留めアイテムを先頭に移動
        pinned_options = []
        other_options = []
        
        for option in options:
            if option in pinned_items:
                pinned_options.append(option)
            else:
                other_options.append(option)
        
        # ピン留め順で並べる
        arranged_pinned = []
        for pinned_item in pinned_items:
            if pinned_item in pinned_options:
                arranged_pinned.append(pinned_item)
        
        # ピン留め + その他の順で並べる
        final_options = []
        final_options.extend(arranged_pinned)
        final_options.extend(other_options)
        
        return final_options
    
    def _should_add_cross_sell_text_for_node(self, node_data: Dict[str, Any]) -> bool:
        """
        ノードに対してクロスセール文言を追加するかどうかを判定
        
        Args:
            node_data: ノードデータ
        
        Returns:
            クロスセール文言を追加するかどうか
        """
        node_id = node_data.get("id", "")
        subcategory = node_data.get("subcategory", "")
        next_nodes = node_data.get("next", [])
        
        # 対象ノードのIDリスト（拡張版）
        target_node_ids = [
            "chicken_kushi_katsu_2",
            "pork_kushi_katsu_2", 
            "tako_karaage",
            "kasago_karaage_numazu",
            "aji_fry_3",
            # 推し3品
            "nikomi_katsu",
            "homemade_chashu", 
            "buta_nira_itame",
            # お酒のつまみ推し
            "gyoza_5",
            "gyoza_15",
            "sakura_ebi_kakiage",
            "ika_ninniku_me_itame",
            # 定食屋メニュー看板4品
            "teishoku_nikomi_katsu",
            "teishoku_otsuki_yakiniku",
            "don_katsudon",
            "teishoku_buta_nira"
        ]
        
        # 対象ノードまたは遷移先にbasashi_akamiが含まれる場合
        return (node_id in target_node_ids or 
                "basashi_akami" in next_nodes or
                subcategory in ["今晩のおすすめ一品", "揚げ物・酒のつまみ", "寿司", "寿司盛り合わせ", "逸品料理", "定食", "どんぶり", "麺類", "小鉢・つまみ", "期間限定", "特別メニュー", "海鮮刺身", "海鮮定食メニュー", "刺身・盛り合わせ", "おすすめ定食"])
    
    def _sort_options_by_priority(self, options: List[str]) -> List[str]:
        """
        選択肢を優先度でソート
        
        Args:
            options: 選択肢のリスト
        
        Returns:
            ソートされた選択肢のリスト
        """
        if not self.conversation_system:
            return options
        
        try:
            # 各選択肢の優先度を取得
            option_priorities = []
            for option in options:
                priority = 999  # デフォルト優先度
                category_priority = 999
                
                # 会話ノードから優先度を取得
                conversation_nodes = self.conversation_system.get_conversation_nodes()
                for node_id, node_data in conversation_nodes.items():
                    node_name = node_data.get("name", "")
                    if option == node_name or option == node_id:
                        # 優先度がNoneの場合はデフォルト値を使用
                        priority_raw = node_data.get("priority")
                        priority = priority_raw if priority_raw is not None else 999
                        category = node_data.get("category", "")
                        
                        # カテゴリ優先順位
                        category_priorities = {
                            "基本確認": 1,
                            "料理系": 2,
                            "情報確認": 3,
                            "サポート": 4
                        }
                        category_priority = category_priorities.get(category, 999)
                        break
                
                option_priorities.append((option, priority, category_priority))
            
            # 優先度（数値昇順）→ カテゴリ優先順位でソート
            option_priorities.sort(key=lambda x: (x[1], x[2]))
            
            return [option for option, _, _ in option_priorities]
            
        except Exception as e:
            logger.error(f"選択肢ソートエラー: {e}")
            return options
    
    def _add_seafood_text_decorations(self, response_text: str, node_data: Dict[str, Any]) -> str:
        """
        海鮮系ノードのテキスト装飾（馬刺し横断と天ぷら推奨）
        
        Args:
            response_text: 元のレスポンステキスト
            node_data: ノードデータ
        
        Returns:
            装飾されたテキスト
        """
        if not response_text:
            return response_text
        
        subcategory = node_data.get("subcategory", "")
        
        # 馬刺し横断文言（海鮮刺身・海鮮定食メニュー）
        sashimi_promo = "当店では、海鮮刺身以外にも、熊本直送の馬刺し刺身もおすすめです！"
        
        # 天ぷら推奨文言（刺身・盛り合わせ系）
        tempura_promo = "刺身に天ぷら盛り合わせはいかがでしょうか？野菜や鮮魚の天ぷらがお刺身とよく合います"
        
        # 文末トーン統一
        ending = "どちらにされますか？"
        
        is_seafood = subcategory in ["海鮮刺身", "海鮮定食メニュー"]
        is_sashimi = subcategory in ["海鮮刺身", "刺身・盛り合わせ"]
        
        # 馬刺し横断文言を追加（海鮮系全般、未重複時のみ）
        if is_seafood and sashimi_promo not in response_text:
            if response_text.endswith("。"):
                response_text += f" {sashimi_promo}"
            else:
                response_text += f"。{sashimi_promo}"
        
        # 天ぷら推奨文言を追加（刺身系、未重複時のみ）
        if is_sashimi and tempura_promo not in response_text:
            if response_text.endswith("。"):
                response_text += f" {tempura_promo}"
            else:
                response_text += f"。{tempura_promo}"
        
        # 文末トーン統一
        if not response_text.endswith("？") and not response_text.endswith("?"):
            if not response_text.endswith("。"):
                response_text += "。"
            response_text += ending
        
        return response_text
    
    def _add_recommended_teishoku_text_decorations(self, response_text: str, node_data: Dict[str, Any]) -> str:
        """
        おすすめ定食ノードのテキスト装飾（キャッチコピーと文末統一）
        
        Args:
            response_text: 元のレスポンステキスト
            node_data: ノードデータ
        
        Returns:
            装飾されたテキスト
        """
        if not response_text:
            return response_text
        
        node_id = node_data.get("id", "")
        
        # おすすめ定食トップのキャッチコピー
        catch_phrase = "おおつきの刺身セット定食で人気６選です！"
        
        # おすすめ定食トップの場合のみキャッチコピーを追加
        if node_id == "osusume_teishoku_overview" and catch_phrase not in response_text:
            response_text = f"{catch_phrase} {response_text}"
        
        # 文末トーン統一
        if not response_text.endswith("？") and not response_text.endswith("?"):
            if not response_text.endswith("。"):
                response_text += "。"
            response_text += "どちらにされますか？"
        
        return response_text
    
    def _find_node_by_keywords(self, user_input: str, conversation_nodes: Dict[str, Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        キーワードマッチングによる柔軟なノード検索（拡張版）
        
        【スコアリングロジック】
        - 優先度: 数字が小さいほど高スコア（priority=1が最優先）
        - キーワードマッチ: 一致数・文字数に応じて加点
        - 長いキーワード: より長い一致を優遇
        
        Args:
            user_input: ユーザーの入力
            conversation_nodes: 会話ノードの辞書
        
        Returns:
            マッチしたノードデータ（なければNone）
        """
        if not conversation_nodes:
            return None
        
        # ユーザー入力を正規化
        normalized_input = self._normalize_text(user_input.lower())
        
        best_match = None
        best_score = 0  # 0から開始して、マッチしたものだけが正のスコアを得る
        
        # デバッグ用のスコア詳細を保持
        debug_scores = {}
        
        for node_id, node_data in conversation_nodes.items():
            node_name = node_data.get("name", "")
            keywords = node_data.get("keywords", [])
            subcategory = node_data.get("subcategory", "")
            priority = node_data.get("priority", 99)
            implementation_class = node_data.get("implementation_class", "")
            
            # キーワードを拡張（表記ゆれ、類義語を追加）
            expanded_keywords = self._expand_keywords(keywords)
            
            score = 0
            matched_keywords_count = 0
            matched_chars = 0
            longest_matched_keyword_length = 0
            
            # ノード名での完全一致（最高優先度）
            normalized_node_name = self._normalize_text(node_name.lower())
            if normalized_node_name in normalized_input or normalized_input in normalized_node_name:
                score += 100
            
            # ノード名での部分一致（中程度の優先度）
            node_name_words = normalized_node_name.split()
            for word in node_name_words:
                if word and len(word) >= 2:  # 2文字以上の単語のみ
                    if word in normalized_input:
                        score += 30
            
            # 拡張キーワードでの部分一致（柔軟なマッチング）
            for keyword in expanded_keywords:
                normalized_keyword = self._normalize_text(keyword.lower())
                
                # 完全一致
                if normalized_keyword == normalized_input or normalized_input == normalized_keyword:
                    score += 50
                    matched_keywords_count += 1
                    matched_chars += len(normalized_keyword)
                    longest_matched_keyword_length = max(longest_matched_keyword_length, len(normalized_keyword))
                # 部分一致（キーワードが入力に含まれる）
                elif normalized_keyword in normalized_input:
                    score += 25
                    matched_keywords_count += 1
                    matched_chars += len(normalized_keyword)
                    longest_matched_keyword_length = max(longest_matched_keyword_length, len(normalized_keyword))
                # 部分一致（入力がキーワードに含まれる）
                elif normalized_input in normalized_keyword and len(normalized_input) >= 2:
                    score += 20
                    matched_keywords_count += 1
                    matched_chars += len(normalized_input)
                    longest_matched_keyword_length = max(longest_matched_keyword_length, len(normalized_input))
            
            # サブカテゴリでの一致
            if subcategory:
                normalized_subcategory = self._normalize_text(subcategory.lower())
                if normalized_subcategory in normalized_input or normalized_input in normalized_subcategory:
                    score += 15
            
            # 「忘年会」専用ノードへの特別処理
            # 「忘年会」「年末の宴会」「忘年会プラン」などが含まれる場合のみ有効化
            bonenkai_bonus = 0
            has_bonenkai_keyword = False
            bonenkai_keywords = [
                "忘年会", "忘新年会", "会社の忘年会", "職場の忘年会", 
                "忘年会プラン", "忘年会メニュー", "忘年会コース",
                "年末の宴会", "年末飲み会", "年末"  # 「年末」関連を追加
            ]
            
            # ユーザー入力に「忘年会」系キーワードが含まれているかチェック
            for bonenkai_kw in bonenkai_keywords:
                normalized_bonenkai_kw = self._normalize_text(bonenkai_kw.lower())
                if normalized_bonenkai_kw in normalized_input:
                    has_bonenkai_keyword = True
                    break
            
            # bonenkai_introノードの特別処理
            if node_id == "bonenkai_intro":
                if has_bonenkai_keyword:
                    # 「忘年会」が含まれる場合は大幅加点
                    bonenkai_bonus = 100
                else:
                    # 「忘年会」が含まれない場合は、このノードを無効化（大幅減点）
                    score -= 1000
            
            # 「おせち・年末料理」専用ノードへの特別処理
            # おせち関連キーワードが含まれる場合、osechi_infoノードを最優先にする
            osechi_bonus = 0
            has_osechi_keyword = False
            osechi_keywords = [
                "おせち", "お節", "おせち料理", "正月料理", "おせち予約", 
                "おせち注文", "おせちいつまで", "おせち受け取り",
                "年末料理", "年末オードブル", "年末オードブル予約"
            ]
            
            # ユーザー入力におせち系キーワードが含まれているかチェック
            # ただし「オードブル」単独は除外（「年末オードブル」は含める）
            # 「オードブル」単独の場合は除外するためのフラグ
            is_ordoruburu_only = False
            if "オードブル" in normalized_input:
                # 「年末オードブル」や「年末オードブル予約」が含まれているかチェック
                if "年末オードブル" not in normalized_input:
                    # 「オードブル」単独の場合は、おせちキーワードチェックをスキップ
                    is_ordoruburu_only = True
            
            if not is_ordoruburu_only:
                for osechi_kw in osechi_keywords:
                    normalized_osechi_kw = self._normalize_text(osechi_kw.lower())
                    if normalized_osechi_kw in normalized_input:
                        has_osechi_keyword = True
                        break
            
            # osechi_infoノードの特別処理
            if node_id == "osechi_info":
                if has_osechi_keyword:
                    # おせち関連キーワードが含まれる場合は大幅加点（最優先）
                    osechi_bonus = 200  # 忘年会より高いボーナスで最優先にする
                else:
                    # おせち関連キーワードが含まれない場合は、このノードを無効化（大幅減点）
                    score -= 1000
            
            # 優先度による加点（優先度が高いほど加点）
            # priority: 1〜5 の場合、1が最も高スコアになるように
            # priorityがNoneの場合は99とする
            # ただし、「忘年会」または「おせち」専用ボーナスがある場合は優先度の差を小さくする
            priority_value = priority if priority is not None else 99
            if bonenkai_bonus > 0 or osechi_bonus > 0:
                # 忘年会またはおせちボーナスがある場合は優先度の重みを小さくする
                priority_bonus = (10 - priority_value) * 2
            else:
                # 通常時は優先度の重みを控えめに
                priority_bonus = (10 - priority_value) * 3
            score += priority_bonus
            score += bonenkai_bonus
            score += osechi_bonus
            
            # 長いキーワード優遇（より具体的なマッチを優先）
            if longest_matched_keyword_length > 0:
                score += longest_matched_keyword_length * 3  # より具体的な一致を強く優遇
            
            # 実装クラスによる小さな補正（最小限）
            # BanquetEntryNodeなど特定クラスへの過度な優遇を避ける
            if implementation_class == 'BanquetEntryNode':
                score += 5  # banquet_entryを「宴会」発話時に選ばれやすくする
            
            # デバッグ情報を保存
            debug_scores[node_name] = {
                'score': score,
                'priority': priority_value,
                'priority_bonus': priority_bonus,
                'matched_keywords_count': matched_keywords_count,
                'matched_chars': matched_chars,
                'longest_matched': longest_matched_keyword_length
            }
            
            # スコアが最も高いノードを選択
            if score > best_score:
                best_score = score
                best_match = node_data
        
        # スコアが閾値以上の場合は返す
        if best_score > 0:  # 何かしらマッチした場合
            matched_name = best_match.get('name', '不明')
            logger.info(f"[KeywordMatch] ノード検索: '{user_input}' → {matched_name} (スコア: {best_score})")
            logger.debug(f"[KeywordMatch] スコア詳細: {debug_scores.get(matched_name, {})}")
            return best_match
        
        logger.debug(f"[KeywordMatch] マッチなし: '{user_input}' (最高スコア: {best_score})")
        return None
    
    def _arrange_recommended_teishoku_buttons(self, options: List[str], node_data: Dict[str, Any]) -> List[str]:
        """
        おすすめ定食のボタン並び替え（人気6選を上段固定）
        
        Args:
            options: 選択肢のリスト
            node_data: ノードデータ
        
        Returns:
            並び替えられた選択肢のリスト
        """
        if not options:
            return options
        
        node_id = node_data.get("id", "")
        
        # 人気6選（固定順序）
        popular_6_items = [
            "刺身・カキフライセット定食",
            "刺身アジフライセット定食",
            "刺身オレンジチキンセット定食",
            "刺身タレ焼肉セット定食",
            "刺身生姜焼き肉定食",
            "刺身餃子10個セット定食"
        ]
        
        # 横断導線
        cross_sell_items = [
            "今晩のおすすめ一品 確認",
            "揚げ物・酒つまみ 確認"
        ]
        
        # おすすめ定食トップの場合
        if node_id == "osusume_teishoku_overview":
            # カテゴリ別に分類
            popular_buttons = []
            cross_sell_buttons = []
            other_buttons = []
            
            for option in options:
                if option in popular_6_items:
                    popular_buttons.append(option)
                elif option in cross_sell_items:
                    cross_sell_buttons.append(option)
                else:
                    other_buttons.append(option)
            
            # 人気6選を指定順序で並べる
            arranged_popular = []
            for item in popular_6_items:
                if item in popular_buttons:
                    arranged_popular.append(item)
            
            # その他をタイトル昇順でソート
            other_buttons.sort()
            
            # 横断導線を指定順序で並べる
            arranged_cross_sell = []
            for item in cross_sell_items:
                if item in cross_sell_buttons:
                    arranged_cross_sell.append(item)
            
            # 最終的な並び：人気6選 → 横断導線 → その他
            arranged_options = []
            arranged_options.extend(arranged_popular)
            arranged_options.extend(arranged_cross_sell)
            arranged_options.extend(other_buttons)
            
            return arranged_options
        
        # 各おすすめ定食詳細の場合
        else:
            # カテゴリ別に分類
            popular_buttons = []
            cross_sell_buttons = []
            other_buttons = []
            
            for option in options:
                if option in popular_6_items:
                    popular_buttons.append(option)
                elif option in cross_sell_items:
                    cross_sell_buttons.append(option)
                else:
                    other_buttons.append(option)
            
            # 横断導線を先頭に配置
            arranged_cross_sell = []
            for item in cross_sell_items:
                if item in cross_sell_buttons:
                    arranged_cross_sell.append(item)
            
            # その他をタイトル昇順でソート
            other_buttons.sort()
            
            # 最終的な並び：横断導線 → 人気6選 → その他
            arranged_options = []
            arranged_options.extend(arranged_cross_sell)
            arranged_options.extend(popular_buttons)
            arranged_options.extend(other_buttons)
            
            return arranged_options
    
    def _arrange_buttons_by_priority(self, options: List[str], node_data: Dict[str, Any]) -> List[str]:
        """
        ボタンの並び順を「天ぷら→馬刺し赤身→確認系→近縁」で安定化
        
        Args:
            options: 選択肢のリスト
            node_data: ノードデータ
        
        Returns:
            並び順を安定化した選択肢のリスト
        """
        if not options:
            return options
        
        subcategory = node_data.get("subcategory", "")
        
        # 天ぷらメニュー（刺身系では最優先）
        tempura_items = ["天ぷらメニュー確認", "天ぷら盛り合わせ"]
        
        # 揚げ物（エビフライ、アジフライ）
        fry_items = ["エビフライ", "アジフライ"]
        
        # 推し3品
        recommended_3_items = ["煮込みカツ　付", "自家製焼豚", "豚ニラ炒め"]
        
        # 馬刺し赤身
        basashi_item = "馬刺し赤身"
        
        # 確認系
        confirmation_items = [
            "今晩のおすすめ一品 確認",
            "揚げ物・酒つまみ 確認", 
            "焼き鳥メニュー確認"
        ]
        
        # カテゴリ別に分類
        tempura_buttons = []
        fry_buttons = []
        recommended_buttons = []
        basashi_buttons = []
        confirmation_buttons = []
        other_buttons = []
        
        for option in options:
            if option in tempura_items:
                tempura_buttons.append(option)
            elif option in fry_items:
                fry_buttons.append(option)
            elif option in recommended_3_items:
                recommended_buttons.append(option)
            elif option == basashi_item:
                basashi_buttons.append(option)
            elif option in confirmation_items:
                confirmation_buttons.append(option)
            else:
                other_buttons.append(option)
        
        # 海鮮系では「天ぷら→揚げ物→馬刺し→確認系→近縁」の順
        # その他では「推し→馬刺し→確認系→近縁」の順
        arranged_options = []
        if subcategory in ["海鮮刺身", "海鮮定食メニュー", "刺身・盛り合わせ"]:
            arranged_options.extend(tempura_buttons)
            arranged_options.extend(fry_buttons)
            arranged_options.extend(basashi_buttons)
            arranged_options.extend(confirmation_buttons)
            arranged_options.extend(recommended_buttons)
            arranged_options.extend(other_buttons)
        else:
            arranged_options.extend(recommended_buttons)
            arranged_options.extend(basashi_buttons)
            arranged_options.extend(confirmation_buttons)
            arranged_options.extend(other_buttons)
        
        return arranged_options
    
    def _arrange_sushi_buttons(self, options: List[str], node_data: Dict[str, Any]) -> List[str]:
        """
        寿司ノードのボタンを並び替え: おまかせ6貫/10貫/12貫を先頭に配置
        
        Args:
            options: 選択肢のリスト
            node_data: ノードデータ
        
        Returns:
            並び替えた選択肢のリスト
        """
        if not options:
            return options
        
        # おまかせ寿司
        omakase_items = ["おまかせ6貫寿司", "おまかせ10貫寿司", "うにいくら入り12貫盛り"]
        
        # 主要ネタ
        major_items = ["まぐろ", "サーモン", "海老"]
        
        # 確認系
        confirmation_items = [
            "今晩のおすすめ一品 確認",
            "揚げ物・酒つまみ 確認"
        ]
        
        # カテゴリ別に分類
        omakase_buttons = []
        major_buttons = []
        confirmation_buttons = []
        other_buttons = []
        
        for option in options:
            if option in omakase_items:
                omakase_buttons.append(option)
            elif option in major_items:
                major_buttons.append(option)
            elif option in confirmation_items:
                confirmation_buttons.append(option)
            else:
                other_buttons.append(option)
        
        # おまかせを順序通りに並べる
        omakase_ordered = []
        for target in omakase_items:
            if target in omakase_buttons:
                omakase_ordered.append(target)
        
        # 最終的な並び: おまかせ → 主要ネタ → その他 → 確認系
        arranged_options = []
        arranged_options.extend(omakase_ordered)
        arranged_options.extend(major_buttons)
        arranged_options.extend(other_buttons)
        arranged_options.extend(confirmation_buttons)
        
        return arranged_options
    
    def _fetch_fried_food_menus(self) -> List[Dict[str, Any]]:
        """揚げ物系メニューをまとめて取得"""
        if not self.notion_client or not self.config:
            return []
        menu_db_id = self.config.get("notion.database_ids.menu_db")
        if not menu_db_id:
            return []
        fried_categories = [
            ("Subcategory", "揚げ物・酒のつまみ"),
            ("Subcategory", "揚げ物　酒のつまみ"),
        ]
        collected: Dict[str, Dict[str, Any]] = {}
        for category_property, category_value in fried_categories:
            try:
                logger.info(f"[Fried] サブカテゴリ検索: {category_value}")
                menus = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property=category_property,
                    category_value=category_value,
                    limit=20
                )
                logger.info(f"[Fried] {category_value}: {len(menus)}件取得")
            except Exception as e:
                logger.error(f"[Fried] メニュー取得エラー ({category_value}): {e}")
                menus = []
            for menu in menus:
                name = menu.get("name")
                if not name:
                    continue
                if name not in collected:
                    collected[name] = menu
        logger.info(f"[Fried] 合計取得メニュー数: {len(collected)}件")
        sorted_menus = sorted(
            collected.values(),
            key=lambda item: (
                item.get("priority", 999) if item.get("priority") is not None else 999,
                item.get("name", "")
            )
        )
        return sorted_menus

    def _format_fried_food_response(self, menus: List[Dict[str, Any]]) -> Tuple[str, List[Dict[str, Any]]]:
        """揚げ物メニューの表示テキストと残りリストを生成"""
        if not menus:
            return ("申し訳ございません。揚げ物メニューが見つかりませんでした。", [])
        initial = menus[:5]
        remaining = menus[5:]
        title = "🍤 **揚げ物メニュー（おすすめ5品）**" if len(initial) >= 5 else "🍤 **揚げ物メニュー**"
        lines: List[str] = [title, ""]
        for menu in initial:
            name = menu.get("name", "メニュー名不明")
            price = menu.get("price", 0)
            short_desc = menu.get("short_desc", "")
            price_text = ""
            if isinstance(price, (int, float)) and price > 0:
                price_text = f" ¥{int(price):,}"
            lines.append(f"• **{name}**{price_text}")
            if short_desc:
                lines.append(f"  {short_desc}")
            lines.append("")
        if remaining:
            lines.append("その他の揚げ物は『その他はこちらです』のタブからご覧いただけます。")
        return ("\n".join(lines).strip(), remaining)

    def _collect_context(self, state: State) -> Dict[str, Any]:
        """コンテキスト収集"""
        hour = datetime.now().hour
        month = datetime.now().month
        
        # 時間帯判定
        if 11 <= hour < 14:
            # ランチタイム（11-14時）
            time_zone = "lunch"
        elif 14 <= hour < 24 or 0 <= hour < 11:
            # 夜の時間帯（14時以降、または朝～11時前）- せんべろセット表示
            time_zone = "dinner"
        else:
            time_zone = "other"
        
        # 季節
        if month in [3, 4, 5]:
            season = "春"
        elif month in [6, 7, 8]:
            season = "夏"
        elif month in [9, 10, 11]:
            season = "秋"
        else:
            season = "冬"
        
        return {
            "time_zone": time_zone,
            "season": season,
            "hour": hour,
            "month": month,
            "trigger": state.get("context", {}).get("trigger", "user")
        }

    def _update_time_context(self, state: State) -> Dict[str, Any]:
        """既存コンテキストに時間情報をマージして返す"""
        existing_context = state.get("context") or {}
        time_context = self._collect_context(state)
        merged_context = {**existing_context, **time_context}
        state["context"] = merged_context
        return merged_context
    
    def _is_option_click(self, message: str) -> bool:
        """選択肢ボタンクリック判定"""
        # 「（続きを見る）」と「（続きはこちら）」を含むメッセージは選択肢クリックとして認識
        if "（続きを見る）" in message or "（続きはこちら）" in message:
            logger.info(f"[Route] 続きを見る/続きはこちらを選択肢として認識: '{message}'")
            return True
        
        option_list = [
            # 新しい挨拶選択肢
            "ランチ", "夜メニュー", "土曜日限定ランチ",
            # 夜の時間帯専用選択肢
            "ドリンクメニュー", "せんべろセット",
            # 既存選択肢
            "ビールください", "食事メニュー見せて", "おすすめは？",
            "ビール", "日本酒", "焼酎グラス", "ボトル焼酎", "酎ハイ", "ハイボール", "梅酒・果実酒", "ソフトドリンク", "お酒に合うつまみ",
            # ランチタイムメニュー（新しい構成）
            "日替わりランチはこちら", "寿司ランチはこちら", "おすすめ定食はこちら", "土曜日のおすすめはこちら",
            # 続きを見る選択肢
            "おすすめ定食はこちら（続きを見る）",
            "逸品料理はこちら（続きを見る）",
            "海鮮定食はこちら（続きを見る）",
            "弁当（続きはこちら）",  # 弁当の続きボタン
            # 既存メニュー（「〜はこちら」形式）
            "海鮮定食はこちら", "定食屋メニューはこちら", "逸品料理はこちら", "今晩のおすすめ一品はこちら",
            # 既存メニュー（旧形式）
            "日替わりランチ（月曜～金曜）", "海鮮定食", "定食屋メニュー", "逸品料理", "今晩のおすすめ一品",
            "酒のつまみ", "焼き鳥", "海鮮刺身", "静岡名物料理フェア", "揚げ物　酒のつまみ",
            "その他のメニューはこちら",  # 追加
            "その他はこちらです",
            "寿司", "お好み寿司", "盛り合わせ",  # 寿司関連選択肢
            "サラダ", "逸品料理",  # サラダ・逸品料理選択肢
            "メニューを見る", "おすすめを教えて"
        ]
        
        message_trimmed = message.strip()
        
        # 質問文パターンを除外
        question_patterns = [
            "どんな", "ありますか", "何が", "教えて", "について", "知りたい", "見たい", "見せて"
        ]
        
        # 質問文の場合は選択肢クリックではない
        for pattern in question_patterns:
            if pattern in message_trimmed:
                return False
        
        # 完全一致または部分一致（部分一致は長い文字列に限定）
        for option in option_list:
            if option == message_trimmed:  # 完全一致
                logger.info(f"[Route] 選択肢完全一致: '{message_trimmed}' ↔ '{option}'")
                return True
            elif len(message_trimmed) >= 3 and message_trimmed in option:  # 部分一致（3文字以上）
                logger.info(f"[Route] 選択肢部分一致: '{message_trimmed}' ↔ '{option}'")
                return True
        
        # 会話ノードの名前もチェック
        if self.conversation_system:
            try:
                conversation_nodes = self.conversation_system.get_conversation_nodes()
                for node_id, node_data in conversation_nodes.items():
                    node_name = node_data.get("name", "")
                    if message_trimmed == node_name or message_trimmed == node_id:
                        logger.info(f"[Route] 会話ノード名一致: '{message_trimmed}' ↔ '{node_name}' (ID: {node_id})")
                        return True
            except Exception as e:
                logger.debug(f"[Route] 会話ノードチェックエラー: {e}")
        
        logger.info(f"[Route] 選択肢マッチなし: '{message_trimmed}'")
        return False
    
    def _get_menu_by_option(self, option: str, menu_db_id: str) -> tuple[List[Dict[str, Any]], bool]:
        """選択肢に応じてメニュー取得（メニューリスト、その他ボタン表示フラグ）"""
        category_map = {
            # 新しい挨拶選択肢（特別処理のため、実際のNotionカテゴリは使用しない）
            "ランチ": ("", 0, True),  # 特別処理で選択肢を表示
            "夜メニュー": ("", 0, True),  # 特別処理で選択肢を表示
            "土曜日限定ランチ": ("土曜日のおすすめ", 3, True),  # 土曜日限定ランチを直接表示
            # ランチタイムメニュー
            "日替わりランチはこちら": ("日替りランチ", 6, True),  # 6種類全表示
            "寿司ランチはこちら": ("寿司ランチ", 5, True),  # 5種類全表示
            "おすすめ定食はこちら": ("おすすめ定食", 5, True),  # 5つ表示、その他ボタンあり
            "土曜日のおすすめはこちら": ("土曜日のおすすめ", 3, True),  # 3種類全表示
            # 既存メニュー（「〜はこちら」形式）
            "海鮮定食はこちら": ("海鮮定食メニュー", 6, True),
            "定食屋メニューはこちら": ("定食屋メニュー", 6, True),
            "逸品料理はこちら": ("逸品料理", 6, True),
            "今晩のおすすめ一品はこちら": ("今晩のおすすめ一品", 6, True),
            # 既存メニュー（旧形式）
            "日替わりランチ（月曜～金曜）": ("日替りランチ", 6, False),
            "海鮮定食": ("海鮮定食メニュー", 6, False),
            "定食屋メニュー": ("定食屋メニュー", 6, False),
            "逸品料理": ("逸品料理", 6, False),
            "海鮮刺身": ("海鮮刺身", 6, False),
            "今晩のおすすめ一品": ("今晩のおすすめ一品", 6, False),
            "酒のつまみ": ("酒のつまみ", 6, False),
            "焼き鳥": ("焼き鳥", 6, False),
            "静岡名物料理フェア": ("静岡名物料理フェア", 6, False),
            "揚げ物　酒のつまみ": ("揚げ物　酒のつまみ", 6, False),
            
            # 弁当関連（新規追加）- Notion側の実際のデータ構造と一致
            # 「弁当」キーワードで「テイクアウト」サブカテゴリ全体を検索
            "弁当": ("テイクアウト", 7, True),  # メイン弁当カテゴリ（テイクアウトサブカテゴリ全体）
            "鶏カツ弁当": ("テイクアウト", 1, False),
            "唐揚げ弁当（並）": ("テイクアウト", 1, False),
            "唐揚げ弁当（大）": ("テイクアウト", 1, False),
            "唐揚げ弁当（小）": ("テイクアウト", 1, False),
            "唐揚げ弁当（特大）": ("テイクアウト", 1, False),
            "自家製しゅうまい弁当": ("テイクアウト", 1, False),
            "唐揚げ弁当（標準）": ("テイクアウト", 1, False),
            
            # まごころ弁当カテゴリ（追加）
            "まごころ弁当": ("テイクアウト", 8, True),
            "豚ニラ弁当": ("テイクアウト", 1, False),
            "麻婆豆腐弁当": ("テイクアウト", 1, False),
            "餃子弁当": ("テイクアウト", 1, False),
            "豚唐揚げ弁当": ("テイクアウト", 1, False),
            "酢豚弁当": ("テイクアウト", 1, False),
            "生姜焼き肉弁当": ("テイクアウト", 1, False),
            "フライ盛り弁当": ("テイクアウト", 1, False),
            "タレ付き焼き肉弁当": ("テイクアウト", 1, False),
            
            # サイズ選択
            "並": ("テイクアウト", 1, False),
            "大": ("テイクアウト", 1, False),
            "小": ("テイクアウト", 1, False),
            "特大": ("テイクアウト", 1, False),
            
            # その他のメニューはこちら（特別処理）
            "その他のメニューはこちら": ("", 0, False),  # 特別処理で空を返す
        }
        
        if option not in category_map:
            return [], False
        
        category_value, limit, show_more = category_map[option]
        
        try:
            # 「テイクアウト」の場合は、「テイクアウト」で始まるすべてのサブカテゴリを取得
            if category_value == "テイクアウト":
                # 全ページを取得してフィルタリング
                all_pages = self.notion_client.get_all_pages(menu_db_id)
                menus = []
                
                for page in all_pages:
                    subcategory = self.notion_client._extract_property_value(page, "Subcategory")
                    if subcategory and subcategory.startswith("テイクアウト"):
                        name = self.notion_client._extract_property_value(page, "Name")
                        price = self.notion_client._extract_property_value(page, "Price", 0)
                        short_desc = self.notion_client._extract_property_value(page, "一言紹介")
                        description = self.notion_client._extract_property_value(page, "詳細説明")
                        priority = self.notion_client._extract_property_value(page, "優先度", 999)
                        
                        menus.append({
                            "name": name,
                            "price": price,
                            "short_desc": short_desc,
                            "description": description,
                            "priority": priority,
                            "subcategory": subcategory
                        })
                
                # 優先度順にソート
                menus.sort(key=lambda x: (x.get("priority", 999), x.get("name", "")))
            else:
                # 通常のカテゴリ検索
                menus = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value=category_value,
                    limit=50  # 多めに取得
                )
            
            # 実際に7件以上ある場合のみshow_moreをTrue
            actual_show_more = len(menus) > 6 and show_more
            
            # 最初の6件のみ返す
            return menus[:6], actual_show_more
        except Exception as e:
            logger.error(f"メニュー取得エラー: {e}")
            return [], False
    
    def invoke(self, initial_state: State) -> State:
        """グラフ実行"""
        if not self.graph:
            raise ValueError("グラフが未構築です。build_graph()を先に実行してください。")
        
        final_state = self.graph.invoke(initial_state)
        return final_state

