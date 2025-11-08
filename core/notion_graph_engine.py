"""
Notion連携対応のLangGraphエンジン
会話ノードDBと遷移ルールDBを使用して動的に会話フローを管理
"""

import os
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage, AIMessage

from .notion_engine import NotionEngine, UserInput, Context
from .ai_engine import AIEngine

logger = logging.getLogger(__name__)

from typing_extensions import TypedDict

class State(TypedDict):
    """会話状態"""
    messages: List[str]
    intent: str
    context: Dict[str, Any]
    response: str
    options: List[str]
    should_push: bool
    session_id: str
    current_node_id: str

class NotionGraphEngine:
    """Notion連携対応のグラフエンジン"""
    
    def __init__(self, llm, notion_client, config):
        self.llm = llm
        self.notion_client = notion_client
        self.config = config
        self.notion_engine = NotionEngine(notion_client, config)
        self.graph = None
        
        # フォールバック用のAIエンジン
        self.ai_engine = AIEngine(model="gpt-4", temperature=0.7)
    
    def build_graph(self):
        """グラフを構築"""
        logger.info("🔧 Notion連携グラフを構築中...")
        
        graph = StateGraph(State)
        
        # ノード追加
        graph.add_node("notion_node", self.notion_node)
        graph.add_node("fallback_response", self.fallback_response)
        graph.add_node("end_flow", self.end_flow)
        
        # エッジ設定
        graph.add_edge(START, "notion_node")
        graph.add_conditional_edges("notion_node", self.route_from_notion, {
            "continue": "notion_node",
            "fallback": "fallback_response",
            "end": "end_flow"
        })
        graph.add_edge("fallback_response", "notion_node")
        graph.add_edge("end_flow", END)
        
        self.graph = graph.compile()
        logger.info("✅ Notion連携グラフ構築完了")
        return self.graph
    
    def notion_node(self, state: State) -> State:
        """Notionからノードを取得して実行"""
        logger.info("[Node] notion_node")
        
        try:
            # ステップカウンターを初期化（無限ループ防止）
            if "step_count" not in state:
                state["step_count"] = 0
            state["step_count"] += 1
            
            # 最大ステップ数チェック（20ステップで終了）
            if state["step_count"] > 20:
                logger.warning("最大ステップ数に達しました。会話を終了します。")
                return self._handle_error(state, "会話が長すぎます。最初からやり直してください。")
            
            # 現在のノードIDを取得（初回は開始ノード）
            current_node_id = state.get("current_node_id")
            if not current_node_id:
                # 開始ノードを取得
                start_node = self.notion_engine.get_start_node()
                if not start_node:
                    logger.error("開始ノードが見つかりません")
                    return self._handle_error(state, "開始ノードが見つかりません")
                
                current_node_id = start_node.node_id
                state["current_node_id"] = current_node_id
            
            # ユーザー入力を解析
            user_input = self._parse_user_input(state)
            
            # コンテキストを作成
            context = self._create_context(state)
            
            # ノードを実行
            result = self.notion_engine.run_node(
                node_id=current_node_id,
                user_input=user_input,
                context_override=context
            )
            
            # 結果を状態に反映
            state["response"] = result["message"]
            state["options"] = result["options"]
            state["should_push"] = True
            
            # 現在のノードを取得して終了条件をチェック
            current_node = self.notion_engine.get_node_by_id(current_node_id)
            if current_node:
                # 完了ノードまたは種別がendの場合は終了
                if current_node.is_end_node or current_node.node_type.value == "end":
                    logger.info(f"完了ノードに到達: {current_node.node_name}")
                    state["intent"] = "end"
                    return state
                
                # 結果の終了フラグもチェック
                if result.get("end", False):
                    state["intent"] = "end"
                    return state
                
                # 次のノードを取得
                next_node = self.notion_engine.get_next_node(
                    current_node=current_node,
                    user_input=user_input,
                    context=context
                )
                
                if next_node:
                    state["current_node_id"] = next_node.node_id
                    state["intent"] = "continue"
                else:
                    logger.warning(f"次のノードが見つかりません: {current_node.node_name}")
                    state["intent"] = "fallback"
            else:
                logger.error(f"現在のノードが見つかりません: {current_node_id}")
                state["intent"] = "fallback"
            
            return state
            
        except Exception as e:
            logger.error(f"Notionノード実行エラー: {e}")
            return self._handle_error(state, f"システムエラー: {e}")
    
    def fallback_response(self, state: State) -> State:
        """フォールバック応答"""
        logger.info("[Node] fallback_response")
        
        try:
            # AIエンジンでフォールバック応答を生成
            messages = state.get("messages", [])
            if messages:
                last_message = messages[-1]
                
                # 簡単なフォールバック応答
                if "ランチ" in last_message:
                    state["response"] = "ランチメニューをご案内いたします。"
                    state["options"] = ["日替わりランチはこちら", "おすすめ定食はこちら", "寿司ランチはこちら"]
                elif "夜メニュー" in last_message or "夜のメニュー" in last_message:
                    state["response"] = "夜メニューをご案内いたします。"
                    state["options"] = ["おすすめ定食はこちら", "海鮮定食はこちら", "逸品料理はこちら"]
                elif "ビール" in last_message or "酒" in last_message:
                    state["response"] = "アルコールメニューをご案内いたします。"
                    state["options"] = ["ビール", "日本酒", "焼酎", "ワイン"]
                else:
                    state["response"] = "申し訳ございません。もう少し詳しく教えていただけますか？"
                    state["options"] = ["メニューを見る", "おすすめを教えて", "ビールください"]
            else:
                state["response"] = "いらっしゃいませ！本日は何にいたしましょうか？"
                state["options"] = ["ランチ", "夜メニュー", "土曜日限定ランチ"]
            
            state["should_push"] = True
            state["intent"] = "continue"
            
            return state
            
        except Exception as e:
            logger.error(f"フォールバック応答エラー: {e}")
            return self._handle_error(state, "システムエラーが発生しました")
    
    def end_flow(self, state: State) -> State:
        """終了案内ノード"""
        logger.info("[Node] end_flow")
        
        if not state.get("response"):
            state["response"] = "ご注文が決まりましたらお声がけください。"
        
        return state
    
    def route_from_notion(self, state: State) -> str:
        """Notionノードからのルーティング"""
        intent = state.get("intent", "continue")
        
        if intent == "end":
            return "end"
        elif intent == "fallback":
            return "fallback"
        else:
            return "continue"
    
    def _parse_user_input(self, state: State) -> UserInput:
        """ユーザー入力を解析"""
        messages = state.get("messages", [])
        
        if not messages:
            return UserInput(input_type="text", value="")
        
        last_message = messages[-1]
        
        # 選択肢クリック判定
        option_list = [
            "ランチ", "夜メニュー", "土曜日限定ランチ",
            "日替わりランチはこちら", "寿司ランチはこちら", "おすすめ定食はこちら",
            "海鮮定食はこちら", "定食屋メニューはこちら", "逸品料理はこちら",
            "今晩のおすすめ一品はこちら", "ビール", "日本酒", "焼酎", "ワイン",
            "お酒に合うつまみ", "メニューを見る", "おすすめを教えて", "ビールください"
        ]
        
        if last_message in option_list:
            return UserInput(input_type="option", value=last_message)
        else:
            return UserInput(input_type="text", value=last_message)
    
    def _create_context(self, state: State) -> Dict[str, Any]:
        """コンテキストを作成"""
        context = state.get("context", {})
        
        # 時間帯と季節を追加
        now = datetime.now()
        hour = now.hour
        month = now.month
        
        if 11 <= hour < 14:
            time_slot = "lunch"
        elif 17 <= hour < 22:
            time_slot = "dinner"
        else:
            time_slot = "other"
        
        if month in [3, 4, 5]:
            season = "春"
        elif month in [6, 7, 8]:
            season = "夏"
        elif month in [9, 10, 11]:
            season = "秋"
        else:
            season = "冬"
        
        context.update({
            "time_slot": time_slot,
            "season": season,
            "hour": hour,
            "month": month
        })
        
        return context
    
    def _handle_error(self, state: State, error_message: str) -> State:
        """エラーハンドリング"""
        logger.error(f"エラー: {error_message}")
        
        state["response"] = "申し訳ございません。システムエラーが発生しました。"
        state["options"] = ["メニューを見る", "おすすめを教えて", "ビールください"]
        state["should_push"] = True
        state["intent"] = "fallback"
        
        return state
    
    def invoke(self, initial_state: State) -> State:
        """グラフ実行"""
        if not self.graph:
            raise ValueError("グラフが未構築です。build_graph()を先に実行してください。")
        
        # 非同期実行のためのラッパー
        import asyncio
        
        async def async_invoke():
            final_state = await self.graph.ainvoke(initial_state)
            return final_state
        
        try:
            # 既存のイベントループがあるかチェック
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 既存のループが動いている場合は新しいタスクを作成
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(asyncio.run, async_invoke())
                    return future.result()
            else:
                return asyncio.run(async_invoke())
        except RuntimeError:
            # イベントループがない場合は新しく作成
            return asyncio.run(async_invoke())
