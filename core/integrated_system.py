"""
統合システム
焼き鳥・市場の天ぷら・酒のつまみ会話ノードシステムの統合クラス
"""

import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import json

from conversation_node_system import ConversationNodeSystem, Node
from notion_integration import NotionAPI, NotionNodeLoader, create_notion_api
from rag_engine import RAGEngine
from ui_components import ChatUI, WebSocketHandler, RESTAPIHandler
from notion_client import NotionClient

logger = logging.getLogger(__name__)

class IntegratedConversationSystem:
    """統合会話システム"""
    
    def __init__(self, notion_api_key: str = None, notion_database_id: str = None):
        # 環境変数から設定取得
        self.notion_api_key = notion_api_key or os.getenv("NOTION_API_KEY")
        self.notion_database_id = notion_database_id or os.getenv("NOTION_DATABASE_ID")
        
        # システム初期化
        self.notion_api = None
        self.notion_loader = None
        self.conversation_system = None
        self.rag_engine = None
        self.chat_ui = None
        self.websocket_handler = None
        self.rest_api_handler = None
        
        # 初期化実行
        self._initialize_systems()
    
    def _initialize_systems(self):
        """システム初期化"""
        try:
            # Notion API初期化
            if self.notion_api_key and self.notion_database_id:
                self.notion_api = NotionAPI(self.notion_api_key, self.notion_database_id)
                self.notion_loader = NotionNodeLoader(self.notion_api)
                logger.info("Notion API初期化完了")
            else:
                logger.warning("Notion API設定が不完全です。サンプルデータを使用します。")
                self._use_sample_data()
            
            # ノードデータ読み込み
            nodes_data = self._load_nodes()
            
            # 会話システム初期化
            self.conversation_system = ConversationNodeSystem(nodes_data)
            
            # RAGエンジン初期化
            self.rag_engine = RAGEngine(nodes_data)
            
            # UI初期化
            self.chat_ui = ChatUI(self.conversation_system, self.rag_engine)
            self.websocket_handler = WebSocketHandler(self.chat_ui)
            self.rest_api_handler = RESTAPIHandler(self.chat_ui)
            
            logger.info("統合システム初期化完了")
            
        except Exception as e:
            logger.error(f"システム初期化エラー: {e}")
            raise
    
    def _load_nodes(self) -> List[Dict[str, Any]]:
        """ノードデータ読み込み"""
        if self.notion_loader:
            try:
                nodes = self.notion_loader.load_nodes()
                logger.info(f"Notionからノード読み込み完了: {len(nodes)}件")
                return nodes
            except Exception as e:
                logger.error(f"Notion読み込みエラー: {e}")
                logger.info("サンプルデータを使用します")
                return self._get_sample_nodes()
        else:
            return self._get_sample_nodes()
    
    def _use_sample_data(self):
        """サンプルデータ使用"""
        logger.info("サンプルデータを使用します")
    
    def _get_sample_nodes(self) -> List[Dict[str, Any]]:
        """サンプルノードデータ取得"""
        return [
            {
                "id": "yakitori_menu_overview",
                "name": "焼き鳥メニュー確認",
                "keywords": ["焼き鳥", "鳥", "串焼き"],
                "template": "焼き鳥メニューをご案内いたします。盛り合わせ、とりもも、ねぎまなど豊富にご用意しております。さらに、いろいろ少しずつ楽しめる『焼き鳥盛り合わせ』もございます。どちらにされますか？",
                "category": "基本確認",
                "priority": 1,
                "url": "/yakitori/overview",
                "related_menu": ["焼き鳥盛り合わせ", "とりもも", "ねぎま"],
                "enabled": True,
                "next": ["/yakitori/assort", "/yakitori/torimomo", "/tempura/overview", "/snacks/overview"]
            },
            {
                "id": "tempura_menu_overview",
                "name": "天ぷらメニュー確認",
                "keywords": ["天ぷら", "揚げ物"],
                "template": "市場の天ぷらメニューをご案内いたします。野菜、海鮮、かき揚げなど豊富にご用意しております。さらに、いろいろ少しずつ楽しめる『天ぷら盛り合せ』もございます。どちらにされますか？",
                "category": "基本確認",
                "priority": 1,
                "url": "/tempura/overview",
                "related_menu": ["天ぷら盛り合せ", "海老天", "野菜天ぷら"],
                "enabled": True,
                "next": ["/tempura/assort", "/yakitori/overview", "/snacks/overview"]
            },
            {
                "id": "snacks_menu_overview",
                "name": "酒のつまみ確認",
                "keywords": ["酒のつまみ", "つまみ", "お酒"],
                "template": "酒のつまみメニューをご案内いたします。もろきゅう、ゆでらっかせい、冷奴など、お酒に合う一品をご用意しております。どちらにされますか？",
                "category": "基本確認",
                "priority": 1,
                "url": "/snacks/overview",
                "related_menu": ["もろきゅう", "ゆでらっかせい", "冷奴"],
                "enabled": True,
                "next": ["/snacks/menu", "/yakitori/overview", "/tempura/overview"]
            }
        ]
    
    def process_user_input(self, user_input: str) -> Dict[str, Any]:
        """ユーザー入力処理"""
        try:
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
        except Exception as e:
            logger.error(f"ユーザー入力処理エラー: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    def select_option(self, option_value: str) -> Dict[str, Any]:
        """選択肢選択処理"""
        try:
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
        except Exception as e:
            logger.error(f"選択肢選択処理エラー: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    def get_interaction_history(self) -> Dict[str, Any]:
        """インタラクション履歴取得"""
        try:
            history = self.chat_ui.get_interaction_history()
            return {
                "status": "success",
                "data": history
            }
        except Exception as e:
            logger.error(f"履歴取得エラー: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    def refresh_nodes(self) -> Dict[str, Any]:
        """ノードデータ更新"""
        try:
            if self.notion_loader:
                self.notion_loader.refresh_cache()
                nodes_data = self._load_nodes()
                
                # システム再初期化
                self.conversation_system = ConversationNodeSystem(nodes_data)
                self.rag_engine = RAGEngine(nodes_data)
                self.chat_ui = ChatUI(self.conversation_system, self.rag_engine)
                
                logger.info("ノードデータ更新完了")
                return {
                    "status": "success",
                    "message": "ノードデータを更新しました"
                }
            else:
                return {
                    "status": "error",
                    "message": "Notion APIが設定されていません"
                }
        except Exception as e:
            logger.error(f"ノード更新エラー: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    def get_system_status(self) -> Dict[str, Any]:
        """システム状態取得"""
        return {
            "status": "success",
            "data": {
                "system_status": "running",
                "notion_connected": self.notion_api is not None,
                "current_node": self.chat_ui.current_node_id,
                "interaction_count": len(self.chat_ui.interaction_history),
                "timestamp": int(datetime.now().timestamp() * 1000)
            }
        }
    
    def handle_websocket_message(self, client_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """WebSocketメッセージ処理"""
        return self.websocket_handler.handle_message(client_id, message)
    
    def handle_rest_api(self, method: str, endpoint: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """REST API処理"""
        if method.upper() == "POST":
            return self.rest_api_handler.handle_post(endpoint, data or {})
        elif method.upper() == "GET":
            return self.rest_api_handler.handle_get(endpoint, data or {})
        else:
            return {
                "status": "error",
                "message": f"サポートされていないHTTPメソッド: {method}"
            }

# 使用例
if __name__ == "__main__":
    # 統合システム初期化
    system = IntegratedConversationSystem()
    
    print("=== 統合システムテスト ===")
    
    # システム状態確認
    status = system.get_system_status()
    print(f"システム状態: {status}")
    
    # ユーザー入力テスト
    test_queries = [
        "焼き鳥メニューを教えて",
        "天ぷらについて",
        "つまみは何がある？"
    ]
    
    for query in test_queries:
        print(f"\nクエリ: {query}")
        response = system.process_user_input(query)
        print(f"レスポンス: {response}")
        
        # 選択肢がある場合は最初の選択肢を選択
        if response["status"] == "success" and response["data"]["options"]:
            option_value = response["data"]["options"][0]["value"]
            option_response = system.select_option(option_value)
            print(f"選択後: {option_response}")
    
    # 履歴取得
    history = system.get_interaction_history()
    print(f"\nインタラクション履歴: {len(history['data'])}件")
