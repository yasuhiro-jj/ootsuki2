"""
焼き鳥・市場の天ぷら・酒のつまみ会話ノードシステム
微修正・追加提案反映版
"""

import re
import unicodedata
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime
import json

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class Node:
    """会話ノードのデータ構造"""
    id: str
    name: str
    keywords: List[str]
    template: str
    category: str
    priority: int
    url: str
    related_menu: List[str]
    enabled: bool
    next: List[str]

@dataclass
class SearchLog:
    """検索ログのデータ構造"""
    timestamp: int
    user_query: str
    normalized_query: str
    candidate_nodes: List[Dict[str, Any]]
    final_node: Dict[str, Any]
    excluded_reasons: List[Dict[str, str]]

class TextNormalizer:
    """テキスト正規化クラス"""
    
    def __init__(self):
        # 同義語辞書
        self.synonym_dict = {
            "ねぎま": ["ネギマ", "葱間"],
            "たれ": ["タレ", "タレ味"],
            "盛り合せ": ["盛り合わせ", "ミックス"],
            "らっかせい": ["落花生"],
            "とりもも": ["鳥もも"],
            "かき揚げ": ["かき揚"]
        }
    
    def normalize_term(self, text: str) -> str:
        """テキスト正規化"""
        if not text:
            return ""
        
        # NFKC正規化
        text = unicodedata.normalize('NFKC', text)
        
        # カタカナ変換
        text = self._to_katakana(text)
        
        # 小文字変換
        text = text.lower()
        
        # 句読点・中黒・全角カンマの統一
        text = re.sub(r'[、・,]', ',', text)
        
        # 空白の正規化
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def _to_katakana(self, text: str) -> str:
        """ひらがなをカタカナに変換"""
        return ''.join([chr(ord(c) + 96) if 'あ' <= c <= 'ん' else c for c in text])
    
    def expand_synonyms(self, term: str) -> List[str]:
        """同義語展開"""
        normalized = self.normalize_term(term)
        synonyms = [normalized]
        
        for key, values in self.synonym_dict.items():
            if normalized.find(key) != -1:
                for value in values:
                    synonyms.append(self.normalize_term(value))
        
        return list(set(synonyms))

class NodeResolver:
    """ノード解決クラス"""
    
    def __init__(self, nodes: List[Node]):
        self.nodes = nodes
        self.url_to_id_map = {}
        self.name_to_id_map = {}
        self.normalizer = TextNormalizer()
        
        # マップ構築
        for node in self.nodes:
            if node.url:
                self.url_to_id_map[node.url] = node.id
            self.name_to_id_map[self.normalizer.normalize_term(node.name)] = node.id
    
    def resolve_transition(self, relation_url: str) -> Optional[str]:
        """遷移先ノードID解決"""
        # 1. URL直接マッチ
        node_id = self.url_to_id_map.get(relation_url)
        if node_id:
            return node_id
        
        # 2. 正規化URLマッチ
        normalized_url = self.normalizer.normalize_term(relation_url)
        for url, node_id in self.url_to_id_map.items():
            if self.normalizer.normalize_term(url) == normalized_url:
                return node_id
        
        # 3. フォールバック: name マッチ
        return self.name_to_id_map.get(normalized_url)

class HybridSearchEngine:
    """ハイブリッド検索エンジン"""
    
    def __init__(self):
        self.normalizer = TextNormalizer()
        self.cat_order = ["基本確認", "料理系", "情報確認", "サポート", "比較検討", "麺類"]
    
    def search(self, query: str, nodes: List[Node]) -> List[Node]:
        """検索実行"""
        normalized_query = self.normalizer.normalize_term(query)
        expanded_terms = self.normalizer.expand_synonyms(query)
        
        # 候補ノード検索
        candidates = []
        for node in nodes:
            if not node.enabled:
                continue
            
            score = self._calculate_score(node, normalized_query, expanded_terms)
            if score > 0:
                candidates.append((node, score))
        
        # 優先度・カテゴリ順でソート
        candidates.sort(key=lambda x: (
            x[0].priority if x[0].priority is not None else 99,
            self.cat_order.index(x[0].category) if x[0].category in self.cat_order else 999
        ))
        
        return [node for node, score in candidates]
    
    def _calculate_score(self, node: Node, query: str, expanded_terms: List[str]) -> float:
        """スコア計算"""
        score = 0.0
        
        # キーワードマッチ
        for keyword in node.keywords:
            normalized_keyword = self.normalizer.normalize_term(keyword)
            for term in expanded_terms:
                if term.find(normalized_keyword) != -1:
                    score += 1.0
        
        # 関連メニューマッチ
        for menu in node.related_menu:
            normalized_menu = self.normalizer.normalize_term(menu)
            for term in expanded_terms:
                if term.find(normalized_menu) != -1:
                    score += 0.8
        
        # ノード名マッチ
        normalized_name = self.normalizer.normalize_term(node.name)
        for term in expanded_terms:
            if term.find(normalized_name) != -1:
                score += 0.6
        
        # URLマッチ
        if node.url:
            normalized_url = self.normalizer.normalize_term(node.url)
            for term in expanded_terms:
                if term.find(normalized_url) != -1:
                    score += 0.4
        
        return score

class SearchLogger:
    """検索ログクラス"""
    
    def __init__(self):
        self.logs = []
    
    def log_search(self, log: SearchLog):
        """検索ログ記録"""
        logger.info(f"Search Log: {log.user_query} -> {log.final_node.get('name', 'None')}")
        
        # 詳細ログ保存
        self.logs.append(log)
        
        # ファイルに保存（オプション）
        self._save_to_file(log)
    
    def _save_to_file(self, log: SearchLog):
        """ログをファイルに保存"""
        try:
            with open('search_logs.json', 'a', encoding='utf-8') as f:
                f.write(json.dumps(log.__dict__, ensure_ascii=False) + '\n')
        except Exception as e:
            logger.error(f"Failed to save log: {e}")

class ConversationNodeSystem:
    """会話ノードシステム"""
    
    def __init__(self, nodes: List[Node], notion_client=None, config=None):
        self.nodes = nodes
        self.node_resolver = NodeResolver(nodes)
        self.search_engine = HybridSearchEngine()
        self.logger = SearchLogger()
        self.normalizer = TextNormalizer()
        self.notion_client = notion_client
        self.config = config
        self.conversation_nodes_cache = {}
        self.cache_expiry = None
    
    def get_conversation_nodes(self) -> Dict[str, Any]:
        """
        Notion会話ノードDBからノードを取得（キャッシュ付き）
        
        Returns:
            会話ノードの辞書
        """
        try:
            # キャッシュチェック
            if self.conversation_nodes_cache and self.cache_expiry:
                from datetime import datetime
                if datetime.now() < self.cache_expiry:
                    return self.conversation_nodes_cache
            
            if not self.notion_client or not self.config:
                logger.warning("[ConversationNodes] NotionクライアントまたはConfig未設定")
                return {}
            
            # 会話ノードDBのIDを取得
            nodes_db_id = self.config.get("notion.database_ids.conversation_db")
            if not nodes_db_id:
                logger.warning("[ConversationNodes] 会話ノードDBのIDが設定されていません")
                return {}
            
            # Notionから会話ノードを取得
            nodes = self.notion_client.get_conversation_nodes(nodes_db_id, limit=200)
            
            # ノード辞書に変換
            conversation_nodes = {}
            for node_data in nodes:
                node_id = node_data.get("id")
                if node_id:
                    conversation_nodes[node_id] = node_data
            
            # キャッシュに保存（5分間）
            self.conversation_nodes_cache = conversation_nodes
            from datetime import datetime, timedelta
            self.cache_expiry = datetime.now() + timedelta(minutes=5)
            
            logger.info(f"[ConversationNodes] {len(conversation_nodes)}件のノードをキャッシュに保存")
            return conversation_nodes
            
        except Exception as e:
            logger.error(f"[ConversationNodes] 取得エラー: {e}")
            return {}
    
    def get_node_by_id(self, node_id: str) -> Optional[Dict[str, Any]]:
        """
        ノードIDで会話ノードを取得
        
        Args:
            node_id: ノードID
            
        Returns:
            ノード情報またはNone
        """
        conversation_nodes = self.get_conversation_nodes()
        node = conversation_nodes.get(node_id)
        
        # ノードが見つからない場合、大文字小文字を無視して検索
        if not node:
            for cached_node_id, cached_node_data in conversation_nodes.items():
                if cached_node_id.lower() == node_id.lower():
                    logger.info(f"[ConversationNodes] 大文字小文字を無視してノード発見: {node_id} → {cached_node_id}")
                    return cached_node_data
        
        # ノードが見つからない場合、ノード名でも検索
        if not node:
            for cached_node_id, cached_node_data in conversation_nodes.items():
                node_name = cached_node_data.get("name", "")
                if node_name and node_name.lower() == node_id.lower():
                    logger.info(f"[ConversationNodes] ノード名でノード発見: {node_id} → {cached_node_id} ({node_name})")
                    return cached_node_data
        
        return node
    
    def get_node_by_page_id(self, page_id: str) -> Optional[Dict[str, Any]]:
        """
        ページIDで会話ノードを取得（遷移先ノードの取得用）
        
        Args:
            page_id: NotionページID
            
        Returns:
            ノード情報またはNone
        """
        conversation_nodes = self.get_conversation_nodes()
        for node_id, node_data in conversation_nodes.items():
            if node_data.get("page_id") == page_id:
                return node_data
        
        # ページIDから直接取得（キャッシュにない場合）
        if self.notion_client:
            try:
                page = self.notion_client.client.pages.retrieve(page_id)
                node_id = self.notion_client._extract_property_value(page, "ノードID") or \
                         self.notion_client._extract_property_value(page, "ノード名 1") or \
                         page_id
                node_name = self.notion_client._extract_property_value(page, "ノード名 1") or \
                           self.notion_client._extract_property_value(page, "ノード名") or \
                           node_id
                template = self.notion_client._extract_property_value(page, "レスポンステンプレート", "")
                
                node = {
                    "id": node_id,
                    "name": node_name,
                    "template": template,
                    "next": [],
                    "page_id": page_id
                }
                logger.info(f"[ConversationNodes] ページIDからノード取得: {page_id} → {node_id}")
                return node
            except Exception as e:
                logger.error(f"[ConversationNodes] ページID取得エラー: {e}")
        
        return None
    
    def process_query(self, user_query: str) -> Dict[str, Any]:
        """クエリ処理"""
        start_time = int(datetime.now().timestamp() * 1000)
        normalized_query = self.normalizer.normalize_term(user_query)
        
        # 検索実行
        candidates = self.search_engine.search(user_query, self.nodes)
        
        # ログ収集
        log = SearchLog(
            timestamp=start_time,
            user_query=user_query,
            normalized_query=normalized_query,
            candidate_nodes=[
                {
                    "id": node.id,
                    "name": node.name,
                    "score": 1.0,  # 簡易スコア
                    "reason": "keyword_match"
                } for node in candidates
            ],
            final_node={
                "id": candidates[0].id if candidates else "",
                "name": candidates[0].name if candidates else "",
                "score": 1.0 if candidates else 0.0
            } if candidates else {},
            excluded_reasons=[]
        )
        
        self.logger.log_search(log)
        
        # レスポンス生成
        if not candidates:
            return self._create_fallback_response()
        
        return self._render_node(candidates[0])
    
    def _render_node(self, node: Node) -> Dict[str, Any]:
        """ノードレンダリング"""
        body = node.template
        
        # 遷移先ノード解決
        options = []
        for next_url in node.next:
            next_node_id = self.node_resolver.resolve_transition(next_url)
            if next_node_id:
                next_node = next(self._find_node_by_id(next_node_id), None)
                if next_node and next_node.enabled:
                    options.append({
                        "label": next_node.name,
                        "value": next_node.id
                    })
        
        return {
            "body": body,
            "options": options
        }
    
    def _find_node_by_id(self, node_id: str):
        """IDでノード検索"""
        return (node for node in self.nodes if node.id == node_id)
    
    def _create_fallback_response(self) -> Dict[str, Any]:
        """フォールバックレスポンス"""
        # 基本確認カテゴリで優先度最小のノードを探す
        fallback_nodes = [
            node for node in self.nodes 
            if node.enabled and node.category == "基本確認"
        ]
        
        if fallback_nodes:
            fallback_node = min(fallback_nodes, key=lambda x: x.priority or 99)
            return self._render_node(fallback_node)
        
        return {
            "body": "申し訳ございません。担当者に確認いたします。",
            "options": []
        }

# 使用例
def create_sample_nodes() -> List[Node]:
    """サンプルノード作成"""
    return [
        Node(
            id="yakitori_menu_overview",
            name="焼き鳥メニュー確認",
            keywords=["焼き鳥", "鳥", "串焼き"],
            template="焼き鳥メニューをご案内いたします。盛り合わせ、とりもも、ねぎまなど豊富にご用意しております。さらに、いろいろ少しずつ楽しめる『焼き鳥盛り合わせ』もございます。どちらにされますか？",
            category="基本確認",
            priority=1,
            url="/yakitori/overview",
            related_menu=["焼き鳥盛り合わせ", "とりもも", "ねぎま"],
            enabled=True,
            next=["/yakitori/assort", "/yakitori/torimomo", "/tempura/overview", "/snacks/overview"]
        ),
        Node(
            id="tempura_menu_overview",
            name="天ぷらメニュー確認",
            keywords=["天ぷら", "揚げ物"],
            template="市場の天ぷらメニューをご案内いたします。野菜、海鮮、かき揚げなど豊富にご用意しております。さらに、いろいろ少しずつ楽しめる『天ぷら盛り合せ』もございます。どちらにされますか？",
            category="基本確認",
            priority=1,
            url="/tempura/overview",
            related_menu=["天ぷら盛り合せ", "海老天", "野菜天ぷら"],
            enabled=True,
            next=["/tempura/assort", "/yakitori/overview", "/snacks/overview"]
        ),
        Node(
            id="snacks_menu_overview",
            name="酒のつまみ確認",
            keywords=["酒のつまみ", "つまみ", "お酒"],
            template="酒のつまみメニューをご案内いたします。もろきゅう、ゆでらっかせい、冷奴など、お酒に合う一品をご用意しております。どちらにされますか？",
            category="基本確認",
            priority=1,
            url="/snacks/overview",
            related_menu=["もろきゅう", "ゆでらっかせい", "冷奴"],
            enabled=True,
            next=["/snacks/menu", "/yakitori/overview", "/tempura/overview"]
        )
    ]

if __name__ == "__main__":
    # サンプル実行
    nodes = create_sample_nodes()
    system = ConversationNodeSystem(nodes)
    
    # テストクエリ
    test_queries = [
        "焼き鳥メニューを教えて",
        "天ぷらについて",
        "つまみは何がある？"
    ]
    
    for query in test_queries:
        print(f"\nクエリ: {query}")
        response = system.process_query(query)
        print(f"レスポンス: {response['body']}")
        print(f"選択肢: {[opt['label'] for opt in response['options']]}")
