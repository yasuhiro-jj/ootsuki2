"""
Graph Engine

LangGraphを使用した会話フロー制御エンジン
"""

import logging
from typing import Dict, Any, TypedDict, Literal, Optional, List, Tuple

logger = logging.getLogger(__name__)

# LangGraphのimportを安全に行う
try:
    from langgraph.graph import StateGraph, END
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage
    _LANGGRAPH_AVAILABLE = True
except ImportError as e:
    logger.warning(f"⚠️ LangGraph import失敗: {e}")
    _LANGGRAPH_AVAILABLE = False
    # ダミークラスを定義
    StateGraph = None
    END = None
    ChatOpenAI = None
    HumanMessage = None
    SystemMessage = None


class ConversationState(TypedDict):
    """
    会話状態を管理する型定義
    """
    messages: list  # 会話履歴
    current_step: str  # 現在のステップ
    user_intent: str  # ユーザーの意図
    context: Dict[str, Any]  # コンテキスト情報
    rag_results: list  # RAG検索結果
    response: str  # 最終応答
    options: list  # UI選択肢（ハイブリッドUI用）
    selected_option: str  # 選択された選択肢


class GraphEngine:
    """
    LangGraphを使用した会話フロー制御エンジン
    """
    
    def __init__(
        self,
        llm: Any,  # ChatOpenAI型だが、importエラー時のためAnyに変更
        system_prompt: Optional[str] = None,
        notion_client: Optional[Any] = None,
        config: Optional[Any] = None
    ):
        """
        Args:
            llm: ChatOpenAIインスタンス
            system_prompt: システムプロンプト
            notion_client: NotionClientインスタンス（オプション）
            config: ConfigLoaderインスタンス（オプション）
        """
        if not _LANGGRAPH_AVAILABLE:
            raise ImportError("LangGraphがインストールされていません。pip install langgraph を実行してください。")
        
        self.llm = llm
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.notion_client = notion_client
        self.config = config
        self.graph = None
    
    def _default_system_prompt(self) -> str:
        """デフォルトのシステムプロンプト"""
        return """あなたは親切で丁寧なAIアシスタントです。
ユーザーの質問に対して、わかりやすく正確に回答してください。"""
    
    def build_graph(self, flow_type: str = "restaurant") -> StateGraph:
        """
        会話グラフを構築
        
        Args:
            flow_type: フロータイプ（restaurant, insurance, legal等）
        
        Returns:
            コンパイル済みのStateGraph
        """
        if flow_type == "restaurant":
            return self._build_restaurant_graph()
        elif flow_type == "insurance":
            return self._build_insurance_graph()
        elif flow_type == "legal":
            return self._build_legal_graph()
        else:
            return self._build_generic_graph()
    
    def _build_restaurant_graph(self) -> StateGraph:
        """飲食店用の会話グラフを構築"""
        workflow = StateGraph(ConversationState)
        
        # ノード追加
        workflow.add_node("greeting", self._greeting_node)
        workflow.add_node("intent_detection", self._detect_intent_node)
        workflow.add_node("menu_inquiry", self._menu_inquiry_node)
        workflow.add_node("store_info", self._store_info_node)
        workflow.add_node("recommendation", self._recommendation_node)
        workflow.add_node("sake_snack", self._sake_snack_node)  # 酒のつまみ専用ノード
        workflow.add_node("reservation", self._reservation_node)
        workflow.add_node("option_click", self._option_click_node)  # 選択肢クリック処理
        workflow.add_node("general_response", self._general_response_node)
        
        # エントリーポイント
        workflow.set_entry_point("greeting")
        
        # グリーティング → 意図検出
        workflow.add_edge("greeting", "intent_detection")
        
        # 意図検出からの条件分岐
        workflow.add_conditional_edges(
            "intent_detection",
            self._route_by_intent,
            {
                "menu": "menu_inquiry",
                "store": "store_info",
                "recommend": "recommendation",
                "sake_snack": "sake_snack",  # 酒のつまみ専用ノード
                "reserve": "reservation",
                "option_click": "option_click",  # 選択肢クリック処理
                "general": "general_response"
            }
        )
        
        # 各ノードから終了
        workflow.add_edge("menu_inquiry", END)
        workflow.add_edge("store_info", END)
        workflow.add_edge("recommendation", END)
        workflow.add_edge("sake_snack", END)  # 酒のつまみノードから終了
        workflow.add_edge("reservation", END)
        workflow.add_edge("option_click", END)  # 選択肢クリック処理から終了
        workflow.add_edge("general_response", END)
        
        self.graph = workflow.compile()
        logger.info("✅ 飲食店用会話グラフを構築しました")
        return self.graph
    
    def _build_insurance_graph(self) -> StateGraph:
        """保険比較用の会話グラフを構築"""
        workflow = StateGraph(ConversationState)
        
        workflow.add_node("greeting", self._greeting_node)
        workflow.add_node("intent_detection", self._detect_intent_node)
        workflow.add_node("needs_assessment", self._needs_assessment_node)
        workflow.add_node("product_search", self._product_search_node)
        workflow.add_node("comparison", self._comparison_node)
        workflow.add_node("consultation", self._consultation_node)
        workflow.add_node("general_response", self._general_response_node)
        
        workflow.set_entry_point("greeting")
        workflow.add_edge("greeting", "intent_detection")
        
        workflow.add_conditional_edges(
            "intent_detection",
            self._route_by_intent,
            {
                "needs": "needs_assessment",
                "product": "product_search",
                "compare": "comparison",
                "consult": "consultation",
                "general": "general_response"
            }
        )
        
        workflow.add_edge("needs_assessment", END)
        workflow.add_edge("product_search", END)
        workflow.add_edge("comparison", END)
        workflow.add_edge("consultation", END)
        workflow.add_edge("general_response", END)
        
        self.graph = workflow.compile()
        logger.info("✅ 保険比較用会話グラフを構築しました")
        return self.graph
    
    def _build_legal_graph(self) -> StateGraph:
        """士業用の会話グラフを構築"""
        workflow = StateGraph(ConversationState)
        
        workflow.add_node("greeting", self._greeting_node)
        workflow.add_node("intent_detection", self._detect_intent_node)
        workflow.add_node("procedure_info", self._procedure_info_node)
        workflow.add_node("document_info", self._document_info_node)
        workflow.add_node("fee_info", self._fee_info_node)
        workflow.add_node("consultation", self._consultation_node)
        workflow.add_node("general_response", self._general_response_node)
        
        workflow.set_entry_point("greeting")
        workflow.add_edge("greeting", "intent_detection")
        
        workflow.add_conditional_edges(
            "intent_detection",
            self._route_by_intent,
            {
                "procedure": "procedure_info",
                "document": "document_info",
                "fee": "fee_info",
                "consult": "consultation",
                "general": "general_response"
            }
        )
        
        workflow.add_edge("procedure_info", END)
        workflow.add_edge("document_info", END)
        workflow.add_edge("fee_info", END)
        workflow.add_edge("consultation", END)
        workflow.add_edge("general_response", END)
        
        self.graph = workflow.compile()
        logger.info("✅ 士業用会話グラフを構築しました")
        return self.graph
    
    def _build_generic_graph(self) -> StateGraph:
        """汎用会話グラフを構築"""
        workflow = StateGraph(ConversationState)
        
        workflow.add_node("greeting", self._greeting_node)
        workflow.add_node("general_response", self._general_response_node)
        
        workflow.set_entry_point("greeting")
        workflow.add_edge("greeting", "general_response")
        workflow.add_edge("general_response", END)
        
        self.graph = workflow.compile()
        logger.info("✅ 汎用会話グラフを構築しました")
        return self.graph
    
    # ==================== ノード実装 ====================
    
    def _greeting_node(self, state: ConversationState) -> ConversationState:
        """挨拶ノード"""
        state["current_step"] = "greeting"
        logger.debug("ノード実行: greeting")
        return state
    
    def _detect_intent_node(self, state: ConversationState) -> ConversationState:
        """意図検出ノード"""
        try:
            messages = state.get("messages", [])
            if not messages:
                state["user_intent"] = "general"
                return state
            
            last_message = messages[-1] if isinstance(messages[-1], str) else messages[-1].get("content", "")
            
            # 選択肢ボタンがクリックされた場合の処理
            logger.info(f"[DEBUG] last_message: '{last_message}' (長さ:{len(last_message)}, repr:{repr(last_message)})")
            is_option = self._is_option_click(last_message)
            logger.info(f"[DEBUG] _is_option_click結果: {is_option}")
            
            if is_option:
                intent = "option_click"
                state["selected_option"] = last_message
                logger.info(f"[DEBUG] selected_optionを設定: '{last_message}'")
            # 酒のつまみ関連のキーワードを直接チェック（優先度高）
            elif self._is_sake_snack_query(last_message):
                intent = "sake_snack"
            # おすすめ関連のキーワードを直接チェック
            elif self._is_recommendation_query(last_message):
                intent = "recommend"
            else:
                # LLMで意図分類
                prompt = f"""以下のユーザーメッセージの意図を1単語で分類してください。

メッセージ: {last_message}

分類カテゴリ:
- menu: メニュー・商品に関する質問
- store: 店舗・会社情報に関する質問
- recommend: おすすめを聞きたい（「おすすめは？」「何がおすすめ？」「おすすめを教えて」など）
- sake_snack: 酒のつまみ・おつまみに関する質問（「つまみは？」「おつまみありますか？」「ビールに合う料理」など）
- reserve: 予約・申し込みしたい
- needs: ニーズ診断が必要
- product: 商品検索
- compare: 比較したい
- consult: 相談したい
- procedure: 手続き情報
- document: 書類情報
- fee: 料金・費用情報
- general: その他一般的な質問

特に注意：
- 「おすすめは？」「何がおすすめ？」「おすすめを教えて」「今日のおすすめは？」などの質問は必ず「recommend」として分類してください。
- 「つまみは？」「おつまみありますか？」「お酒に合う料理」「ビールに合う」などは必ず「sake_snack」として分類してください。

カテゴリ名のみを小文字で返してください。"""
                
                response = self.llm.invoke([HumanMessage(content=prompt)])
                intent = response.content.strip().lower()
                
                # カテゴリに含まれない場合はgeneralにする
                valid_intents = ["menu", "store", "recommend", "sake_snack", "reserve", "needs", "product", 
                               "compare", "consult", "procedure", "document", "fee", "general"]
                if intent not in valid_intents:
                    intent = "general"
            
            state["user_intent"] = intent
            state["current_step"] = "intent_detection"
            logger.info(f"[DEBUG] 意図検出: {intent} (メッセージ: {last_message})")
            
        except Exception as e:
            logger.error(f"意図検出エラー: {e}")
            state["user_intent"] = "general"
        
        return state
    
    def _menu_inquiry_node(self, state: ConversationState) -> ConversationState:
        """メニュー問い合わせノード"""
        state["current_step"] = "menu_inquiry"
        state["response"] = self._generate_response(state, "メニューに関する情報をお伝えします。")
        
        # Notion DBからメニュー選択肢を取得
        if self.notion_client and self.config:
            try:
                menu_db_id = self.config.get("notion.database_ids.menu_db")
                if menu_db_id:
                    # Categoryでフィルタリング（フード系のメニュー）
                    pages = self.notion_client.query_by_category(
                        database_id=menu_db_id,
                        category_property="Category",
                        category_value="フード",
                        limit=8
                    )
                    state["options"] = self.notion_client.extract_options_from_pages(
                        pages, title_property="Name", max_options=5
                    )
                    logger.info(f"[OK] メニュー選択肢: {len(state.get('options', []))}件")
            except Exception as e:
                logger.warning(f"[WARN] メニュー選択肢取得エラー: {e}")
                # フォールバック: 全メニューから取得
                try:
                    all_pages = self.notion_client.get_all_pages(menu_db_id)
                    state["options"] = self.notion_client.extract_options_from_pages(
                        all_pages[:8], title_property="Name", max_options=5
                    )
                except:
                    state["options"] = []
        else:
            state["options"] = []
        
        logger.debug("ノード実行: menu_inquiry")
        return state
    
    def _store_info_node(self, state: ConversationState) -> ConversationState:
        """店舗情報ノード"""
        state["current_step"] = "store_info"
        state["response"] = self._generate_response(state, "店舗情報をご案内します。")
        
        # 店舗情報の場合は、カテゴリ選択肢を提供
        state["options"] = ["営業時間", "アクセス", "駐車場", "予約方法"]
        
        logger.debug("ノード実行: store_info")
        return state
    
    def _recommendation_node(self, state: ConversationState) -> ConversationState:
        """おすすめ提案ノード"""
        logger.info("[DEBUG] おすすめノード開始")
        
        try:
            state["current_step"] = "recommendation"
            logger.info("[DEBUG] ステップ設定完了")
            
            state["response"] = "おすすめをご提案します。"
            logger.info("[DEBUG] レスポンス設定完了")
            
            # カスタマイズされた今日のおすすめ選択肢
            custom_options = [
                "日替わりランチ（月曜～金曜）",
                "寿司ランチ",
                "おすすめ定食",
                "海鮮定食",
                "定食屋メニュー",
                "逸品料理",
                "海鮮刺身",
                "今晩のおすすめ一品",
                "酒のつまみ",
                "焼き鳥",
                "静岡名物料理フェア",
                "揚げ物　酒のつまみ"
            ]
            logger.info("[DEBUG] 選択肢リスト作成完了")
            
            # カスタム選択肢を設定
            state["options"] = custom_options
            logger.info(f"[OK] カスタムおすすめ選択肢: {len(custom_options)}件")
            
        except Exception as e:
            logger.error(f"[ERROR] おすすめノード実行エラー: {e}")
            import traceback
            logger.error(f"[ERROR] トレースバック: {traceback.format_exc()}")
            state["response"] = "申し訳ございません。エラーが発生しました。"
            state["options"] = []
        
        logger.debug("ノード実行: recommendation")
        return state
    
    def _sake_snack_node(self, state: ConversationState) -> ConversationState:
        """酒のつまみ専用ノード"""
        logger.info("[DEBUG] 酒のつまみノード開始")
        
        try:
            state["current_step"] = "sake_snack"
            logger.info("[DEBUG] ステップ設定完了")
            
            state["response"] = "🍶 酒のつまみをご提案します。以下からお選びください。"
            logger.info("[DEBUG] レスポンス設定完了")
            
            # 酒のつまみ関連の選択肢
            sake_snack_options = [
                "逸品料理",
                "海鮮刺身",
                "今晩のおすすめ一品",
                "酒のつまみ",
                "焼き鳥",
                "静岡名物料理フェア",
                "揚げ物　酒のつまみ"
            ]
            logger.info("[DEBUG] 酒のつまみ選択肢リスト作成完了")
            
            # 酒のつまみ専用選択肢を設定
            state["options"] = sake_snack_options
            logger.info(f"[OK] 酒のつまみ選択肢: {len(sake_snack_options)}件")
            
        except Exception as e:
            logger.error(f"[ERROR] 酒のつまみノード実行エラー: {e}")
            import traceback
            logger.error(f"[ERROR] トレースバック: {traceback.format_exc()}")
            state["response"] = "申し訳ございません。エラーが発生しました。"
            state["options"] = []
        
        logger.debug("ノード実行: sake_snack")
        return state
    
    def _reservation_node(self, state: ConversationState) -> ConversationState:
        """予約案内ノード"""
        state["current_step"] = "reservation"
        state["response"] = self._generate_response(state, "予約方法をご案内します。")
        logger.debug("ノード実行: reservation")
        return state
    
    def _needs_assessment_node(self, state: ConversationState) -> ConversationState:
        """ニーズ診断ノード"""
        state["current_step"] = "needs_assessment"
        state["response"] = self._generate_response(state, "ニーズを診断します。")
        logger.debug("ノード実行: needs_assessment")
        return state
    
    def _product_search_node(self, state: ConversationState) -> ConversationState:
        """商品検索ノード"""
        state["current_step"] = "product_search"
        state["response"] = self._generate_response(state, "商品を検索します。")
        logger.debug("ノード実行: product_search")
        return state
    
    def _comparison_node(self, state: ConversationState) -> ConversationState:
        """比較ノード"""
        state["current_step"] = "comparison"
        state["response"] = self._generate_response(state, "比較情報をご提供します。")
        logger.debug("ノード実行: comparison")
        return state
    
    def _consultation_node(self, state: ConversationState) -> ConversationState:
        """相談ノード"""
        state["current_step"] = "consultation"
        state["response"] = self._generate_response(state, "ご相談を承ります。")
        logger.debug("ノード実行: consultation")
        return state
    
    def _procedure_info_node(self, state: ConversationState) -> ConversationState:
        """手続き情報ノード"""
        state["current_step"] = "procedure_info"
        state["response"] = self._generate_response(state, "手続き情報をご案内します。")
        logger.debug("ノード実行: procedure_info")
        return state
    
    def _document_info_node(self, state: ConversationState) -> ConversationState:
        """書類情報ノード"""
        state["current_step"] = "document_info"
        state["response"] = self._generate_response(state, "必要書類をご案内します。")
        logger.debug("ノード実行: document_info")
        return state
    
    def _fee_info_node(self, state: ConversationState) -> ConversationState:
        """料金情報ノード"""
        state["current_step"] = "fee_info"
        state["response"] = self._generate_response(state, "料金情報をご案内します。")
        logger.debug("ノード実行: fee_info")
        return state
    
    def _general_response_node(self, state: ConversationState) -> ConversationState:
        """一般応答ノード"""
        state["current_step"] = "general_response"
        # 揚げ物関連の残りリストをリセット
        state.pop("fried_food_remaining", None)
        
        # ユーザーメッセージを取得
        messages = state.get("messages", [])
        user_message = messages[-1] if messages else ""
        default_options = ["メニューを見る", "おすすめを教えて", "店舗情報", "予約について"]
        
        # 揚げ物関連の質問を検出
        if self._is_fried_food_query(user_message):
            logger.info(f"[DEBUG] 揚げ物関連質問を検出: {user_message}")
            menu_message, remaining_items = self._get_fried_food_menus()
            state["response"] = menu_message

            options: List[str] = []
            if remaining_items:
                state["fried_food_remaining"] = remaining_items
                options.append("その他はこちらです")

            options.extend(default_options)
            state["options"] = options
        else:
            state["response"] = self._generate_response(state, "")
            state["options"] = default_options
        
        logger.debug("ノード実行: general_response")
        return state
    
    def _generate_response(self, state: ConversationState, context_hint: str = "") -> str:
        """応答を生成"""
        try:
            messages = state.get("messages", [])
            rag_results = state.get("rag_results", [])
            
            # コンテキスト構築
            context_parts = []
            if context_hint:
                context_parts.append(context_hint)
            
            # RAG結果を追加
            if rag_results:
                context_parts.append("\n参考情報:")
                for i, result in enumerate(rag_results[:3], 1):
                    text = result.get("text", "")
                    if text:
                        context_parts.append(f"[情報{i}] {text[:200]}...")
            
            context = "\n".join(context_parts) if context_parts else ""
            
            # システムメッセージ
            system_content = self.system_prompt
            if context:
                system_content += f"\n\n{context}"
            
            # 最後のユーザーメッセージ
            last_message = messages[-1] if messages else "こんにちは"
            if isinstance(last_message, dict):
                last_message = last_message.get("content", "こんにちは")
            
            # LLMで応答生成
            response = self.llm.invoke([
                SystemMessage(content=system_content),
                HumanMessage(content=last_message)
            ])
            
            return response.content
        
        except Exception as e:
            logger.error(f"応答生成エラー: {e}")
            return "申し訳ございません。エラーが発生しました。"
    
    def _route_by_intent(self, state: ConversationState) -> str:
        """意図に基づいてルーティング"""
        intent = state.get("user_intent", "general")
        logger.info(f"[DEBUG] ルーティング: {intent}")
        return intent
    
    def invoke(self, initial_state: ConversationState) -> ConversationState:
        """
        グラフを実行
        
        Args:
            initial_state: 初期状態
        
        Returns:
            最終状態
        """
        if not self.graph:
            raise ValueError("グラフが構築されていません。build_graph()を先に実行してください。")
        
        try:
            final_state = self.graph.invoke(initial_state)
            return final_state
        except Exception as e:
            logger.error(f"グラフ実行エラー: {e}")
            raise
    
    def _is_option_click(self, message: str) -> bool:
        """
        メッセージが選択肢ボタンのクリックかどうかを判定
        
        Args:
            message: ユーザーメッセージ
        
        Returns:
            選択肢クリックかどうか
        """
        option_list = [
            "日替わりランチ（月曜～金曜）",
            "寿司ランチ",
            "おすすめ定食",
            "海鮮定食",
            "定食屋メニュー",
            "逸品料理",
            "海鮮刺身",
            "今晩のおすすめ一品",
            "酒のつまみ",
            "焼き鳥",
            "静岡名物料理フェア",
            "揚げ物　酒のつまみ",
            "その他のメニューはこちら"
        ]
        
        # 空白をトリムして比較
        message_trimmed = message.strip()
        
        # 完全一致チェック
        if message_trimmed in option_list:
            return True
        
        # 部分一致チェック（より柔軟に対応）
        for option in option_list:
            if option in message_trimmed or message_trimmed in option:
                logger.info(f"[DEBUG] 部分一致検出: '{message_trimmed}' ≈ '{option}'")
                return True
        
        logger.info(f"[DEBUG] 選択肢に一致しませんでした: '{message_trimmed}'")
        logger.info(f"[DEBUG] 期待される選択肢: {option_list}")
        return False
    
    def _is_recommendation_query(self, message: str) -> bool:
        """
        メッセージがおすすめ関連の質問かどうかを判定
        
        Args:
            message: ユーザーメッセージ
        
        Returns:
            おすすめ関連の質問かどうか
        """
        recommendation_keywords = [
            "おすすめ",
            "お勧め",
            "推奨",
            "人気",
            "今日の",
            "何が",
            "どれが",
            "何か",
            "教えて",
            "は？",
            "ですか？",
            "ありますか？"
        ]
        
        message_lower = message.lower()
        
        # おすすめキーワードが含まれているかチェック
        for keyword in recommendation_keywords:
            if keyword in message_lower:
                return True
        
        return False
    
    def _is_sake_snack_query(self, message: str) -> bool:
        """
        メッセージが酒のつまみ関連の質問かどうかを判定
        
        Args:
            message: ユーザーメッセージ
        
        Returns:
            酒のつまみ関連の質問かどうか
        """
        sake_snack_keywords = [
            "つまみ",
            "おつまみ",
            "お酒",
            "酒",
            "ビール",
            "日本酒",
            "焼酎",
            "ワイン",
            "おつまみ定番",
            "ビールに合う",
            "日本酒向けつまみ",
            "焼き物おつまみ",
            "揚げ物おつまみ",
            "刺身おつまみ",
            "塩味系おつまみ",
            "さっぱりおつまみ",
            "濃厚おつまみ",
            "辛口おつまみ",
            "低カロリーおつまみ",
            "チーズ",
            "魚介系おつまみ",
            "肉系おつまみ",
            "季節限定おつまみ"
        ]
        
        message_lower = message.lower()
        
        # 酒のつまみキーワードが含まれているかチェック
        for keyword in sake_snack_keywords:
            if keyword in message_lower:
                return True
        
        return False
    
    def _is_fried_food_query(self, message: str) -> bool:
        """
        揚げ物関連の質問かどうかを判定
        
        Args:
            message: ユーザーメッセージ
        
        Returns:
            揚げ物関連の質問かどうか
        """
        fried_keywords = [
            "揚げ物", "揚げ", "天ぷら", "フライ", "唐揚げ", "カツ", "からあげ",
            "フリッター", "コロッケ", "とんかつ", "エビフライ", "海老フライ"
        ]
        
        message_lower = message.lower()
        
        for keyword in fried_keywords:
            if keyword in message_lower:
                return True
        
        return False
    
    def _get_fried_food_menus(self) -> Tuple[str, List[Dict[str, Any]]]:
        """
        揚げ物関連のメニューを取得して表示用テキストと残りリストを返す
        
        Returns:
            Tuple[str, List[Dict[str, Any]]]: 表示用テキスト, 追加表示用の残りメニュー
        """
        if not self.notion_client or not self.config:
            return ("申し訳ございません。揚げ物メニューの情報を取得できませんでした。", [])
        
        try:
            menu_db_id = self.config.get("notion.database_ids.menu_db")
            if not menu_db_id:
                return ("申し訳ございません。データベースにアクセスできませんでした。", [])
            
            fried_categories = [
                ("Subcategory", "揚げ物・酒のつまみ"),
                ("Subcategory", "揚げ物　酒のつまみ"),
            ]
            
            collected_menus: Dict[str, Dict[str, Any]] = {}
            for category_property, category_value in fried_categories:
                logger.info(f"[DEBUG] 揚げ物カテゴリ検索: {category_property}='{category_value}'")
                menus = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property=category_property,
                    category_value=category_value,
                    limit=20
                )
                logger.info(f"[DEBUG] {category_value}: {len(menus)}件取得")
                for menu in menus:
                    name = menu.get("name")
                    if not name:
                        continue
                    if name not in collected_menus:
                        collected_menus[name] = menu
            
            if not collected_menus:
                return ("申し訳ございません。揚げ物メニューが見つかりませんでした。", [])
            
            sorted_menus = sorted(
                collected_menus.values(),
                key=lambda item: (
                    item.get("priority", 999) if item.get("priority") is not None else 999,
                    item.get("name", "")
                )
            )
            initial_menus = sorted_menus[:5]
            remaining_menus = sorted_menus[5:]
            logger.info(
                f"[OK] 揚げ物メニュー表示: 初回{len(initial_menus)}件, 残り{len(remaining_menus)}件"
            )
            title = "🍤 **揚げ物メニュー（おすすめ5品）**" if len(initial_menus) >= 5 else "🍤 **揚げ物メニュー**"
            response_lines = [title, ""]
            for menu in initial_menus:
                name = menu.get("name", "メニュー名不明")
                price = menu.get("price", 0)
                short_desc = menu.get("short_desc", "")
                price_text = ""
                if isinstance(price, (int, float)) and price > 0:
                    price_text = f" ¥{int(price):,}"
                response_lines.append(f"• **{name}**{price_text}")
                if short_desc:
                    response_lines.append(f"  {short_desc}")
                response_lines.append("")
            if remaining_menus:
                response_lines.append("その他の揚げ物は『その他はこちらです』のタブからご覧いただけます。")
            response_text = "\n".join(response_lines).strip()
            return (response_text, remaining_menus)
        
        except Exception as e:
            logger.error(f"揚げ物メニュー取得エラー: {e}")
            return ("申し訳ございません。揚げ物メニューの取得中にエラーが発生しました。", [])
    
    def _option_click_node(self, state: ConversationState) -> ConversationState:
        """
        選択肢クリック時の処理ノード
        """
        selected_option = state.get("selected_option", "")
        state["current_step"] = "option_click"
        default_options = ["メニューを見る", "おすすめを教えて", "店舗情報", "予約について"]
        
        logger.info(f"[DEBUG] ===== 選択肢クリック処理開始 =====")
        logger.info(f"[DEBUG] 選択された選択肢: '{selected_option}'")
        logger.info(f"[DEBUG] NotionClient存在: {self.notion_client is not None}")
        logger.info(f"[DEBUG] Config存在: {self.config is not None}")

        if selected_option == "その他はこちらです":
            remaining_items = state.get("fried_food_remaining", []) or []
            if remaining_items:
                response_lines = ["🍤 **その他の揚げ物メニュー**", ""]
                for menu in remaining_items:
                    name = menu.get("name", "メニュー名不明")
                    price = menu.get("price", 0)
                    short_desc = menu.get("short_desc", "")
                    price_text = ""
                    if isinstance(price, (int, float)) and price > 0:
                        price_text = f" ¥{int(price):,}"
                    response_lines.append(f"• **{name}**{price_text}")
                    if short_desc:
                        response_lines.append(f"  {short_desc}")
                    response_lines.append("")
                state["response"] = "\n".join(response_lines).strip()
                logger.info(f"[OK] その他の揚げ物メニューを表示: {len(remaining_items)}件")
            else:
                state["response"] = "申し訳ございません。その他の揚げ物メニューを現在ご案内できません。"
                logger.warning("[WARN] 揚げ物の残りメニューが空です")
            state["options"] = default_options
            # 追加表示後は残りリストをクリアして重複表示を防ぐ
            state["fried_food_remaining"] = []
            return state
        
        if not self.notion_client or not self.config:
            state["response"] = f"申し訳ございません。{selected_option}の詳細情報を取得できませんでした。システムエラーが発生しています。"
            state["options"] = []
            logger.error(f"[ERROR] NotionClientまたはConfigが初期化されていません")
            return state
        
        try:
            menu_db_id = self.config.get("notion.database_ids.menu_db")
            logger.info(f"[DEBUG] メニューデータベースID: {menu_db_id}")
            
            if not menu_db_id:
                state["response"] = f"申し訳ございません。{selected_option}の詳細情報を取得できませんでした。データベースIDが見つかりません。"
                state["options"] = []
                logger.error(f"[ERROR] メニューデータベースIDが見つかりません")
                return state
            
            # 選択肢に応じてNotion DBからメニューを取得
            menu_details = []
            show_more_option = False
            
            if selected_option == "日替わりランチ（月曜～金曜）":
                logger.info(f"[DEBUG] 検索条件: Subcategory='日替りランチ'")
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="日替りランチ",
                    limit=6
                )
                logger.info(f"[DEBUG] 検索結果: {len(menu_details)}件")
                show_more_option = True
                
            elif selected_option == "寿司ランチ":
                logger.info(f"[DEBUG] 検索条件: Subcategory='寿司ランチ'")
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="寿司ランチ",
                    limit=10  # 件数を増やす
                )
                logger.info(f"[DEBUG] 検索結果: {len(menu_details)}件")
                show_more_option = len(menu_details) > 6  # 6件以上ある場合のみ「その他」ボタン表示
                
            elif selected_option == "おすすめ定食":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="おすすめ定食",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "海鮮定食":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="海鮮定食メニュー",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "定食屋メニュー":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="定食屋メニュー",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "逸品料理":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="逸品料理",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "海鮮刺身":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="海鮮刺身",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "今晩のおすすめ一品":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="今晩のおすすめ一品",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "酒のつまみ":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="酒のつまみ",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "焼き鳥":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="焼き鳥",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "静岡名物料理フェア":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="静岡名物料理フェア",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "揚げ物　酒のつまみ":
                menu_details = self.notion_client.get_menu_details_by_category(
                    database_id=menu_db_id,
                    category_property="Subcategory",
                    category_value="揚げ物　酒のつまみ",
                    limit=6
                )
                show_more_option = True
                
            elif selected_option == "その他のメニューはこちら":
                # 各カテゴリで表示されなかったメニューのみを取得
                try:
                    remaining_menu_details = []
                    
                    # 各カテゴリから7件目以降のメニューを取得
                    categories = [
                        ("日替りランチ", "日替わりランチ"),
                        ("寿司ランチ", "寿司ランチ"), 
                        ("海鮮刺身", "海鮮刺身"),
                        ("逸品料理", "逸品料理"),
                        ("定食屋メニュー", "定食屋メニュー"),
                        ("おすすめ定食", "おすすめ定食"),
                        ("海鮮定食メニュー", "海鮮定食"),
                        ("今晩のおすすめ一品", "今晩のおすすめ一品"),
                        ("酒のつまみ", "酒のつまみ"),
                        ("焼き鳥", "焼き鳥"),
                        ("静岡名物料理フェア", "静岡名物料理フェア"),
                        ("揚げ物　酒のつまみ", "揚げ物　酒のつまみ")
                    ]
                    
                    for category_value, category_name in categories:
                        category_property = "Subcategory"
                        all_category_pages = self.notion_client.get_all_pages(menu_db_id)
                        
                        # このカテゴリの全ページをフィルタリング
                        category_pages = []
                        for page in all_category_pages:
                            page_category = self.notion_client._extract_property_value(page, "Subcategory")
                            
                            if page_category == category_value:
                                category_pages.append(page)
                        
                        # 7件目以降を追加
                        if len(category_pages) > 6:
                            remaining_pages = category_pages[6:]
                            for page in remaining_pages:
                                detail = {
                                    "name": self.notion_client._extract_property_value(page, "Name"),
                                    "description": self.notion_client._extract_property_value(page, "詳細説明"),
                                    "short_desc": self.notion_client._extract_property_value(page, "一言紹介"),
                                    "price": self.notion_client._extract_property_value(page, "Price", 0),
                                    "image_url": self.notion_client._extract_property_value(page, "メイン画像URL"),
                                    "category": self.notion_client._extract_property_value(page, "Category"),
                                    "subcategory": self.notion_client._extract_property_value(page, "Subcategory"),
                                    "category_name": category_name
                                }
                                remaining_menu_details.append(detail)
                    
                    menu_details = remaining_menu_details[:20]  # 最大20件まで
                    
                except Exception as e:
                    logger.error(f"その他メニュー取得エラー: {e}")
                    menu_details = []
                
                show_more_option = False
            
            else:
                # どの選択肢にも一致しない場合
                logger.warning(f"[WARN] 選択肢 '{selected_option}' がどのカテゴリにも一致しません")
                logger.warning(f"[WARN] 期待される選択肢: 日替わりランチ（月曜～金曜）, 寿司ランチ, おすすめ定食, 海鮮定食, 定食屋メニュー, 逸品料理, 海鮮刺身, 今晩のおすすめ一品, 酒のつまみ, 焼き鳥, 静岡名物料理フェア, 揚げ物　酒のつまみ, その他のメニューはこちら")
            
            # メニュー詳細を箇条書き形式で整形
            logger.info(f"[DEBUG] menu_details件数: {len(menu_details)}")
            if menu_details:
                response_text = f"🍽️ **{selected_option}**\n\n"
                
                for i, menu in enumerate(menu_details, 1):
                    name = menu.get("name", "メニュー名不明")
                    description = menu.get("description", "")
                    price = menu.get("price", 0)
                    short_desc = menu.get("short_desc", "")
                    
                    # メニュー名と価格
                    response_text += f"• **{name}**"
                    if price > 0:
                        response_text += f" ¥{price:,}"
                    response_text += "\n"
                    
                    # 一言紹介（あれば）
                    if short_desc:
                        response_text += f"  {short_desc}\n"
                    
                    # 詳細説明（あれば短く）
                    if description:
                        # 詳細説明が長い場合は省略
                        if len(description) > 80:
                            response_text += f"  {description[:80]}...\n"
                        else:
                            response_text += f"  {description}\n"
                    
                    response_text += "\n"
                
                state["response"] = response_text
                logger.info(f"[OK] 選択肢処理: {selected_option} - {len(menu_details)}件表示")
                
                # 最初の6件を表示した場合、「その他のメニューはこちら」オプションを追加
                if show_more_option:
                    state["options"] = ["その他のメニューはこちら"]
                else:
                    state["options"] = []
                
            else:
                # メニューが見つからない場合、フォールバックとして全メニューから取得を試みる
                logger.warning(f"[WARN] {selected_option} のメニューが見つかりません。全メニューから取得を試みます。")
                
                try:
                    all_pages = self.notion_client.get_all_pages(menu_db_id)
                    logger.info(f"[DEBUG] 全ページ数: {len(all_pages)}件")
                    
                    # 最初の6件をフォールバックとして表示
                    fallback_details = []
                    for page in all_pages[:6]:
                        detail = {
                            "name": self.notion_client._extract_property_value(page, "Name"),
                            "description": self.notion_client._extract_property_value(page, "詳細説明"),
                            "short_desc": self.notion_client._extract_property_value(page, "一言紹介"),
                            "price": self.notion_client._extract_property_value(page, "Price", 0),
                            "category": self.notion_client._extract_property_value(page, "Category"),
                            "subcategory": self.notion_client._extract_property_value(page, "Subcategory")
                        }
                        fallback_details.append(detail)
                    
                    if fallback_details:
                        response_text = f"🍽️ **おすすめメニュー**\n\n"
                        
                        for i, menu in enumerate(fallback_details, 1):
                            name = menu.get("name", "メニュー名不明")
                            price = menu.get("price", 0)
                            short_desc = menu.get("short_desc", "")
                            
                            # メニュー名と価格
                            response_text += f"• **{name}**"
                            if price > 0:
                                response_text += f" ¥{price:,}"
                            response_text += "\n"
                            
                            # 一言紹介（あれば）
                            if short_desc:
                                response_text += f"  {short_desc}\n"
                            response_text += "\n"
                        
                        state["response"] = response_text
                        state["options"] = []
                        logger.info(f"[OK] フォールバックメニュー表示: {len(fallback_details)}件")
                    else:
                        state["response"] = f"申し訳ございません。{selected_option}のメニューが見つかりませんでした。データベースにメニューデータがない可能性があります。"
                        state["options"] = []
                        logger.error(f"[ERROR] データベースが空です")
                
                except Exception as fallback_error:
                    logger.error(f"[ERROR] フォールバック処理エラー: {fallback_error}")
                    state["response"] = f"申し訳ございません。{selected_option}のメニューが見つかりませんでした。"
                    state["options"] = []
            
        except Exception as e:
            logger.error(f"選択肢処理エラー: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            state["response"] = f"申し訳ございません。{selected_option}の詳細情報を取得中にエラーが発生しました。"
            state["options"] = []
        
        logger.debug(f"ノード実行: option_click - {selected_option}")
        return state

