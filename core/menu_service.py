"""
メニュー取得・整形サービス

NotionメニューDBから情報を取得して表示用に整形する
"""

import os
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from .notion_client import NotionClient

logger = logging.getLogger(__name__)


@dataclass
class MenuItemView:
    """表示用のメニューアイテム"""
    name: str
    price: Optional[int] = None
    one_liner: Optional[str] = None  # 一言紹介
    description: Optional[str] = None
    recommendation: Optional[str] = None  # おすすめ理由


class MenuService:
    """メニュー取得・整形サービス"""
    
    def __init__(self, notion_client: NotionClient, menu_db_id: Optional[str] = None):
        """
        Args:
            notion_client: NotionClientインスタンス
            menu_db_id: メニューDBのID（Noneの場合は環境変数から取得）
        """
        self.notion_client = notion_client
        self.menu_db_id = menu_db_id or os.getenv("NOTION_DS_MENU")
        
        if not self.menu_db_id:
            logger.warning("メニューDBのIDが設定されていません")
    
    def _get_title(self, properties: Dict[str, Any], key: str) -> str:
        """titleプロパティから値を取得"""
        prop = properties.get(key, {})
        if prop.get("type") == "title":
            title_array = prop.get("title", [])
            if title_array and len(title_array) > 0:
                return title_array[0].get("plain_text", "")
        return ""
    
    def _get_number(self, properties: Dict[str, Any], key: str) -> Optional[int]:
        """numberプロパティから値を取得"""
        prop = properties.get(key, {})
        if prop.get("type") == "number":
            return prop.get("number")
        return None
    
    def _get_rich_text(self, properties: Dict[str, Any], key: str) -> str:
        """rich_textプロパティから値を取得"""
        prop = properties.get(key, {})
        if prop.get("type") == "rich_text":
            rich_text_array = prop.get("rich_text", [])
            if rich_text_array and len(rich_text_array) > 0:
                return rich_text_array[0].get("plain_text", "")
        return ""
    
    def fetch_menu_items(
        self,
        keyword: str,
        limit: int = 5,
        category: Optional[str] = None,
        in_stock: bool = False
    ) -> List[MenuItemView]:
        """
        キーワードでメニューアイテムを検索（柔軟な部分一致対応）
        
        Args:
            keyword: 検索キーワード（Name部分一致）
            limit: 取得件数上限
            category: カテゴリーフィルタ（オプション）
            in_stock: 在庫ありのみに絞る（オプション）
        
        Returns:
            MenuItemViewのリスト
        """
        if not self.menu_db_id:
            logger.error("メニューDBのIDが設定されていません")
            return []
        
        try:
            # 柔軟なキーワード検索を実行
            menu_items = self._flexible_menu_search(keyword, limit, category, in_stock)
            
            logger.info(f"メニュー取得成功: キーワード='{keyword}', 件数={len(menu_items)}")
            return menu_items
            
        except Exception as e:
            logger.error(f"メニュー取得エラー: {e}")
            return []
    
    def _flexible_menu_search(
        self,
        keyword: str,
        limit: int = 5,
        category: Optional[str] = None,
        in_stock: bool = False
    ) -> List[MenuItemView]:
        """
        柔軟なメニュー検索（部分一致、類似キーワード対応）
        """
        all_items = []
        search_methods = []
        
        # 1. 完全一致検索
        exact_items = self._search_by_exact_match(keyword, limit, category, in_stock)
        if exact_items:
            search_methods.append(f"完全一致: {len(exact_items)}件")
        all_items.extend(exact_items)
        
        # 2. 部分一致検索（キーワードを分割して検索）
        if len(all_items) < limit:
            partial_items = self._search_by_partial_match(keyword, limit - len(all_items), category, in_stock)
            if partial_items:
                search_methods.append(f"部分一致: {len(partial_items)}件")
            all_items.extend(partial_items)
        
        # 3. 類似キーワード検索
        if len(all_items) < limit:
            similar_items = self._search_by_similar_keywords(keyword, limit - len(all_items), category, in_stock)
            if similar_items:
                search_methods.append(f"類似キーワード: {len(similar_items)}件")
            all_items.extend(similar_items)
        
        # 4. カテゴリ・サブカテゴリでの検索
        if len(all_items) < limit:
            category_items = self._search_by_category_keywords(keyword, limit - len(all_items), category, in_stock)
            if category_items:
                search_methods.append(f"カテゴリ検索: {len(category_items)}件")
            all_items.extend(category_items)
        
        # 重複を除去
        unique_items = []
        seen_names = set()
        for item in all_items:
            if item.name and item.name not in seen_names:
                unique_items.append(item)
                seen_names.add(item.name)
        
        # 検索方法のログ出力
        if search_methods:
            logger.info(f"[MenuService] 検索方法: {', '.join(search_methods)}")
        
        return unique_items[:limit]
    
    def _search_by_exact_match(
        self,
        keyword: str,
        limit: int,
        category: Optional[str],
        in_stock: bool
    ) -> List[MenuItemView]:
        """完全一致検索"""
        try:
            filters = []
            
            # キーワード検索（スペース区切りで複数キーワードをAND条件で検索）
            if keyword:
                keywords = keyword.split()
                if len(keywords) > 1:
                    # 複数キーワードの場合はAND条件
                    keyword_filters = []
                    for kw in keywords:
                        keyword_filters.append({
                            "property": "Name",
                            "title": {"contains": kw}
                        })
                    filters.append({"and": keyword_filters})
                else:
                    # 単一キーワードの場合
                    filters.append({
                        "property": "Name",
                        "title": {"contains": keyword}
                    })
            
            # カテゴリーフィルタ
            if category:
                filters.append({
                    "property": "Category",
                    "select": {"equals": category}
                })
            
            # 在庫フィルタ
            if in_stock:
                filters.append({
                    "property": "在庫あり",
                    "checkbox": {"equals": True}
                })
            
            # フィルタ条件を組み合わせ
            filter_condition = None
            if len(filters) > 1:
                filter_condition = {"and": filters}
            elif len(filters) == 1:
                filter_condition = filters[0]
            
            # データベースをクエリ
            pages = self.notion_client.query_database(
                database_id=self.menu_db_id,
                filter_conditions=filter_condition,
                sorts=[{"property": "Price", "direction": "ascending"}]
            )
            
            return self._convert_pages_to_menu_items(pages[:limit])
            
        except Exception as e:
            logger.error(f"完全一致検索エラー: {e}")
            return []
    
    def _search_by_partial_match(
        self,
        keyword: str,
        limit: int,
        category: Optional[str],
        in_stock: bool
    ) -> List[MenuItemView]:
        """部分一致検索（キーワードの一部で検索）"""
        try:
            # キーワードを分割して部分検索
            keywords = keyword.replace("セット", "").replace("とは", "").replace("について", "").strip()
            
            if not keywords:
                return []
            
            # 各単語で部分一致検索
            all_items = []
            for word in keywords.split():
                if len(word) >= 2:  # 2文字以上の単語のみ
                    items = self._search_by_exact_match(word, limit, category, in_stock)
                    all_items.extend(items)
            
            return all_items
            
        except Exception as e:
            logger.error(f"部分一致検索エラー: {e}")
            return []
    
    def _search_by_similar_keywords(
        self,
        keyword: str,
        limit: int,
        category: Optional[str],
        in_stock: bool
    ) -> List[MenuItemView]:
        """類似キーワード検索"""
        try:
            # 類似キーワードマッピング
            similar_keywords = {
                "せんべろセット": ["せんべろ", "千円", "セット", "千"],
                "せんべろ": ["千円", "千", "セット"],
                "ドリンク": ["飲み物", "ビール", "日本酒", "焼酎"],
                "ビール": ["ビア", "生ビール", "ドラフト"],
                "日本酒": ["酒", "清酒", "純米酒"],
                "焼酎": ["芋焼酎", "麦焼酎", "泡盛"],
                "馬刺し": ["馬", "刺身", "生肉"],
                "寿司": ["すし", "握り", "巻き"],
                "ランチ": ["昼", "定食"],  # 「弁当」を削除（テイクアウトとの混同を防ぐ）
                "定食": ["セット", "おかず"],
                "サラダ": ["野菜", "生野菜", "グリーンサラダ", "サラダ"],
                "逸品料理": ["一品料理", "一品", "つまみ", "おつまみ", "肴"],
            }
            
            similar_words = similar_keywords.get(keyword, [])
            all_items = []
            
            for similar_word in similar_words:
                items = self._search_by_exact_match(similar_word, limit, category, in_stock)
                all_items.extend(items)
            
            return all_items
            
        except Exception as e:
            logger.error(f"類似キーワード検索エラー: {e}")
            return []
    
    def _search_by_category_keywords(
        self,
        keyword: str,
        limit: int,
        category: Optional[str],
        in_stock: bool
    ) -> List[MenuItemView]:
        """カテゴリ・サブカテゴリでの検索"""
        try:
            # カテゴリキーワードマッピング
            category_mappings = {
                "せんべろ": ["Subcategory", "せんべろ"],
                "ドリンク": ["Category", "ドリンク"],
                "アルコール": ["Category", "アルコール"],
                "料理": ["Category", "料理"],
                "定食": ["Category", "定食"],
                "ランチ": ["Category", "ランチ"],
                "寿司ランチ": ["Subcategory", "寿司ランチ"],  # 寿司ランチサブカテゴリ追加
                "テイクアウト": ["Subcategory", "テイクアウト"],  # テイクアウトサブカテゴリ追加
                "弁当": ["Subcategory", "テイクアウト"],  # 弁当キーワードでテイクアウトサブカテゴリを検索
                "お弁当": ["Subcategory", "テイクアウト"],  # お弁当キーワードでテイクアウトサブカテゴリを検索
                "サラダ": ["Subcategory", "サラダ"],
                "逸品料理": ["Subcategory", "逸品料理"],
                "刺身": ["Category", "刺身"],  # 刺身フィルタ追加
                "海鮮刺身": ["Subcategory", "海鮮刺身"],  # 刺身フィルタ追加
                "焼き鳥": ["Subcategory", "焼き鳥"],  # 焼き鳥サブカテゴリ追加
            }
            
            all_items = []
            
            for keyword_lower in [keyword.lower(), keyword]:
                for prop_name, search_value in category_mappings.items():
                    if keyword_lower in prop_name or prop_name in keyword_lower:
                        try:
                            # カテゴリでの検索（Category/Subcategoryはselect型なのでselectフィルタを使用）
                            # プロパティ名でselect型かrich_text型かを判定
                            filter_type = "select" if search_value[0] in ["Category", "Subcategory"] else "rich_text"
                            
                            filters = [{
                                "property": search_value[0],
                                filter_type: {"equals": search_value[1]} if filter_type == "select" else {"contains": search_value[1]}
                            }]
                            
                            if in_stock:
                                filters.append({
                                    "property": "在庫あり",
                                    "checkbox": {"equals": True}
                                })
                            
                            pages = self.notion_client.query_database(
                                database_id=self.menu_db_id,
                                filter_conditions={"and": filters} if len(filters) > 1 else filters[0],
                                sorts=[{"property": "Price", "direction": "ascending"}]
                            )
                            
                            items = self._convert_pages_to_menu_items(pages[:limit])
                            all_items.extend(items)
                            
                        except Exception as e:
                            logger.error(f"カテゴリ検索エラー ({prop_name}): {e}")
                            continue
            
            return all_items
            
        except Exception as e:
            logger.error(f"カテゴリキーワード検索エラー: {e}")
            return []
    
    def _convert_pages_to_menu_items(self, pages: List[Dict[str, Any]]) -> List[MenuItemView]:
        """ページデータをMenuItemViewに変換"""
        menu_items = []
        for page in pages:
            properties = page.get("properties", {})
            
            menu_item = MenuItemView(
                name=self._get_title(properties, "Name"),
                price=self._get_number(properties, "Price"),
                one_liner=self._get_rich_text(properties, "一言紹介"),
                description=self._get_rich_text(properties, "Description"),
                recommendation=self._get_rich_text(properties, "おすすめ理由")
            )
            
            if menu_item.name:  # 名前がある場合のみ追加
                menu_items.append(menu_item)
        
        return menu_items
    
    def format_menu_items(self, items: List[MenuItemView]) -> str:
        """
        メニューアイテムを表示用テキストに整形
        
        Args:
            items: MenuItemViewのリスト
        
        Returns:
            整形されたテキスト
        """
        if not items:
            return ""
        
        lines = []
        for item in items:
            # 名前と価格
            name = item.name
            price = f"{item.price:,}円" if item.price is not None else "価格はスタッフへ"
            
            # 特徴（優先順位: 一言紹介 > Description > おすすめ理由）
            feature = item.one_liner or item.description or item.recommendation or ""
            
            # フォーマット
            if feature:
                lines.append(f"- {name} ｜ {price}")
                lines.append(f"  {feature}")
            else:
                lines.append(f"- {name} ｜ {price}")
        
        return "\n".join(lines)
    
    def get_and_format_menu(
        self,
        keyword: str,
        limit: int = 5,
        category: Optional[str] = None,
        in_stock: bool = False
    ) -> str:
        """
        メニューを取得して整形（ワンステップ版）
        
        Args:
            keyword: 検索キーワード
            limit: 取得件数上限
            category: カテゴリーフィルタ（オプション）
            in_stock: 在庫ありのみに絞る（オプション）
        
        Returns:
            整形されたテキスト
        """
        items = self.fetch_menu_items(keyword, limit, category, in_stock)
        return self.format_menu_items(items)
    
    def search_menu_by_query(self, query: str, limit: int = 5) -> str:
        """
        ユーザーの質問からメニューを検索
        
        Args:
            query: ユーザーの質問文
            limit: 取得件数上限
        
        Returns:
            フォーマットされたメニュー文字列
        """
        if not query:
            return ""
        
        # 質問からキーワードを抽出
        keywords = self._extract_keywords_from_query(query)
        
        if not keywords:
            return ""
        
            # 各キーワードでメニューを検索
        all_items = []
        for keyword in keywords:
            logger.info(f"[MenuService] キーワード検索開始: '{keyword}'")
            items = self.fetch_menu_items(keyword, limit=limit)
            logger.info(f"[MenuService] キーワード '{keyword}' 検索結果: {len(items)}件")
            
            # 検索結果の詳細ログ
            if items:
                for i, item in enumerate(items, 1):
                    logger.info(f"[MenuService]   {i}. {item.name} (¥{item.price})")
            
            all_items.extend(items)
            
            # せんべろセットで結果が見つからない場合、せんべろで再検索
            if keyword == "せんべろセット" and len(items) == 0:
                logger.info(f"[MenuService] せんべろセットが見つからないため、せんべろで再検索")
                fallback_items = self.fetch_menu_items("せんべろ", limit=limit)
                logger.info(f"[MenuService] フォールバック検索結果: {len(fallback_items)}件")
                all_items.extend(fallback_items)
        
        # 重複を除去
        unique_items = []
        seen_names = set()
        for item in all_items:
            if item.name not in seen_names:
                unique_items.append(item)
                seen_names.add(item.name)
        
        # 上限を適用
        unique_items = unique_items[:limit]
        
        return self.format_menu_items(unique_items)
    
    def _extract_keywords_from_query(self, query: str) -> List[str]:
        """
        質問文からメニュー検索用のキーワードを抽出
        
        Args:
            query: ユーザーの質問文
        
        Returns:
            抽出されたキーワードのリスト
        """
        query_lower = query.lower()
        
        # メニュー関連のキーワードマッピング
        keyword_mappings = {
            # ドリンク系
            "ドリンク": ["ドリンク", "飲み物"],
            "せんべろ": ["せんべろ", "千円", "千"],
            "せんべろセット": ["せんべろセット", "せんべろ セット", "せんべろセットとは", "せんべろセットについて"],
            "ビール": ["ビール"],
            "黄": ["黄"],
            "日本酒": ["日本酒", "酒"],
            "焼酎": ["焼酎"],
            "アルコール": ["アルコール", "お酒"],
            
            # 料理系
            "馬刺し": ["馬刺し", "馬"],
            "寿司": ["寿司", "すし", "握り", "にぎり"],
            "ランチ": ["ランチ", "昼"],
            "定食": ["定食"],
            "海鮮": ["海鮮", "魚"],
            "海鮮丼": ["海鮮丼", "海鮮 丼", "海鮮どんぶり"],
            "寿司ランチ": ["寿司ランチ", "寿司 ランチ", "すしランチ"],
            "サラダ": ["サラダ", "野菜", "生野菜"],
            "逸品料理": ["逸品料理", "一品料理", "一品", "つまみ", "おつまみ"],
            "天ぷら": ["天ぷら", "天麩羅", "揚げ物", "てんぷら", "天ぷらメニュー"],
            "焼き鳥": ["焼き鳥", "やきとり", "焼鳥"],
            
            # クイック・すぐ系
            "すぐ": ["すぐ", "早い", "すぐ出る", "クイック", "早く"],
            "テイクアウト": ["テイクアウト", "持ち帰り"],
            "弁当": ["弁当", "お弁当", "べんとう", "BENTO", "bento"],  # 弁当を独立したキーワードとして追加
            
            # その他
            "おすすめ": ["おすすめ", "推薦"],
            "人気": ["人気"],
        }
        
        extracted_keywords = []
        
        # キーワードマッピングをチェック（より具体的なマッチングを優先）
        # まず、より具体的なキーワードからチェック
        sorted_keywords = sorted(keyword_mappings.items(), key=lambda x: len(x[0]), reverse=True)
        
        for keyword, variations in sorted_keywords:
            for variation in variations:
                if variation in query_lower:
                    # より具体的なキーワードが既に含まれていない場合のみ追加
                    if not any(existing_kw.startswith(keyword) or keyword.startswith(existing_kw) 
                              for existing_kw in extracted_keywords if existing_kw != keyword):
                        extracted_keywords.append(keyword)
                    break
        
        # 特別なケース: 「せんべろセットとは」のような質問文の処理
        if "せんべろセット" in query_lower and "とは" in query_lower:
            if "せんべろセット" not in extracted_keywords:
                extracted_keywords.append("せんべろセット")
        
        if "せんべろセット" in query_lower and "について" in query_lower:
            if "せんべろセット" not in extracted_keywords:
                extracted_keywords.append("せんべろセット")
        
        # 直接的なキーワードも追加（優先順位付き）
        priority_keywords = [
            "せんべろセット",  # より具体的なキーワードを優先
            "せんべろ",
            "ドリンク", 
            "ビール", 
            "日本酒", 
            "焼酎", 
            "馬刺し", 
            "寿司", 
            "ランチ", 
            "定食",
            "サラダ",
            "逸品料理",
            "焼き鳥"
        ]
        
        for keyword in priority_keywords:
            if keyword in query_lower:
                # 既に追加されていない場合のみ追加（重複を避ける）
                if keyword not in extracted_keywords:
                    extracted_keywords.append(keyword)
        
        # 特別なケース: 「ランチ」が含まれる質問では「寿司ランチ」も検索対象に含める
        if "ランチ" in extracted_keywords and "寿司ランチ" not in extracted_keywords:
            extracted_keywords.append("寿司ランチ")
        
        # 重複を除去
        final_keywords = list(set(extracted_keywords))
        
        # デバッグ用ログ
        logger.info(f"[MenuService] 質問: '{query}'")
        logger.info(f"[MenuService] 抽出キーワード: {final_keywords}")
        
        return final_keywords

