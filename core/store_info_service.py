"""
店舗情報サービス
Notionから店舗情報（営業時間、特別営業時間など）を取得
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from core.notion_client import NotionClient

logger = logging.getLogger(__name__)


class StoreInfoService:
    """店舗情報サービス"""
    
    def __init__(self, notion_client: NotionClient, store_db_id: str):
        """
        初期化
        
        Args:
            notion_client: NotionClientインスタンス
            store_db_id: 店舗情報データベースID
        """
        self.notion_client = notion_client
        self.store_db_id = store_db_id
        self._cache = {}
        self._cache_timestamp = None
        self._cache_duration = 300  # 5分
    
    def get_business_hours(self, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """
        営業時間情報を取得
        
        Args:
            force_refresh: キャッシュを無視して強制的に再取得
        
        Returns:
            営業時間情報の辞書
        """
        return self._get_store_info_by_category("営業時間", force_refresh)
    
    def get_special_hours(self, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """
        特別営業時間（年末年始など）を取得
        
        Args:
            force_refresh: キャッシュを無視して強制的に再取得
        
        Returns:
            特別営業時間情報の辞書
        """
        return self._get_store_info_by_category("特別営業時間", force_refresh)
    
    def get_holidays(self, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """
        定休日情報を取得
        
        Args:
            force_refresh: キャッシュを無視して強制的に再取得
        
        Returns:
            定休日情報の辞書
        """
        return self._get_store_info_by_category("定休日", force_refresh)
    
    def get_access_info(self, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """
        アクセス情報を取得
        
        Args:
            force_refresh: キャッシュを無視して強制的に再取得
        
        Returns:
            アクセス情報の辞書
        """
        return self._get_store_info_by_category("アクセス", force_refresh)
    
    def get_all_store_info(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        すべての店舗情報を取得
        
        Args:
            force_refresh: キャッシュを無視して強制的に再取得
        
        Returns:
            店舗情報のリスト
        """
        # キャッシュチェック
        if not force_refresh and self._is_cache_valid():
            logger.info("キャッシュから店舗情報を取得")
            return self._cache.get("all", [])
        
        try:
            # Notionから全データ取得
            results = self.notion_client.get_all_pages(self.store_db_id)
            
            store_info_list = []
            for page in results:
                info = self._parse_store_info_page(page)
                if info:
                    store_info_list.append(info)
            
            # キャッシュ更新
            self._cache["all"] = store_info_list
            self._cache_timestamp = datetime.now().timestamp()
            
            logger.info(f"店舗情報を取得: {len(store_info_list)}件")
            return store_info_list
        
        except Exception as e:
            logger.error(f"店舗情報取得エラー: {e}")
            return []
    
    def _get_store_info_by_category(
        self, 
        category: str, 
        force_refresh: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        カテゴリ別に店舗情報を取得
        
        Args:
            category: カテゴリ名
            force_refresh: キャッシュを無視して強制的に再取得
        
        Returns:
            店舗情報の辞書
        """
        # キャッシュチェック
        cache_key = f"category_{category}"
        if not force_refresh and self._is_cache_valid() and cache_key in self._cache:
            logger.info(f"キャッシュから{category}情報を取得")
            return self._cache[cache_key]
        
        try:
            # カテゴリでフィルタリング
            filter_conditions = {
                "property": "カテゴリ",
                "select": {
                    "equals": category
                }
            }
            
            results = self.notion_client.query_database(
                self.store_db_id,
                filter_conditions=filter_conditions
            )
            
            if results:
                info = self._parse_store_info_page(results[0])
                # キャッシュ更新
                self._cache[cache_key] = info
                self._cache_timestamp = datetime.now().timestamp()
                return info
            
            return None
        
        except Exception as e:
            logger.error(f"{category}情報取得エラー: {e}")
            return None
    
    def _parse_store_info_page(self, page: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Notionページを店舗情報に変換
        
        Args:
            page: Notionページデータ
        
        Returns:
            店舗情報の辞書
        """
        try:
            properties = page.get("properties", {})
            
            # 項目名（Title）- "項目名" または "name" に対応
            item_name = ""
            if "項目名" in properties:
                title_prop = properties["項目名"].get("title", [])
                if title_prop:
                    item_name = title_prop[0].get("plain_text", "")
            elif "name" in properties:
                title_prop = properties["name"].get("title", [])
                if title_prop:
                    item_name = title_prop[0].get("plain_text", "")
            
            # カテゴリ（Select）
            category = ""
            if "カテゴリ" in properties:
                select_prop = properties["カテゴリ"].get("select")
                if select_prop:
                    category = select_prop.get("name", "")
            
            # 内容（Rich Text）- 複数のプロパティ名に対応
            content = ""
            # カテゴリに応じて適切なプロパティを選択
            if category == "営業時間" or category == "特別営業時間":
                # 営業時間系は business_hours を優先
                if "business_hours" in properties:
                    rich_text_prop = properties["business_hours"].get("rich_text", [])
                    if rich_text_prop:
                        content = rich_text_prop[0].get("plain_text", "")
                elif "内容" in properties:
                    rich_text_prop = properties["内容"].get("rich_text", [])
                    if rich_text_prop:
                        content = rich_text_prop[0].get("plain_text", "")
            elif category == "アクセス":
                # アクセス情報は access を優先
                if "access" in properties:
                    rich_text_prop = properties["access"].get("rich_text", [])
                    if rich_text_prop:
                        content = rich_text_prop[0].get("plain_text", "")
                elif "内容" in properties:
                    rich_text_prop = properties["内容"].get("rich_text", [])
                    if rich_text_prop:
                        content = rich_text_prop[0].get("plain_text", "")
            else:
                # その他は features, 内容 の順で探す
                if "features" in properties:
                    rich_text_prop = properties["features"].get("rich_text", [])
                    if rich_text_prop:
                        content = rich_text_prop[0].get("plain_text", "")
                elif "内容" in properties:
                    rich_text_prop = properties["内容"].get("rich_text", [])
                    if rich_text_prop:
                        content = rich_text_prop[0].get("plain_text", "")
            
            # 有効期間開始（Date）
            valid_from = None
            if "有効期間開始" in properties:
                date_prop = properties["有効期間開始"].get("date")
                if date_prop:
                    valid_from = date_prop.get("start")
            
            # 有効期間終了（Date）
            valid_until = None
            if "有効期間終了" in properties:
                date_prop = properties["有効期間終了"].get("date")
                if date_prop:
                    valid_until = date_prop.get("start")
            
            # 表示優先度（Number）
            priority = 99
            if "表示優先度" in properties:
                priority_prop = properties["表示優先度"].get("number")
                if priority_prop is not None:
                    priority = priority_prop
            
            return {
                "item_name": item_name,
                "category": category,
                "content": content,
                "valid_from": valid_from,
                "valid_until": valid_until,
                "priority": priority,
                "page_id": page.get("id", "")
            }
        
        except Exception as e:
            logger.error(f"店舗情報ページ解析エラー: {e}")
            return None
    
    def _is_cache_valid(self) -> bool:
        """キャッシュが有効かチェック"""
        if not self._cache_timestamp:
            return False
        
        current_time = datetime.now().timestamp()
        return (current_time - self._cache_timestamp) < self._cache_duration
    
    def is_special_period(self) -> bool:
        """
        現在が特別営業期間かチェック
        
        Returns:
            特別営業期間の場合True
        """
        special_hours = self.get_special_hours()
        
        if not special_hours:
            return False
        
        # 有効期間チェック
        now = datetime.now()
        valid_from = special_hours.get("valid_from")
        valid_until = special_hours.get("valid_until")
        
        if valid_from:
            from_date = datetime.fromisoformat(valid_from.replace("Z", "+00:00"))
            if now < from_date:
                return False
        
        if valid_until:
            until_date = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
            if now > until_date:
                return False
        
        return True
    
    def get_current_business_hours(self) -> str:
        """
        現在有効な営業時間を取得（特別営業時間を優先）
        
        Returns:
            営業時間の文字列
        """
        # 特別営業時間をチェック
        if self.is_special_period():
            special_hours = self.get_special_hours()
            if special_hours:
                return special_hours.get("content", "")
        
        # 通常営業時間を返す
        business_hours = self.get_business_hours()
        if business_hours:
            return business_hours.get("content", "")
        
        return "営業時間については店舗にお問い合わせください。"
    
    def format_store_info_for_display(self) -> str:
        """
        店舗情報を表示用にフォーマット
        
        Returns:
            フォーマットされた店舗情報
        """
        lines = []
        
        # 営業時間
        current_hours = self.get_current_business_hours()
        if current_hours:
            lines.append(f"【営業時間】\n{current_hours}")
        
        # 特別営業時間の告知
        if self.is_special_period():
            lines.append("\n※現在、特別営業時間で営業しております")
        
        # 定休日
        holidays = self.get_holidays()
        if holidays:
            lines.append(f"\n【定休日】\n{holidays.get('content', '')}")
        
        # アクセス
        access = self.get_access_info()
        if access:
            lines.append(f"\n【アクセス】\n{access.get('content', '')}")
        
        return "\n".join(lines)


# 使用例
if __name__ == "__main__":
    from core.notion_client import NotionClient
    
    # 環境変数から設定を読み込み
    notion_api_key = os.getenv("NOTION_API_KEY")
    store_db_id = os.getenv("NOTION_STORE_DB_ID", "262e9a7ee5b7806e911ce966a0ccf7fe")
    
    if not notion_api_key:
        print("NOTION_API_KEYを環境変数に設定してください")
    else:
        # NotionClientとStoreInfoServiceを初期化
        notion_client = NotionClient(notion_api_key)
        store_service = StoreInfoService(notion_client, store_db_id)
        
        # 店舗情報を取得
        print("=== 店舗情報 ===")
        print(store_service.format_store_info_for_display())
        
        print("\n=== 特別営業期間チェック ===")
        if store_service.is_special_period():
            print("現在は特別営業期間です")
            special_hours = store_service.get_special_hours()
            if special_hours:
                print(f"内容: {special_hours.get('content')}")
                print(f"期間: {special_hours.get('valid_from')} ～ {special_hours.get('valid_until')}")
        else:
            print("通常営業期間です")

