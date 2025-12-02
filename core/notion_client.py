"""
Notion Client

Notion APIとの連携を汎用的に提供するクライアントクラス
"""

import os
import logging
import time
from typing import List, Dict, Any, Optional
from notion_client import Client
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class NotionClient:
    """
    Notion APIとの連携を提供する汎用クライアント
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Args:
            api_key: Notion API Key（Noneの場合は環境変数から取得）
        """
        self.api_key = api_key or os.getenv("NOTION_API_KEY")
        self.client = None
        self._property_key_cache: Dict[str, Dict[str, str]] = {}
        
        self._initialize_client()
    
    def _initialize_client(self):
        """Notionクライアントを初期化"""
        try:
            if self.api_key:
                self.client = Client(auth=self.api_key)
                logger.info("[OK] Notionクライアントが正常に初期化されました")
            else:
                logger.error("❌ Notion API Keyが設定されていません")
                logger.error("【対処方法】環境変数 NOTION_API_KEY を設定してください")
                logger.error("  - ローカル: .env ファイルに NOTION_API_KEY=your_key_here")
                logger.error("  - Railway: 環境変数タブで NOTION_API_KEY を設定")
        except Exception as e:
            logger.error(f"❌ Notionクライアントの初期化に失敗: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
    
    def query_database(
        self,
        database_id: str,
        filter_conditions: Optional[Dict[str, Any]] = None,
        sorts: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        データベースをクエリ
        
        Args:
            database_id: データベースID
            filter_conditions: フィルタ条件
            sorts: ソート条件
        
        Returns:
            クエリ結果のリスト
        """
        if not self.client:
            logger.warning("Notionクライアントが初期化されていません")
            return []
        
        try:
            query_params = {}
            if filter_conditions:
                query_params["filter"] = filter_conditions
            if sorts:
                query_params["sorts"] = sorts
            
            response = self.client.databases.query(
                database_id=database_id,
                **query_params
            )
            
            return response.get("results", [])
        
        except Exception as e:
            logger.error(f"データベースクエリエラー: {e}")
            return []
    
    def get_all_pages(self, database_id: str) -> List[Dict[str, Any]]:
        """
        データベースの全ページを取得（ページネーション対応）
        
        Args:
            database_id: データベースID
        
        Returns:
            全ページのリスト
        """
        if not self.client:
            logger.error("❌ Notionクライアントが初期化されていません")
            logger.error("【対処方法】NOTION_API_KEY が正しく設定されているか確認してください")
            return []
        
        try:
            all_pages = []
            has_more = True
            start_cursor = None
            
            while has_more:
                query_params = {"page_size": 100}  # 最大100件
                if start_cursor:
                    query_params["start_cursor"] = start_cursor
                
                response = self.client.databases.query(
                    database_id=database_id,
                    **query_params
                )
                
                pages = response.get("results", [])
                all_pages.extend(pages)
                
                has_more = response.get("has_more", False)
                start_cursor = response.get("next_cursor")
                
                logger.debug(f"[DEBUG] ページネーション: {len(pages)}件取得, has_more={has_more}")
            
            logger.info(f"[OK] 全ページ取得完了: {len(all_pages)}件")
            return all_pages
        
        except Exception as e:
            # Notion API エラーの詳細を解析
            from notion_client.errors import APIResponseError
            if isinstance(e, APIResponseError):
                error_msg = str(e)
                if e.status == 401:
                    logger.error(f"❌ Notion API 認証エラー: {e.code}")
                    logger.error(f"   メッセージ: {error_msg}")
                    logger.error("【対処方法】")
                    logger.error("  1. Railway の環境変数で NOTION_API_KEY が正しく設定されているか確認")
                    logger.error("  2. ローカルの .env ファイルと Railway の設定値を比較")
                    logger.error("  3. Notion Integration の API Key を再生成して設定")
                elif e.status == 404:
                    logger.error(f"❌ データベースが見つかりません: {e.code}")
                    logger.error(f"   Database ID: {database_id[:20]}...")
                    logger.error("【対処方法】")
                    logger.error("  1. Database ID が正しいか確認")
                    logger.error("  2. Notion Integration がこのデータベースへのアクセス権を持っているか確認")
                else:
                    logger.error(f"❌ Notion API エラー: status={e.status}, code={e.code}")
                    logger.error(f"   メッセージ: {error_msg}")
            else:
                logger.error(f"全ページ取得エラー: {e}")
            
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            return []
    
    def get_property_value(
        self,
        page: Dict[str, Any],
        property_name: str,
        property_type: Optional[str] = None
    ) -> Any:
        """
        ページプロパティの値を取得
        
        Args:
            page: ページオブジェクト
            property_name: プロパティ名
            property_type: プロパティタイプ（title, rich_text, select, number等）
        
        Returns:
            プロパティの値
        """
        try:
            properties = page.get("properties", {})
            prop = properties.get(property_name, {})
            
            if not prop:
                return None
            
            prop_type = prop.get("type") or property_type
            
            # タイプに応じて値を取得
            if prop_type == "title":
                title_array = prop.get("title", [])
                if title_array:
                    return title_array[0].get("plain_text", "")
            
            elif prop_type == "rich_text":
                rich_text_array = prop.get("rich_text", [])
                if rich_text_array:
                    return rich_text_array[0].get("plain_text", "")
            
            elif prop_type == "select":
                select_obj = prop.get("select")
                if select_obj:
                    return select_obj.get("name")
            
            elif prop_type == "multi_select":
                multi_select_array = prop.get("multi_select", [])
                return [item.get("name") for item in multi_select_array]
            
            elif prop_type == "number":
                return prop.get("number")
            
            elif prop_type == "checkbox":
                return prop.get("checkbox")
            
            elif prop_type == "url":
                return prop.get("url")
            
            elif prop_type == "date":
                date_obj = prop.get("date")
                if date_obj:
                    return date_obj.get("start")
            
            elif prop_type == "files":
                files_array = prop.get("files", [])
                if files_array:
                    return [f.get("name") or f.get("file", {}).get("url") for f in files_array]
            
            return None
        
        except Exception as e:
            logger.error(f"プロパティ値取得エラー ({property_name}): {e}")
            return None
    
    def create_page(
        self,
        database_id: str,
        properties: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        新しいページを作成
        
        Args:
            database_id: データベースID
            properties: ページプロパティ
        
        Returns:
            作成されたページオブジェクト
        """
        if not self.client:
            logger.warning("Notionクライアントが初期化されていません")
            return None
        
        try:
            page = self.client.pages.create(
                parent={"database_id": database_id},
                properties=properties
            )
            
            logger.info(f"[OK] ページを作成しました: {page.get('id')}")
            return page
        
        except Exception as e:
            logger.error(f"❌ ページ作成エラー: {e}")
            return None
    
    def update_page(
        self,
        page_id: str,
        properties: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        ページを更新
        
        Args:
            page_id: ページID
            properties: 更新するプロパティ
        
        Returns:
            更新されたページオブジェクト
        """
        if not self.client:
            logger.warning("Notionクライアントが初期化されていません")
            return None
        
        try:
            page = self.client.pages.update(
                page_id=page_id,
                properties=properties
            )
            
            logger.info(f"[OK] ページを更新しました: {page_id}")
            return page
        
        except Exception as e:
            logger.error(f"❌ ページ更新エラー: {e}")
            return None
    
    def get_database_schema(self, database_id: str) -> Dict[str, Any]:
        """
        データベースのスキーマ情報を取得
        
        Args:
            database_id: データベースID
        
        Returns:
            データベースのプロパティ情報
        
        Raises:
            Exception: Notion APIエラーが発生した場合
        """
        if not self.client:
            logger.warning("Notionクライアントが初期化されていません")
            raise ValueError("Notionクライアントが初期化されていません")
        
        try:
            logger.debug(f"[DEBUG] データベース情報を取得中: {database_id[:8]}...")
            db_info = self.client.databases.retrieve(database_id=database_id)
            
            if not db_info:
                logger.error("❌ データベース情報が空です")
                raise ValueError("データベース情報が取得できませんでした")
            
            properties = db_info.get("properties", {})
            
            if not properties:
                logger.warning("⚠️ データベースにプロパティが存在しません")
                return {}
            
            logger.debug(f"[DEBUG] プロパティ数: {len(properties)}")
            
            schema = {}
            for prop_name, prop_info in properties.items():
                schema[prop_name] = {
                    "type": prop_info.get("type"),
                    "id": prop_info.get("id")
                }
                
                # セレクトの選択肢を追加
                if prop_info.get("type") == "select":
                    options = prop_info.get("select", {}).get("options", [])
                    schema[prop_name]["options"] = [opt.get("name") for opt in options]
            
            logger.info(f"[OK] スキーマ取得完了: {len(schema)}件のプロパティ")
            return schema
        
        except Exception as e:
            # エラーの詳細をログに記録
            error_msg = str(e)
            error_type = type(e).__name__
            
            # Notion APIエラーの詳細を解析
            from notion_client.errors import APIResponseError
            if isinstance(e, APIResponseError):
                logger.error(f"❌ Notion API エラー: status={e.status}, code={e.code}")
                logger.error(f"   メッセージ: {error_msg}")
                
                if e.status == 404:
                    logger.error("【対処方法】")
                    logger.error("  1. データベースIDが正しいか確認")
                    logger.error("  2. Notion Integrationがデータベースに接続されているか確認")
                    logger.error("  3. データベースが削除されていないか確認")
                elif e.status == 401:
                    logger.error("【対処方法】")
                    logger.error("  1. NOTION_API_KEYが正しく設定されているか確認")
                    logger.error("  2. API Keyが有効か確認")
                elif e.status == 403:
                    logger.error("【対処方法】")
                    logger.error("  1. Notion Integrationがデータベースに接続されているか確認")
                    logger.error("  2. Integrationに適切な権限が設定されているか確認")
            else:
                logger.error(f"データベーススキーマ取得エラー: {error_type}: {error_msg}")
            
            import traceback
            logger.debug(f"トレースバック: {traceback.format_exc()}")
            
            # エラーを再発生させて、呼び出し側で処理できるようにする
            raise
    
    def pages_to_text(self, pages: List[Dict[str, Any]]) -> str:
        """
        ページリストをテキスト形式に変換（RAG用）
        
        Args:
            pages: ページのリスト
        
        Returns:
            テキスト形式の文字列
        """
        texts = []
        
        for page in pages:
            properties = page.get("properties", {})
            page_text = []
            
            for prop_name, prop_value in properties.items():
                value = self.get_property_value(page, prop_name)
                if value:
                    page_text.append(f"{prop_name}: {value}")
            
            if page_text:
                texts.append("\n".join(page_text))
        
        return "\n\n".join(texts)
    
    def query_by_category(
        self,
        database_id: str,
        category_property: str,
        category_value: str,
        limit: int = 10,
        sort_by_priority: bool = True
    ) -> List[Dict[str, Any]]:
        """
        カテゴリでフィルタリングしてページを取得
        
        Args:
            database_id: データベースID
            category_property: カテゴリプロパティ名
            category_value: カテゴリ値
            limit: 取得件数制限
            sort_by_priority: 優先度でソートするか（デフォルト: True）
        
        Returns:
            フィルタリングされたページリスト
        """
        if not self.client:
            logger.warning("Notion APIが初期化されていません")
            return []
        
        try:
            logger.info(f"[DEBUG] カテゴリ検索: {category_property}='{category_value}' (limit={limit})")
            
            # まず全ページを取得して、フィルタリング（より確実）
            all_pages = self.get_all_pages(database_id)
            logger.info(f"[DEBUG] 全ページ数: {len(all_pages)}件")
            
            filtered_pages = []
            
            for page in all_pages:
                try:
                    # _extract_property_valueを使用（より確実）
                    value = self._extract_property_value(page, category_property)
                    page_name = self._extract_property_value(page, "Name")
                    
                    # デバッグ：検索条件に一致する可能性のあるページを表示
                    if value and str(value).strip() == str(category_value).strip():
                        filtered_pages.append(page)
                        logger.info(f"[DEBUG] 一致ページ: {page_name}, {category_property}='{value}'")
                        if len(filtered_pages) >= limit:
                            break
                    elif value and str(category_value) in str(value):
                        # 部分一致もログ出力
                        logger.debug(f"[DEBUG] 部分一致: {page_name}, {category_property}='{value}'")
                        
                except Exception as prop_error:
                    logger.debug(f"プロパティ取得エラー: {prop_error}")
                    continue
            
            logger.info(f"[OK] カテゴリ検索完了: {category_property}='{category_value}' → {len(filtered_pages)}件取得")
            
            # 優先度でソート
            if sort_by_priority and filtered_pages:
                filtered_pages = self._sort_by_priority(filtered_pages)
                logger.info(f"[DEBUG] 優先度順にソート完了")
            
            return filtered_pages
        
        except Exception as e:
            logger.error(f"カテゴリ検索エラー: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            return []
    
    def extract_options_from_pages(
        self,
        pages: List[Dict[str, Any]],
        title_property: str = "メニュー名",
        max_options: int = 5
    ) -> List[str]:
        """
        ページリストから選択肢を抽出
        
        Args:
            pages: ページリスト
            title_property: タイトルプロパティ名
            max_options: 最大選択肢数
        
        Returns:
            選択肢のリスト
        """
        options = []
        
        for page in pages[:max_options]:
            title = self.get_property_value(page, title_property)
            if title:
                options.append(str(title))
        
        return options
    
    def get_menu_by_tags(
        self,
        database_id: str,
        tags: List[str],
        limit: int = 10
    ) -> List[str]:
        """
        タグでメニューを検索して選択肢を返す
        
        Args:
            database_id: データベースID
            tags: 検索タグリスト
            limit: 取得件数制限
        
        Returns:
            メニュー名のリスト
        """
        if not self.client or not database_id:
            return []
        
        try:
            # 全ページを取得してフィルタリング
            pages = self.get_all_pages(database_id)
            menu_items = []
            
            for page in pages:
                # メニュー名を取得
                menu_name = self.get_property_value(page, "メニュー名")
                if not menu_name:
                    continue
                
                # タグが一致するかチェック
                category = self.get_property_value(page, "カテゴリ")
                if category and any(tag in str(category) for tag in tags):
                    menu_items.append(str(menu_name))
                    
                    if len(menu_items) >= limit:
                        break
            
            return menu_items
        
        except Exception as e:
            logger.error(f"タグ検索エラー: {e}")
            return []

    def get_menu_details_by_category(
        self,
        database_id: str,
        category_property: str,
        category_value: str,
        limit: int = 6,
        sort_by_priority: bool = True
    ) -> List[Dict[str, Any]]:
        """
        カテゴリ別にメニューの詳細情報を取得
        
        Args:
            database_id: データベースID
            category_property: カテゴリプロパティ名
            category_value: カテゴリ値
            limit: 取得件数
            sort_by_priority: 優先度でソートするか（デフォルト: True）
        
        Returns:
            メニュー詳細情報のリスト
        """
        try:
            logger.info(f"[DEBUG] メニュー検索開始: {category_property}={category_value}")
            
            pages = self.query_by_category(
                database_id=database_id,
                category_property=category_property,
                category_value=category_value,
                limit=limit,
                sort_by_priority=sort_by_priority
            )
            
            logger.info(f"[DEBUG] 取得ページ数: {len(pages)}件")
            
            details = []
            for page in pages:
                detail = {
                    "name": self._extract_property_value(page, "Name"),
                    "description": self._extract_property_value(page, "詳細説明"),
                    "short_desc": self._extract_property_value(page, "一言紹介"),
                    "price": self._extract_property_value(page, "Price", 0),
                    "image_url": self._extract_property_value(page, "メイン画像URL"),
                    "category": self._extract_property_value(page, "Category"),
                    "subcategory": self._extract_property_value(page, "Subcategory"),
                    "priority": self._extract_property_value(page, "優先度", 999)
                }
                
                logger.debug(f"[DEBUG] メニュー項目: {detail['name']} - Category:{detail['category']}, Subcategory:{detail['subcategory']}")
                
                details.append(detail)
            
            logger.info(f"[OK] メニュー詳細取得完了: {category_value} - {len(details)}件")
            return details
            
        except Exception as e:
            logger.error(f"メニュー詳細取得エラー: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            return []
    
    def get_all_menu_categories(self, database_id: str) -> List[str]:
        """
        全メニューのカテゴリ一覧を取得
        
        Args:
            database_id: データベースID
        
        Returns:
            カテゴリ名のリスト
        """
        try:
            all_pages = self.get_all_pages(database_id)
            categories = set()
            
            for page in all_pages:
                category = self._extract_property_value(page, "Category")
                if category:
                    categories.add(category)
            
            return list(categories)
            
        except Exception as e:
            logger.error(f"カテゴリ一覧取得エラー: {e}")
            return []
    
    def _sort_by_priority(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        ページリストを優先度順にソート
        
        Args:
            pages: ページリスト
        
        Returns:
            ソートされたページリスト
        """
        def get_priority(page):
            """ページの優先度を取得（数値が小さいほど優先）"""
            priority = self._extract_property_value(page, "優先度", default=999)
            # Noneの場合は最低優先度
            if priority is None:
                return 999
            return priority
        
        try:
            # 優先度でソート（昇順：1, 2, 3...）
            sorted_pages = sorted(pages, key=get_priority)
            
            # デバッグログ
            for page in sorted_pages[:5]:  # 上位5件のみログ出力
                name = self._extract_property_value(page, "Name")
                priority = self._extract_property_value(page, "優先度", 999)
                logger.debug(f"[DEBUG] ソート後: {name} (優先度: {priority})")
            
            return sorted_pages
        except Exception as e:
            logger.warning(f"優先度ソートエラー: {e}")
            return pages  # エラー時は元の順序のまま返す
    
    def _extract_property_value(self, page: Dict[str, Any], property_name: str, default=None):
        """
        ページからプロパティ値を安全に抽出
        
        Args:
            page: Notionページオブジェクト
            property_name: プロパティ名
            default: デフォルト値
        
        Returns:
            プロパティ値
        """
        try:
            if "properties" in page and property_name in page["properties"]:
                prop = page["properties"][property_name]
                
                # プロパティタイプに応じて値を抽出
                if prop["type"] == "title" and prop["title"]:
                    return prop["title"][0]["text"]["content"]
                elif prop["type"] == "rich_text" and prop["rich_text"]:
                    return prop["rich_text"][0]["text"]["content"]
                elif prop["type"] == "number":
                    # numberがNoneの場合はdefault値を返す
                    return prop["number"] if prop["number"] is not None else default
                elif prop["type"] == "select" and prop["select"]:
                    return prop["select"]["name"]
                elif prop["type"] == "url":
                    return prop["url"]
                
            return default
            
        except Exception as e:
            logger.debug(f"プロパティ抽出エラー ({property_name}): {e}")
            return default
    
    def get_pages_by_property(
        self, 
        database_id: str, 
        property_name: str, 
        property_value: Any
    ) -> List[Dict[str, Any]]:
        """
        プロパティ値でページを検索
        
        Args:
            database_id: データベースID
            property_name: プロパティ名
            property_value: 検索値
            
        Returns:
            マッチしたページのリスト
        """
        try:
            if not self.client:
                logger.error("Notionクライアントが初期化されていません")
                return []
            
            # プロパティタイプに応じてフィルタを作成
            filter_condition = self._create_property_filter(property_name, property_value)
            
            response = self.client.databases.query(
                database_id=database_id,
                filter=filter_condition
            )
            
            pages = response.get("results", [])
            logger.info(f"✅ プロパティ '{property_name}' = '{property_value}' で {len(pages)} 件のページを取得")
            return pages
            
        except Exception as e:
            logger.error(f"❌ プロパティ検索エラー: {e}")
            return []
    
    def get_pages_by_filter(
        self, 
        database_id: str, 
        filters: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        複数フィルタでページを検索
        
        Args:
            database_id: データベースID
            filters: フィルタ条件のリスト
            
        Returns:
            マッチしたページのリスト
        """
        try:
            if not self.client:
                logger.error("Notionクライアントが初期化されていません")
                return []
            
            # 複数フィルタをAND条件で結合
            if len(filters) == 1:
                filter_condition = filters[0]
            else:
                filter_condition = {
                    "and": filters
                }
            
            response = self.client.databases.query(
                database_id=database_id,
                filter=filter_condition
            )
            
            pages = response.get("results", [])
            logger.info(f"✅ 複数フィルタで {len(pages)} 件のページを取得")
            return pages
            
        except Exception as e:
            logger.error(f"❌ 複数フィルタ検索エラー: {e}")
            return []
    
    def get_page(self, page_id: str) -> Dict[str, Any]:
        """
        ページIDでページを取得
        
        Args:
            page_id: ページID
            
        Returns:
            ページデータ
        """
        try:
            if not self.client:
                logger.error("Notionクライアントが初期化されていません")
                return {}
            
            response = self.client.pages.retrieve(page_id=page_id)
            logger.info(f"✅ ページ {page_id} を取得")
            return response
            
        except Exception as e:
            logger.error(f"❌ ページ取得エラー: {e}")
            return {}
    
    def _create_property_filter(self, property_name: str, property_value: Any) -> Dict[str, Any]:
        """
        プロパティフィルタを作成
        
        Args:
            property_name: プロパティ名
            property_value: 検索値
            
        Returns:
            フィルタ条件
        """
        # 値の型に応じてフィルタを作成
        if isinstance(property_value, str):
            return {
                "property": property_name,
                "rich_text": {"equals": property_value}
            }
        elif isinstance(property_value, bool):
            return {
                "property": property_name,
                "checkbox": {"equals": property_value}
            }
        elif isinstance(property_value, (int, float)):
            return {
                "property": property_name,
                "number": {"equals": property_value}
            }
        else:
            # デフォルトはテキスト検索
            return {
                "property": property_name,
                "rich_text": {"equals": str(property_value)}
            }
    
    def get_cross_sell_recommendations(
        self,
        page_id: str,
        limit: int = 3
    ) -> List[Dict[str, Any]]:
        """
        クロスセル推薦メニューを取得
        
        Args:
            page_id: メニューページのID
            limit: 取得する推薦数
        
        Returns:
            推薦メニューのリスト
        """
        try:
            if not self.client:
                logger.warning("[CrossSell] Notionクライアント未初期化")
                return []
            
            # ページ情報を取得
            page = self.client.pages.retrieve(page_id)
            properties = page.get("properties", {})
            
            # 「一緒におすすめ」Relationを取得
            recommendations = []
            if "一緒におすすめ" in properties:
                relation_array = properties["一緒におすすめ"].get("relation", [])
                
                logger.info(f"[CrossSell] {len(relation_array)}件の関連を検出")
                
                for rel in relation_array[:limit]:
                    rel_id = rel.get("id")
                    if rel_id:
                        try:
                            # 関連メニューの詳細を取得
                            rel_page = self.client.pages.retrieve(rel_id)
                            
                            recommendation = {
                                "id": rel_id,
                                "name": self._extract_property_value(rel_page, "Name"),
                                "price": self._extract_property_value(rel_page, "Price", 0),
                                "short_desc": self._extract_property_value(rel_page, "一言紹介"),
                                "suggest_message": self._extract_property_value(rel_page, "提案メッセージ"),
                                "priority": self._extract_property_value(rel_page, "おすすめ優先度", 0)
                            }
                            recommendations.append(recommendation)
                            logger.info(f"[CrossSell] 推薦取得: {recommendation['name']}")
                        
                        except Exception as e:
                            logger.error(f"[CrossSell] 関連ページ取得エラー: {e}")
                            continue
            else:
                logger.info("[CrossSell] 「一緒におすすめ」プロパティなし")
            
            # 優先度でソート（高い順）
            recommendations.sort(key=lambda x: x.get("priority", 0), reverse=True)
            
            logger.info(f"[CrossSell] 最終的に{len(recommendations)}件の推薦を返却")
            return recommendations[:limit]
        
        except Exception as e:
            logger.error(f"[CrossSell] 推薦取得エラー: {e}")
            import traceback
            logger.error(f"[CrossSell] トレースバック: {traceback.format_exc()}")
            return []
    
    def find_menu_page_by_name(
        self,
        database_id: str,
        menu_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        メニュー名からNotionページを検索
        
        Args:
            database_id: メニューデータベースID
            menu_name: メニュー名（部分一致可）
        
        Returns:
            見つかったページオブジェクト、見つからない場合はNone
        """
        if not self.client or not database_id:
            return None
        
        try:
            # 完全一致で検索
            response = self.client.databases.query(
                database_id=database_id,
                filter={
                    "property": "Name",
                    "title": {
                        "equals": menu_name
                    }
                }
            )
            
            results = response.get("results", [])
            if results:
                logger.info(f"[CrossSell] メニュー発見（完全一致）: {menu_name}")
                return results[0]
            
            # 部分一致で検索
            response = self.client.databases.query(
                database_id=database_id,
                filter={
                    "property": "Name",
                    "title": {
                        "contains": menu_name
                    }
                }
            )
            
            results = response.get("results", [])
            if results:
                logger.info(f"[CrossSell] メニュー発見（部分一致）: {menu_name} → {self._extract_property_value(results[0], 'Name')}")
                return results[0]
            
            # 「刺身」→「刺」に変換して検索（「まぐろ刺身」→「まぐろ刺」）
            if "刺身" in menu_name:
                menu_name_variant = menu_name.replace("刺身", "刺")
                response = self.client.databases.query(
                    database_id=database_id,
                    filter={
                        "property": "Name",
                        "title": {
                            "equals": menu_name_variant
                        }
                    }
                )
                results = response.get("results", [])
                if results:
                    logger.info(f"[CrossSell] メニュー発見（刺身→刺変換）: {menu_name} → {self._extract_property_value(results[0], 'Name')}")
                    return results[0]
                
                # 部分一致でも試す
                response = self.client.databases.query(
                    database_id=database_id,
                    filter={
                        "property": "Name",
                        "title": {
                            "contains": menu_name_variant
                        }
                    }
                )
                results = response.get("results", [])
                if results:
                    logger.info(f"[CrossSell] メニュー発見（刺身→刺変換・部分一致）: {menu_name} → {self._extract_property_value(results[0], 'Name')}")
                    return results[0]
            
            # キーワード抽出による柔軟な検索
            # 「まぐろ刺身」→「まぐろ」で検索、「いか刺身」→「いか」で検索
            search_keywords = []
            
            # 「刺身」を除去（「いか刺身」→「いか」）
            keyword = menu_name.replace("刺身", "").replace("刺", "").strip()
            if keyword and keyword != menu_name and len(keyword) >= 2:  # 2文字以上のみ
                search_keywords.append(keyword)
            
            # 「定食」を除去
            keyword = menu_name.replace("定食", "").strip()
            if keyword and keyword != menu_name and keyword not in search_keywords and len(keyword) >= 2:
                search_keywords.append(keyword)
            
            # より具体的な検索のため、魚名のマッピングを使用
            fish_name_mappings = {
                "いか": ["いか", "イカ", "烏賊"],
                "まぐろ": ["まぐろ", "マグロ", "鮪"],
                "サーモン": ["サーモン", "さーもん", "鮭", "しゃけ"],
                "鯛": ["鯛", "タイ", "真鯛"],
                "あじ": ["あじ", "アジ", "鯵"],
                "ほたて": ["ほたて", "ホタテ", "帆立"],
                "さば": ["さば", "サバ", "鯖"],
                "ぶり": ["ぶり", "ブリ", "鰤"],
                "かつお": ["かつお", "カツオ", "鰹"],
                "たこ": ["たこ", "タコ", "蛸"],
                "えび": ["えび", "エビ", "海老"],
            }
            
            # 抽出したキーワードが魚名マッピングに含まれる場合、そのバリエーションも追加
            for extracted_keyword in search_keywords[:]:  # コピーを作成してイテレート
                for fish_name, variations in fish_name_mappings.items():
                    if extracted_keyword in variations or fish_name in extracted_keyword:
                        # バリエーションを追加（既存のものは除外）
                        for variation in variations:
                            if variation not in search_keywords and len(variation) >= 2:
                                search_keywords.append(variation)
                        break
            
            logger.info(f"[CrossSell] キーワード抽出: {menu_name} → {search_keywords}")
            
            # より具体的なキーワード（長いもの）を優先的に検索
            search_keywords.sort(key=len, reverse=True)
            
            for keyword in search_keywords:
                response = self.client.databases.query(
                    database_id=database_id,
                    filter={
                        "property": "Name",
                        "title": {
                            "contains": keyword
                        }
                    }
                )
                
                results = response.get("results", [])
                if results:
                    found_name = self._extract_property_value(results[0], 'Name')
                    logger.info(f"[CrossSell] メニュー発見（キーワード: {keyword}）: {menu_name} → {found_name}")
                    # 検索キーワードがメニュー名に含まれていることを確認（より正確なマッチ）
                    if keyword in found_name or found_name in menu_name or menu_name in found_name:
                        return results[0]
                    # 部分一致でも候補として返す（複数候補がある場合は最初のものを返す）
                    if len(results) == 1:
                        return results[0]
            
            # デバッグ: 刺身関連のメニューを全て取得して表示
            logger.warning(f"[CrossSell] メニューが見つかりません: {menu_name}")
            logger.info(f"[CrossSell] デバッグ: 刺身関連メニューを検索中...")
            
            # 「刺身」を含むメニューを全て取得
            debug_response = self.client.databases.query(
                database_id=database_id,
                filter={
                    "property": "Name",
                    "title": {
                        "contains": "刺身"
                    }
                }
            )
            
            debug_results = debug_response.get("results", [])
            if debug_results:
                logger.info(f"[CrossSell] 「刺身」を含むメニュー: {len(debug_results)}件")
                for idx, page in enumerate(debug_results[:10]):
                    name = self._extract_property_value(page, 'Name')
                    logger.info(f"[CrossSell]   {idx+1}. {name}")
            else:
                logger.warning(f"[CrossSell] 「刺身」を含むメニューが見つかりません")
            
            return None
            
        except Exception as e:
            logger.error(f"[CrossSell] メニュー検索エラー: {e}")
            return None
    
    def get_cross_sell_by_menu_name(
        self,
        database_id: str,
        menu_name: str,
        limit: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        メニュー名からクロスセル候補を取得（指示書のget_cross_sell_candidatesに相当）
        
        Args:
            database_id: メニューデータベースID
            menu_name: メニュー名
            limit: 取得する推薦数
        
        Returns:
            クロスセル情報の辞書、見つからない場合はNone
            {
                "base_menu": str,
                "recommended_list": List[str],
                "priority": int,
                "proposal_msg": str
            }
        """
        if not self.client or not database_id:
            return None
        
        try:
            # メニューページを検索
            current_page = self.find_menu_page_by_name(database_id, menu_name)
            if not current_page:
                return None
            
            base_menu_name = self._extract_property_value(current_page, "Name")
            if not base_menu_name:
                return None
            
            properties = current_page.get("properties", {})
            
            # 「一緒におすすめ」Relationを取得
            relation_prop = properties.get("一緒におすすめ", {})
            relation_ids = []
            if relation_prop.get("type") == "relation":
                relation_array = relation_prop.get("relation", [])
                relation_ids = [rel.get("id") for rel in relation_array if rel.get("id")]
            
            # 関連メニューの名前を取得
            recommended_names = []
            for rel_id in relation_ids[:limit]:
                try:
                    rel_page = self.client.pages.retrieve(rel_id)
                    rel_name = self._extract_property_value(rel_page, "Name")
                    if rel_name:
                        recommended_names.append(rel_name)
                except Exception as e:
                    logger.error(f"[CrossSell] 関連ページ取得エラー: {rel_id} - {e}")
                    continue
            
            # 「おすすめ優先度」を取得
            priority = self._extract_property_value(current_page, "おすすめ優先度", 0)
            if priority is None:
                priority = 0
            
            # 「提案メッセージ」を取得
            proposal_msg = self._extract_property_value(current_page, "提案メッセージ", "")
            
            return {
                "base_menu": base_menu_name,
                "recommended_list": recommended_names,
                "priority": priority,
                "proposal_msg": proposal_msg
            }
            
        except Exception as e:
            logger.error(f"[CrossSell] クロスセル取得エラー: {e}")
            import traceback
            logger.error(f"[CrossSell] トレースバック: {traceback.format_exc()}")
            return None
    
    def cross_sell_message(
        self,
        database_id: str,
        current_menu_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        メニュー名からクロスセルメッセージを生成（指示書のcross_sell_messageに相当）
        
        Args:
            database_id: メニューデータベースID
            current_menu_name: 現在のメニュー名
        
        Returns:
            クロスセルメッセージ情報、見つからない場合はNone
            {
                "text": str,
                "priority": int,
                "items": List[str]
            }
        """
        if not self.client or not database_id:
            return None
        
        try:
            # クロスセル候補を取得
            data = self.get_cross_sell_by_menu_name(database_id, current_menu_name)
            if not data or not data.get("recommended_list"):
                return None
            
            recommended_list = data["recommended_list"]
            priority = data.get("priority", 0)
            proposal_msg = data.get("proposal_msg", "")
            
            # メッセージ生成：提案メッセージ > デフォルト文面
            if proposal_msg:
                msg = proposal_msg
            else:
                # デフォルト文面
                if len(recommended_list) == 1:
                    msg = f"{current_menu_name}と一緒に、{recommended_list[0]}もいかがでしょう？相性が良い組み合わせです。"
                elif len(recommended_list) == 2:
                    msg = f"{current_menu_name}と一緒に、{recommended_list[0]}や{recommended_list[1]}もいかがでしょう？相性が良い組み合わせです。"
                else:
                    rec_str = "、".join(recommended_list[:3])
                    msg = f"{current_menu_name}と一緒に、{rec_str}もいかがでしょう？相性が良い組み合わせです。"
            
            return {
                "text": msg,
                "priority": priority,
                "items": recommended_list
            }
            
        except Exception as e:
            logger.error(f"[CrossSell] メッセージ生成エラー: {e}")
            return None
    
    def save_conversation_history(
        self,
        database_id: str,
        customer_id: str,
        question: str,
        answer: str,
        timestamp: Optional[datetime] = None,
        satisfaction: Optional[int] = None,
        menu_reference: Optional[str] = None,
        channel: str = "Web",
        intent: Optional[str] = None,
        search_keyword: Optional[str] = None
    ) -> bool:
        """
        会話履歴をNotionデータベースに保存（リトライ機能付き）
        
        Args:
            database_id: 会話履歴データベースID
            customer_id: 顧客ID（匿名、必須）
            question: 質問内容
            answer: 回答内容
            timestamp: タイムスタンプ（Noneの場合は現在時刻、JST）
            satisfaction: 満足度（1-5の整数、オプション）
            menu_reference: 参照されたメニュー名（オプション）
            channel: チャネル（LINE/Web/電話/店頭/その他、デフォルト: Web）
            intent: 意図（Menu.search / Menu.detail / Reservation.ask / Hours.ask / Access.ask / Price.ask / Other、オプション）
            search_keyword: 検索キーワード（オプション）
        
        Returns:
            保存成功時True、失敗時False
        """
        if not self.client:
            logger.warning("Notionクライアントが初期化されていません")
            return False
        
        if not database_id:
            logger.warning("会話履歴データベースIDが設定されていません")
            return False
        
        # 顧客IDが空の場合はエラー
        if not customer_id or not customer_id.strip():
            logger.error("顧客IDが空です。会話履歴を保存できません。")
            return False
        
        # タイムスタンプの準備（JSTタイムゾーン付きISO8601形式）
        if timestamp is None:
            timestamp = datetime.now(timezone.utc).astimezone()  # システムのローカルタイムゾーン
        elif timestamp.tzinfo is None:
            # タイムゾーン情報がない場合はJST（UTC+9）を仮定
            timestamp = timestamp.replace(tzinfo=timezone.utc).astimezone()
        
        # Notion API用のプロパティを構築
        properties = {
            "顧客ID": {
                "title": [
                    {
                        "text": {
                            "content": customer_id[:2000]  # Notionの制限に合わせて切り詰め
                        }
                    }
                ]
            },
            "質問内容": {
                "rich_text": [
                    {
                        "text": {
                            "content": question[:2000]  # Notionの制限に合わせて切り詰め
                        }
                    }
                ]
            },
            "回答内容": {
                "rich_text": [
                    {
                        "text": {
                            "content": answer[:2000]  # Notionの制限に合わせて切り詰め
                        }
                    }
                ]
            },
            "会話日時": {
                "date": {
                    "start": timestamp.isoformat()  # ISO8601形式（タイムゾーン付き）
                }
            },
            "チャネル": {
                "select": {
                    "name": channel
                }
            }
        }
        
        # 意図が指定されている場合は追加（select型）
        if intent and intent.strip():
            properties["意図"] = {
                "select": {
                    "name": intent[:100]  # Notionの制限に合わせて切り詰め
                }
            }
        
        # 検索キーワードが指定されている場合は追加（rich_text型）
        if search_keyword and search_keyword.strip():
            properties["検索キーワード"] = {
                "rich_text": [
                    {
                        "text": {
                            "content": search_keyword[:2000]  # Notionの制限に合わせて切り詰め
                        }
                    }
                ]
            }
        
        # 満足度が指定されている場合は追加（1-5の整数）
        if satisfaction is not None:
            if isinstance(satisfaction, int) and 1 <= satisfaction <= 5:
                properties["満足度"] = {
                    "number": satisfaction
                }
            else:
                logger.warning(f"満足度の値が無効です（1-5の範囲外）: {satisfaction}")
        
        # メニュー参照が指定されている場合は追加
        if menu_reference and menu_reference.strip():
            properties["メニュー参照"] = {
                "rich_text": [
                    {
                        "text": {
                            "content": menu_reference[:2000]  # Notionの制限に合わせて切り詰め
                        }
                    }
                ]
            }
        
        # リトライロジック（指数バックオフ）
        max_retries = 4
        base_delay = 1  # 初回1秒
        
        for attempt in range(max_retries):
            try:
                # 送信前のログ（構造化ログ）
                conversation_id = f"{customer_id}_{timestamp.isoformat()}"
                logger.debug(f"[ConversationHistory] 送信開始: conversation_id={conversation_id}, attempt={attempt+1}")
                logger.debug(f"[ConversationHistory] ペイロード: customer_id={customer_id[:8]}..., question_length={len(question)}, answer_length={len(answer)}")
                
                # ページを作成
                page = self.client.pages.create(
                    parent={"database_id": database_id},
                    properties=properties
                )
                
                # 成功時のログ
                page_id = page.get("id", "")
                page_url = page.get("url", "")
                logger.info(f"[OK] 会話履歴を保存しました: conversation_id={conversation_id}, page_id={page_id[:8]}..., url={page_url}")
                
                return True
                
            except Exception as e:
                error_code = getattr(e, 'code', None)
                error_status = getattr(e, 'status', None)
                
                # 429（レート制限）または503（サービス利用不可）の場合はリトライ
                if error_status in [429, 503] and attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)  # 指数バックオフ: 1s, 2s, 4s, 8s
                    logger.warning(f"[ConversationHistory] リトライ待機: status={error_status}, attempt={attempt+1}/{max_retries}, delay={delay}s")
                    time.sleep(delay)
                    continue
                else:
                    # リトライ不可または最大リトライ回数に達した場合
                    logger.error(f"❌ 会話履歴の保存に失敗: conversation_id={conversation_id}, error={e}, status={error_status}")
                    import traceback
                    logger.error(f"トレースバック: {traceback.format_exc()}")
                    return False
        
        # ここに到達することはないはずだが、念のため
        logger.error(f"❌ 会話履歴の保存に失敗: 最大リトライ回数に達しました")
        return False
    
    def get_conversation_nodes(
        self,
        database_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        会話ノードDBからノード一覧を取得（ページネーション対応）
        
        Args:
            database_id: 会話ノードDBのID
            limit: 取得する最大件数
        
        Returns:
            会話ノードのリスト
        """
        try:
            if not self.client:
                logger.error("❌ [ConversationNodes] Notionクライアント未初期化")
                logger.error("【対処方法】NOTION_API_KEY が正しく設定されているか確認してください")
                return []
            
            # ページネーション対応で取得
            nodes = []
            has_more = True
            start_cursor = None
            page_size = min(100, limit)  # Notion APIの最大ページサイズは100
            
            while has_more and len(nodes) < limit:
                query_params = {
                    "database_id": database_id,
                    "page_size": page_size
                }
                if start_cursor:
                    query_params["start_cursor"] = start_cursor
                
                response = self.client.databases.query(**query_params)
                results = response.get("results", [])
                
                # 取得したページを処理
                for page in results:
                    try:
                        # プロパティを取得
                        properties = page.get("properties", {})
                        
                        # ノードID（title型、またはrich_text型の可能性がある）
                        # まず「ノードID」プロパティを直接取得を試行
                        node_id = None
                        
                        # 「ノードID」プロパティが存在する場合
                        if "ノードID" in properties:
                            prop = properties["ノードID"]
                            prop_type = prop.get("type", "")
                            
                            # title型の場合
                            if prop_type == "title":
                                title_array = prop.get("title", [])
                                if title_array and len(title_array) > 0:
                                    node_id = title_array[0].get("plain_text", "") or \
                                             title_array[0].get("text", {}).get("content", "")
                            # rich_text型の場合
                            elif prop_type == "rich_text":
                                rich_text_array = prop.get("rich_text", [])
                                if rich_text_array and len(rich_text_array) > 0:
                                    node_id = rich_text_array[0].get("plain_text", "") or \
                                             rich_text_array[0].get("text", {}).get("content", "")
                        
                        # フォールバック: _extract_property_valueを使用
                        if not node_id:
                            node_id = self._extract_property_value(page, "ノードID") or \
                                     self._extract_property_value(page, "ノード名 1") or \
                                     page.get("id", "")
                        
                        # デバッグ: ノードIDが空の場合は警告
                        if not node_id or node_id == page.get("id", ""):
                            logger.warning(f"[ConversationNodes] ノードIDが取得できません。ページID: {page.get('id', '')}, プロパティ: {list(properties.keys())}")
                        
                        # ノード名
                        node_name = self._extract_property_value(page, "ノード名 1") or \
                                  self._extract_property_value(page, "ノード名") or \
                                  node_id
                        
                        # キーワード
                        keywords = self._extract_property_value(page, "キーワード", "")
                        if keywords:
                            keywords = [kw.strip() for kw in keywords.split(",")]
                        else:
                            keywords = []
                        
                        # レスポンステンプレート
                        template = self._extract_property_value(page, "レスポンステンプレート", "")
                        
                        # カテゴリ
                        category = self._extract_property_value(page, "カテゴリ", "")
                        
                        # サブカテゴリ
                        subcategory = self._extract_property_value(page, "サブカテゴリ", "")
                        
                        # 優先度
                        priority = self._extract_property_value(page, "優先度", 999)
                        
                        # 遷移先（relation）- 遅延読み込み：最初はページIDのみ保存
                        # 高速化のため、遷移先ノードの詳細取得は必要になった時に行う
                        next_nodes = []
                        if "遷移先" in properties:
                            relation_array = properties["遷移先"].get("relation", [])
                            for rel in relation_array:
                                rel_id = rel.get("id")
                                if rel_id:
                                    # ページIDをそのまま保存（ノードIDの取得は後で行う）
                                    next_nodes.append(rel_id)
                                    logger.debug(f"[ConversationNodes] 遷移先ページID保存: {rel_id}")
                        
                        # URL
                        url = self._extract_property_value(page, "URL", "")
                        
                        # ノード情報を構築
                        node = {
                            "id": node_id,
                            "name": node_name,
                            "keywords": keywords,
                            "template": template,
                            "category": category,
                            "subcategory": subcategory,
                            "priority": priority,
                            "next": next_nodes,
                            "url": url,
                            "page_id": page.get("id"),
                            "last_edited_time": page.get("last_edited_time")
                        }
                        
                        nodes.append(node)
                        # デバッグ: 宴会ノードが見つかった場合は特にログ出力（「飲み放題」を含むノードも検出）
                        if node_id and ("banquet" in node_id.lower() or "宴会" in str(node_name) or "飲み放題" in str(node_name)):
                            logger.info(f"[ConversationNodes] 宴会ノード取得: {node_id} (name: {node_name})")
                        else:
                            logger.debug(f"[ConversationNodes] ノード取得: {node_id}")
                    
                    except Exception as e:
                        logger.error(f"[ConversationNodes] ノード処理エラー: {e}")
                        continue
                
                # ページネーション制御
                has_more = response.get("has_more", False)
                if has_more:
                    start_cursor = response.get("next_cursor")
                else:
                    break
            
            logger.info(f"[ConversationNodes] {len(nodes)}件のノードを取得")
            return nodes
        
        except Exception as e:
            # Notion API エラーの詳細を解析
            from notion_client.errors import APIResponseError
            if isinstance(e, APIResponseError):
                error_msg = str(e)
                if e.status == 401:
                    logger.error(f"❌ [ConversationNodes] Notion API 認証エラー: {e.code}")
                    logger.error(f"   メッセージ: {error_msg}")
                    logger.error("【重要】401 Unauthorized = API Key が無効です")
                    logger.error("【対処方法】")
                    logger.error("  1. Railway の環境変数タブで NOTION_API_KEY を確認")
                    logger.error("  2. ローカルで動作する .env ファイルの NOTION_API_KEY と比較")
                    logger.error("  3. Railway の NOTION_API_KEY を正しい値に更新")
                    logger.error("  4. デプロイを再実行")
                elif e.status == 404:
                    logger.error(f"❌ [ConversationNodes] データベースが見つかりません: {e.code}")
                    logger.error(f"   Database ID: {database_id[:20]}...")
                    logger.error("【対処方法】")
                    logger.error("  1. NOTION_DB_CONVERSATION が正しいか確認")
                    logger.error("  2. Notion Integration がこのデータベースへのアクセス権を持っているか確認")
                else:
                    logger.error(f"❌ [ConversationNodes] Notion API エラー: status={e.status}, code={e.code}")
                    logger.error(f"   メッセージ: {error_msg}")
            else:
                logger.error(f"[ConversationNodes] 取得エラー: {e}")
            
            import traceback
            logger.error(f"[ConversationNodes] トレースバック: {traceback.format_exc()}")
            return []

