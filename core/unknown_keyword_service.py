"""
不明キーワード記録DB検索サービス

Notion DB「📝 不明キーワード記録」から類似質問を検索し、
標準回答をフォールバック回答として返す機能を提供します。
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

try:
    from rapidfuzz import fuzz
    _HAS_RAPIDFUZZ = True
except ImportError:
    _HAS_RAPIDFUZZ = False
    logging.warning("rapidfuzzがインストールされていません。類似度計算にフォールバックします。")

from .notion_client import NotionClient

logger = logging.getLogger(__name__)


class UnknownKeywordSearchService:
    """不明キーワード記録DB検索サービス"""
    
    # 類似度しきい値（調整可能）
    SIMILARITY_THRESHOLD = 75.0
    
    # 最大取得件数
    MAX_CANDIDATES = 5
    
    def __init__(self, notion_client: Optional[NotionClient] = None, database_id: Optional[str] = None):
        """
        Args:
            notion_client: NotionClientインスタンス（Noneの場合は新規作成）
            database_id: 不明キーワード記録DB ID（Noneの場合は環境変数から取得）
        """
        self.notion_client = notion_client or NotionClient()
        self.database_id = database_id
        
        if not self.database_id:
            logger.warning("不明キーワード記録DB IDが設定されていません")
    
    def search_similar_question(
        self,
        query: str,
        threshold: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        類似質問を検索し、標準回答を返す
        
        Args:
            query: 検索クエリ（ユーザーの質問）
            threshold: 類似度しきい値（Noneの場合はデフォルト値を使用）
        
        Returns:
            マッチしたレコード情報（標準回答、質問内容、スコア等）またはNone
        """
        if not self.database_id:
            logger.debug("不明キーワードDB IDが設定されていないため、検索をスキップします")
            return None
        
        if not query or not query.strip():
            return None
        
        threshold = threshold or self.SIMILARITY_THRESHOLD
        
        try:
            # Notion DBから全レコードを取得
            pages = self.notion_client.get_all_pages(self.database_id)
            
            if not pages:
                logger.debug("不明キーワード記録DBにレコードがありません")
                return None
            
            # 各レコードと類似度を計算
            candidates = []
            
            for page in pages:
                try:
                    # 質問内容（Title）を取得
                    question_title = self.notion_client.get_property_value(
                        page, "質問内容", "title"
                    )
                    if not question_title:
                        continue
                    
                    # コンテキスト（Text）を取得（あれば）
                    context = self.notion_client.get_property_value(
                        page, "コンテキスト", "rich_text"
                    ) or ""
                    
                    # 標準回答（Text）を取得
                    standard_answer = self.notion_client.get_property_value(
                        page, "標準回答", "rich_text"
                    ) or ""
                    
                    # 標準回答が空の場合はスキップ
                    if not standard_answer or not standard_answer.strip():
                        continue
                    
                    # ステータス（Select）を取得（あれば）
                    status = self.notion_client.get_property_value(
                        page, "ステータス", "select"
                    ) or ""
                    
                    # 日時（Date）を取得
                    date_value = self.notion_client.get_property_value(
                        page, "日時", "date"
                    )
                    
                    # 類似度を計算
                    # 質問内容とコンテキストの両方を考慮
                    search_text = f"{question_title} {context}".strip()
                    
                    if _HAS_RAPIDFUZZ:
                        # RapidFuzzを使用
                        # token_set_ratioとpartial_ratioの平均を使用
                        score1 = fuzz.token_set_ratio(query, search_text)
                        score2 = fuzz.partial_ratio(query, search_text)
                        similarity_score = (score1 + score2) / 2.0
                    else:
                        # フォールバック: 簡易的な文字列一致度
                        query_lower = query.lower()
                        search_lower = search_text.lower()
                        if query_lower in search_lower:
                            similarity_score = 80.0
                        elif search_lower in query_lower:
                            similarity_score = 70.0
                        else:
                            # 共通文字数ベースの簡易スコア
                            common_chars = set(query_lower) & set(search_lower)
                            total_chars = set(query_lower) | set(search_lower)
                            if total_chars:
                                similarity_score = (len(common_chars) / len(total_chars)) * 100
                            else:
                                similarity_score = 0.0
                    
                    # しきい値以上の候補を追加
                    if similarity_score >= threshold:
                        candidates.append({
                            "similarity_score": similarity_score,
                            "question_title": question_title,
                            "standard_answer": standard_answer,
                            "context": context,
                            "status": status,
                            "date": date_value,
                            "page_id": page.get("id"),
                            "page_url": page.get("url", ""),
                        })
                
                except Exception as e:
                    logger.warning(f"レコード処理エラー: {e}")
                    continue
            
            if not candidates:
                logger.debug(f"類似度{threshold}以上の候補が見つかりませんでした（クエリ: {query[:50]}）")
                return None
            
            # スコア順にソート（降順）
            candidates.sort(key=lambda x: x["similarity_score"], reverse=True)
            
            # トップ1件を返す
            top_candidate = candidates[0]
            
            logger.info(
                f"不明キーワードDB検索成功: "
                f"スコア={top_candidate['similarity_score']:.1f}, "
                f"質問='{top_candidate['question_title'][:50]}'"
            )
            
            return top_candidate
        
        except Exception as e:
            logger.error(f"不明キーワードDB検索エラー: {e}")
            import traceback
            logger.error(f"トレースバック: {traceback.format_exc()}")
            return None
