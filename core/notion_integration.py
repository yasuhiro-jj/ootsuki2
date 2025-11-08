"""
Notion API統合クラス
焼き鳥・市場の天ぷら・酒のつまみ会話ノードシステム用
"""

import os
import requests
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class NotionAPI:
    """Notion API統合クラス"""
    
    def __init__(self, api_key: str, database_id: str):
        self.api_key = api_key
        self.database_id = database_id
        self.base_url = "https://api.notion.com/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }
    
    def get_conversation_nodes(self) -> List[Dict[str, Any]]:
        """会話ノードデータを取得"""
        try:
            url = f"{self.base_url}/databases/{self.database_id}/query"
            
            response = requests.post(url, headers=self.headers)
            response.raise_for_status()
            
            data = response.json()
            nodes = []
            
            for page in data.get("results", []):
                node = self._parse_page_to_node(page)
                if node:
                    nodes.append(node)
            
            logger.info(f"取得したノード数: {len(nodes)}")
            return nodes
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Notion API エラー: {e}")
            return []
    
    def _parse_page_to_node(self, page: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """ページデータをノードに変換"""
        try:
            properties = page.get("properties", {})
            
            # 必須プロパティの取得
            node_id = self._get_property_value(properties, "ノードID", "title")
            if not node_id:
                return None
            
            node_name = self._get_property_value(properties, "ノード名1", "rich_text")
            keywords = self._get_property_value(properties, "キーワード", "rich_text")
            template = self._get_property_value(properties, "レスポンステンプレート", "rich_text")
            category = self._get_property_value(properties, "カテゴリ", "select")
            priority = self._get_property_value(properties, "優先度", "number")
            url = self._get_property_value(properties, "URL", "rich_text")
            related_menu = self._get_property_value(properties, "関連メニュー", "rich_text")
            enabled = self._get_property_value(properties, "有効フラグ", "checkbox")
            
            # 遷移先の取得
            next_nodes = self._get_relation_property(properties, "遷移先")
            
            return {
                "id": node_id,
                "name": node_name or "",
                "keywords": self._parse_csv(keywords or ""),
                "template": template or "",
                "category": category or "",
                "priority": priority or 99,
                "url": url or "",
                "related_menu": self._parse_csv(related_menu or ""),
                "enabled": enabled if enabled is not None else True,
                "next": next_nodes
            }
            
        except Exception as e:
            logger.error(f"ページ解析エラー: {e}")
            return None
    
    def _get_property_value(self, properties: Dict[str, Any], prop_name: str, prop_type: str) -> Any:
        """プロパティ値を取得"""
        if prop_name not in properties:
            return None
        
        prop = properties[prop_name]
        
        if prop_type == "title":
            return prop.get("title", [{}])[0].get("text", {}).get("content", "")
        elif prop_type == "rich_text":
            return prop.get("rich_text", [{}])[0].get("text", {}).get("content", "")
        elif prop_type == "select":
            return prop.get("select", {}).get("name", "")
        elif prop_type == "number":
            return prop.get("number")
        elif prop_type == "checkbox":
            return prop.get("checkbox", False)
        else:
            return None
    
    def _get_relation_property(self, properties: Dict[str, Any], prop_name: str) -> List[str]:
        """リレーションプロパティを取得"""
        if prop_name not in properties:
            return []
        
        prop = properties[prop_name]
        relations = prop.get("relation", [])
        
        # リレーション先のURLを取得
        next_urls = []
        for relation in relations:
            # リレーション先のページ情報を取得
            page_id = relation.get("id")
            if page_id:
                page_info = self._get_page_info(page_id)
                if page_info and "url" in page_info:
                    next_urls.append(page_info["url"])
        
        return next_urls
    
    def _get_page_info(self, page_id: str) -> Optional[Dict[str, Any]]:
        """ページ情報を取得"""
        try:
            url = f"{self.base_url}/pages/{page_id}"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            
            page_data = response.json()
            return {
                "url": page_data.get("url", ""),
                "properties": page_data.get("properties", {})
            }
            
        except Exception as e:
            logger.error(f"ページ情報取得エラー: {e}")
            return None
    
    def _parse_csv(self, text: str) -> List[str]:
        """CSV文字列をリストに変換"""
        if not text:
            return []
        
        return [item.strip() for item in text.split(",") if item.strip()]

class NotionNodeLoader:
    """Notionノードローダー"""
    
    def __init__(self, notion_api: NotionAPI):
        self.notion_api = notion_api
        self.cache = {}
        self.cache_timestamp = None
        self.cache_duration = 300  # 5分
    
    def load_nodes(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """ノードを読み込み（キャッシュ対応）"""
        current_time = datetime.now().timestamp()
        
        # キャッシュチェック
        if (not force_refresh and 
            self.cache_timestamp and 
            current_time - self.cache_timestamp < self.cache_duration and 
            self.cache):
            logger.info("キャッシュからノードを取得")
            return self.cache
        
        # Notion APIから取得
        logger.info("Notion APIからノードを取得")
        nodes = self.notion_api.get_conversation_nodes()
        
        # キャッシュ更新
        self.cache = nodes
        self.cache_timestamp = current_time
        
        return nodes
    
    def refresh_cache(self):
        """キャッシュを強制更新"""
        self.load_nodes(force_refresh=True)

# 環境変数から設定を読み込み
def create_notion_api() -> NotionAPI:
    """Notion APIインスタンス作成"""
    api_key = os.getenv("NOTION_API_KEY")
    database_id = os.getenv("NOTION_DATABASE_ID")
    
    if not api_key or not database_id:
        raise ValueError("NOTION_API_KEY と NOTION_DATABASE_ID を環境変数に設定してください")
    
    return NotionAPI(api_key, database_id)

# 使用例
if __name__ == "__main__":
    try:
        # Notion API初期化
        notion_api = create_notion_api()
        loader = NotionNodeLoader(notion_api)
        
        # ノード読み込み
        nodes = loader.load_nodes()
        
        print(f"読み込んだノード数: {len(nodes)}")
        for node in nodes[:3]:  # 最初の3件を表示
            print(f"- {node['name']} ({node['category']})")
            
    except Exception as e:
        print(f"エラー: {e}")
