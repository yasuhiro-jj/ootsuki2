"""
UIコンポーネント
焼き鳥・市場の天ぷら・酒のつまみ会話ノードシステム用
"""

import json
import logging
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class UIResponse:
    """UIレスポンス"""
    body: str
    options: List[Dict[str, str]]
    node_id: str
    timestamp: int

@dataclass
class UserInteraction:
    """ユーザーインタラクション"""
    user_query: str
    selected_option: Optional[str]
    node_id: str
    timestamp: int

class ChatUI:
    """チャットUIクラス"""
    
    def __init__(self, conversation_system, rag_engine):
        self.conversation_system = conversation_system
        self.rag_engine = rag_engine
        self.current_node_id = None
        self.interaction_history = []
        self.callbacks = {}
    
    def process_user_input(self, user_input: str) -> UIResponse:
        """ユーザー入力処理"""
        timestamp = int(datetime.now().timestamp() * 1000)
        
        # インタラクション記録
        interaction = UserInteraction(
            user_query=user_input,
            selected_option=None,
            node_id=self.current_node_id or "",
            timestamp=timestamp
        )
        self.interaction_history.append(interaction)
        
        # クエリ処理
        response = self.conversation_system.process_query(user_input)
        
        # 現在のノードID更新
        if response.get("node_id"):
            self.current_node_id = response["node_id"]
        
        # UIレスポンス作成
        ui_response = UIResponse(
            body=response.get("body", ""),
            options=response.get("options", []),
            node_id=self.current_node_id or "",
            timestamp=timestamp
        )
        
        # コールバック実行
        self._execute_callbacks("user_input", {
            "user_input": user_input,
            "response": ui_response
        })
        
        return ui_response
    
    def select_option(self, option_value: str) -> UIResponse:
        """選択肢選択処理"""
        timestamp = int(datetime.now().timestamp() * 1000)
        
        # インタラクション記録
        interaction = UserInteraction(
            user_query="",
            selected_option=option_value,
            node_id=self.current_node_id or "",
            timestamp=timestamp
        )
        self.interaction_history.append(interaction)
        
        # ノード遷移
        self.current_node_id = option_value
        
        # ノード情報取得
        node_info = self._get_node_info(option_value)
        if not node_info:
            return self._create_error_response("指定されたノードが見つかりません")
        
        # UIレスポンス作成
        ui_response = UIResponse(
            body=node_info.get("template", ""),
            options=node_info.get("options", []),
            node_id=option_value,
            timestamp=timestamp
        )
        
        # コールバック実行
        self._execute_callbacks("option_selected", {
            "option_value": option_value,
            "response": ui_response
        })
        
        return ui_response
    
    def _get_node_info(self, node_id: str) -> Optional[Dict[str, Any]]:
        """ノード情報取得"""
        # 実際の実装では、ノードデータベースから取得
        # ここでは簡易実装
        return {
            "template": f"ノード {node_id} の情報です。",
            "options": [
                {"label": "選択肢1", "value": "option1"},
                {"label": "選択肢2", "value": "option2"}
            ]
        }
    
    def _create_error_response(self, error_message: str) -> UIResponse:
        """エラーレスポンス作成"""
        return UIResponse(
            body=f"エラー: {error_message}",
            options=[],
            node_id="",
            timestamp=int(datetime.now().timestamp() * 1000)
        )
    
    def _execute_callbacks(self, event_type: str, data: Dict[str, Any]):
        """コールバック実行"""
        if event_type in self.callbacks:
            for callback in self.callbacks[event_type]:
                try:
                    callback(data)
                except Exception as e:
                    logger.error(f"コールバック実行エラー: {e}")
    
    def register_callback(self, event_type: str, callback: Callable):
        """コールバック登録"""
        if event_type not in self.callbacks:
            self.callbacks[event_type] = []
        self.callbacks[event_type].append(callback)
    
    def get_interaction_history(self) -> List[Dict[str, Any]]:
        """インタラクション履歴取得"""
        return [
            {
                "user_query": interaction.user_query,
                "selected_option": interaction.selected_option,
                "node_id": interaction.node_id,
                "timestamp": interaction.timestamp
            }
            for interaction in self.interaction_history
        ]
    
    def clear_history(self):
        """履歴クリア"""
        self.interaction_history = []
        self.current_node_id = None

class WebSocketHandler:
    """WebSocketハンドラ"""
    
    def __init__(self, chat_ui: ChatUI):
        self.chat_ui = chat_ui
        self.connected_clients = set()
    
    def handle_message(self, client_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """メッセージ処理"""
        try:
            message_type = message.get("type")
            
            if message_type == "user_input":
                user_input = message.get("content", "")
                response = self.chat_ui.process_user_input(user_input)
                
                return {
                    "type": "response",
                    "data": {
                        "body": response.body,
                        "options": response.options,
                        "node_id": response.node_id,
                        "timestamp": response.timestamp
                    }
                }
            
            elif message_type == "option_selected":
                option_value = message.get("option_value", "")
                response = self.chat_ui.select_option(option_value)
                
                return {
                    "type": "response",
                    "data": {
                        "body": response.body,
                        "options": response.options,
                        "node_id": response.node_id,
                        "timestamp": response.timestamp
                    }
                }
            
            elif message_type == "get_history":
                history = self.chat_ui.get_interaction_history()
                return {
                    "type": "history",
                    "data": history
                }
            
            else:
                return {
                    "type": "error",
                    "data": {"message": "不明なメッセージタイプ"}
                }
                
        except Exception as e:
            logger.error(f"メッセージ処理エラー: {e}")
            return {
                "type": "error",
                "data": {"message": str(e)}
            }
    
    def add_client(self, client_id: str):
        """クライアント追加"""
        self.connected_clients.add(client_id)
        logger.info(f"クライアント接続: {client_id}")
    
    def remove_client(self, client_id: str):
        """クライアント削除"""
        self.connected_clients.discard(client_id)
        logger.info(f"クライアント切断: {client_id}")

class RESTAPIHandler:
    """REST APIハンドラ"""
    
    def __init__(self, chat_ui: ChatUI):
        self.chat_ui = chat_ui
    
    def handle_post(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """POSTリクエスト処理"""
        try:
            if endpoint == "/chat":
                user_input = data.get("message", "")
                response = self.chat_ui.process_user_input(user_input)
                
                return {
                    "status": "success",
                    "data": {
                        "body": response.body,
                        "options": response.options,
                        "node_id": response.node_id,
                        "timestamp": response.timestamp
                    }
                }
            
            elif endpoint == "/select":
                option_value = data.get("option_value", "")
                response = self.chat_ui.select_option(option_value)
                
                return {
                    "status": "success",
                    "data": {
                        "body": response.body,
                        "options": response.options,
                        "node_id": response.node_id,
                        "timestamp": response.timestamp
                    }
                }
            
            elif endpoint == "/history":
                history = self.chat_ui.get_interaction_history()
                return {
                    "status": "success",
                    "data": history
                }
            
            else:
                return {
                    "status": "error",
                    "message": "不明なエンドポイント"
                }
                
        except Exception as e:
            logger.error(f"API処理エラー: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    def handle_get(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """GETリクエスト処理"""
        try:
            if endpoint == "/status":
                return {
                    "status": "success",
                    "data": {
                        "system_status": "running",
                        "current_node": self.chat_ui.current_node_id,
                        "interaction_count": len(self.chat_ui.interaction_history)
                    }
                }
            
            elif endpoint == "/history":
                history = self.chat_ui.get_interaction_history()
                return {
                    "status": "success",
                    "data": history
                }
            
            else:
                return {
                    "status": "error",
                    "message": "不明なエンドポイント"
                }
                
        except Exception as e:
            logger.error(f"API処理エラー: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

# 使用例
if __name__ == "__main__":
    # サンプル実行
    from conversation_node_system import ConversationNodeSystem, create_sample_nodes
    from rag_engine import RAGEngine
    
    # システム初期化
    nodes = create_sample_nodes()
    conversation_system = ConversationNodeSystem(nodes)
    rag_engine = RAGEngine(nodes)
    
    # UI初期化
    chat_ui = ChatUI(conversation_system, rag_engine)
    
    # テスト実行
    print("=== チャットUIテスト ===")
    
    # ユーザー入力テスト
    response = chat_ui.process_user_input("焼き鳥メニューを教えて")
    print(f"レスポンス: {response.body}")
    print(f"選択肢: {[opt['label'] for opt in response.options]}")
    
    # 選択肢選択テスト
    if response.options:
        option_response = chat_ui.select_option(response.options[0]['value'])
        print(f"選択後レスポンス: {option_response.body}")
    
    # 履歴取得テスト
    history = chat_ui.get_interaction_history()
    print(f"インタラクション履歴: {len(history)}件")
