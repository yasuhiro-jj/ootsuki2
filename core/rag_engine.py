"""
RAG（Retrieval-Augmented Generation）エンジン
焼き鳥・市場の天ぷら・酒のつまみ会話ノードシステム用
"""

import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class RAGDocument:
    """RAGドキュメント"""
    id: str
    content: str
    metadata: Dict[str, Any]
    canonical_url: str

@dataclass
class RAGMetadata:
    """RAGメタデータ"""
    category: str
    priority: int
    has_assort: bool
    cuisine: str
    tags: List[str]

class RAGIndexer:
    """RAGインデックス作成クラス"""
    
    def __init__(self):
        self.documents = []
        self.index = {}
    
    def create_document(self, node: Dict[str, Any]) -> RAGDocument:
        """ノードからRAGドキュメントを作成"""
        # コンテンツ結合
        content_parts = [
            node.get("template", ""),
            " ".join(node.get("keywords", [])),
            " ".join(node.get("related_menu", []))
        ]
        content = " ".join(filter(None, content_parts))
        
        # メタデータ作成
        metadata = self._create_metadata(node)
        
        return RAGDocument(
            id=node["id"],
            content=content,
            metadata=metadata.__dict__,
            canonical_url=node.get("url", "")
        )
    
    def _create_metadata(self, node: Dict[str, Any]) -> RAGMetadata:
        """メタデータ作成"""
        # cuisine判定
        cuisine = "other"
        if "yakitori" in node["id"]:
            cuisine = "yakitori"
        elif "tempura" in node["id"]:
            cuisine = "tempura"
        elif "snacks" in node["id"]:
            cuisine = "snacks"
        
        # has_assort判定（盛り合わせ/盛り合せ両方対応）
        template = node.get("template", "")
        has_assort = bool(re.search(r"盛り合わせ|盛り合せ", template))
        
        # tags（relatedMenu + keywords）
        tags = []
        tags.extend([self._normalize_term(menu) for menu in node.get("related_menu", [])])
        tags.extend([self._normalize_term(keyword) for keyword in node.get("keywords", [])])
        
        return RAGMetadata(
            category=node.get("category", ""),
            priority=node.get("priority", 99),
            has_assort=has_assort,
            cuisine=cuisine,
            tags=list(set(tags))
        )
    
    def _normalize_term(self, term: str) -> str:
        """テキスト正規化"""
        if not term:
            return ""
        return term.lower().strip()
    
    def index_documents(self, nodes: List[Dict[str, Any]]) -> List[RAGDocument]:
        """ドキュメントをインデックス化"""
        self.documents = []
        
        for node in nodes:
            if not node.get("enabled", True):
                continue
            
            document = self.create_document(node)
            self.documents.append(document)
            
            # インデックス構築
            self._build_index(document)
        
        logger.info(f"インデックス化完了: {len(self.documents)}件")
        return self.documents
    
    def _build_index(self, document: RAGDocument):
        """インデックス構築"""
        # 簡易インデックス（実際の実装ではより高度なインデックスを使用）
        words = document.content.lower().split()
        for word in words:
            if word not in self.index:
                self.index[word] = []
            self.index[word].append(document.id)

class HybridSearchEngine:
    """ハイブリッド検索エンジン"""
    
    def __init__(self, documents: List[RAGDocument]):
        self.documents = documents
        self.doc_by_id = {doc.id: doc for doc in documents}
    
    def search(self, query: str, top_k: int = 20) -> List[Tuple[RAGDocument, float]]:
        """ハイブリッド検索実行"""
        # BM25スコア計算
        bm25_scores = self._calculate_bm25_scores(query)
        
        # ベクトルスコア計算（簡易版）
        vector_scores = self._calculate_vector_scores(query)
        
        # 線形結合（重み: BM25 0.7, ベクトル 0.3）
        combined_scores = {}
        for doc_id in self.doc_by_id:
            bm25_score = bm25_scores.get(doc_id, 0.0)
            vector_score = vector_scores.get(doc_id, 0.0)
            combined_scores[doc_id] = 0.7 * bm25_score + 0.3 * vector_score
        
        # 上位20件を取得
        top_docs = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        
        # Cross-Encoder再ランキング
        reranked_docs = self._cross_encoder_rerank(query, top_docs)
        
        return reranked_docs
    
    def _calculate_bm25_scores(self, query: str) -> Dict[str, float]:
        """BM25スコア計算（簡易版）"""
        scores = {}
        query_terms = query.lower().split()
        
        for doc in self.documents:
            score = 0.0
            doc_terms = doc.content.lower().split()
            doc_length = len(doc_terms)
            
            for term in query_terms:
                term_freq = doc_terms.count(term)
                if term_freq > 0:
                    # 簡易BM25計算
                    score += term_freq / (doc_length + 1)
            
            scores[doc.id] = score
        
        return scores
    
    def _calculate_vector_scores(self, query: str) -> Dict[str, float]:
        """ベクトルスコア計算（簡易版）"""
        scores = {}
        query_terms = set(query.lower().split())
        
        for doc in self.documents:
            doc_terms = set(doc.content.lower().split())
            
            # コサイン類似度の簡易版
            intersection = len(query_terms.intersection(doc_terms))
            union = len(query_terms.union(doc_terms))
            
            if union > 0:
                scores[doc.id] = intersection / union
            else:
                scores[doc.id] = 0.0
        
        return scores
    
    def _cross_encoder_rerank(self, query: str, top_docs: List[Tuple[str, float]]) -> List[Tuple[RAGDocument, float]]:
        """Cross-Encoder再ランキング（簡易版）"""
        reranked = []
        
        for doc_id, score in top_docs:
            doc = self.doc_by_id[doc_id]
            
            # 簡易Cross-Encoder（実際の実装では専用モデルを使用）
            rerank_score = self._simple_cross_encoder(query, doc.content)
            
            reranked.append((doc, rerank_score))
        
        # スコア順でソート
        reranked.sort(key=lambda x: x[1], reverse=True)
        
        return reranked
    
    def _simple_cross_encoder(self, query: str, content: str) -> float:
        """簡易Cross-Encoder"""
        query_terms = set(query.lower().split())
        content_terms = set(content.lower().split())
        
        # クエリとコンテンツの重複度
        overlap = len(query_terms.intersection(content_terms))
        
        # 正規化
        if len(query_terms) > 0:
            return overlap / len(query_terms)
        else:
            return 0.0

class RAGEngine:
    """RAGエンジン統合クラス"""
    
    def __init__(self, nodes: List[Dict[str, Any]]):
        self.indexer = RAGIndexer()
        self.documents = self.indexer.index_documents(nodes)
        self.search_engine = HybridSearchEngine(self.documents)
    
    def search(self, query: str, filters: Optional[Dict[str, Any]] = None) -> List[RAGDocument]:
        """検索実行"""
        # フィルタ適用
        filtered_docs = self._apply_filters(filters)
        
        # 検索実行
        results = self.search_engine.search(query)
        
        # フィルタ済みドキュメントのみ返す
        filtered_results = [
            (doc, score) for doc, score in results 
            if doc in filtered_docs
        ]
        
        return [doc for doc, score in filtered_results]
    
    def _apply_filters(self, filters: Optional[Dict[str, Any]]) -> List[RAGDocument]:
        """フィルタ適用"""
        if not filters:
            return self.documents
        
        filtered = []
        for doc in self.documents:
            metadata = doc.metadata
            
            # enabled フィルタ
            if "enabled" in filters and not filters["enabled"]:
                continue
            
            # category フィルタ
            if "category" in filters and metadata.get("category") != filters["category"]:
                continue
            
            # cuisine フィルタ
            if "cuisine" in filters and metadata.get("cuisine") != filters["cuisine"]:
                continue
            
            # has_assort フィルタ
            if "has_assort" in filters and metadata.get("has_assort") != filters["has_assort"]:
                continue
            
            filtered.append(doc)
        
        return filtered
    
    def get_document_by_id(self, doc_id: str) -> Optional[RAGDocument]:
        """IDでドキュメント取得"""
        return self.indexer.doc_by_id.get(doc_id)

# 使用例
if __name__ == "__main__":
    # サンプルノード
    sample_nodes = [
        {
            "id": "yakitori_menu_overview",
            "name": "焼き鳥メニュー確認",
            "keywords": ["焼き鳥", "鳥", "串焼き"],
            "template": "焼き鳥メニューをご案内いたします。盛り合わせ、とりもも、ねぎまなど豊富にご用意しております。",
            "category": "基本確認",
            "priority": 1,
            "url": "/yakitori/overview",
            "related_menu": ["焼き鳥盛り合わせ", "とりもも", "ねぎま"],
            "enabled": True
        }
    ]
    
    # RAGエンジン初期化
    rag_engine = RAGEngine(sample_nodes)
    
    # 検索テスト
    test_queries = ["焼き鳥メニュー", "盛り合わせ", "とりもも"]
    
    for query in test_queries:
        print(f"\nクエリ: {query}")
        results = rag_engine.search(query)
        for doc in results[:3]:
            print(f"- {doc.id}: {doc.content[:50]}...")
