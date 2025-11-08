"""
Chroma Client

ChromaDBを使用したRAG（Retrieval-Augmented Generation）検索を提供
"""

import os
import logging
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# ChromaDB/OpenAI Embeddings（存在すれば使用）
try:
    from langchain_openai import OpenAIEmbeddings
    from langchain_community.vectorstores import Chroma
    from langchain_core.documents import Document
    _HAS_CHROMA = True
except Exception:
    _HAS_CHROMA = False


class SimpleVectorStore:
    """
    軽量なベクターストア実装（ChromaDB未使用時のフォールバック）
    TF-IDF風の単語ベクトルで類似度検索を行う
    """
    
    def __init__(self):
        self.documents: List[Dict[str, Any]] = []
        self.vocab: Dict[str, int] = {}
        self.matrix: List[List[float]] = []
    
    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """
        簡易トークナイズ
        - 英数字は単語単位
        - 日本語等は2文字バイグラム
        """
        if not text:
            return []
        
        s = text.lower().replace("\n", " ")
        tokens: List[str] = []
        
        try:
            import re
            # 英数字の単語
            tokens.extend(re.findall(r"[a-z0-9_]+", s))
            # 2文字バイグラム（日本語等）
            seq = [ch for ch in s if not ch.isspace()]
            tokens.extend(["".join(seq[i:i+2]) for i in range(len(seq) - 1)])
        except Exception:
            tokens.extend([t for t in s.split() if t.strip()])
        
        return [t for t in tokens if t]
    
    def add_documents(self, docs: List[Dict[str, Any]]):
        """ドキュメントを追加"""
        # 語彙収集
        for d in docs:
            for tok in self._tokenize(d.get("text", "")):
                if tok not in self.vocab:
                    self.vocab[tok] = len(self.vocab)
        
        # ベクトル化
        self.documents.extend(docs)
        for d in docs:
            vec = [0.0] * len(self.vocab)
            for tok in self._tokenize(d.get("text", "")):
                idx = self.vocab.get(tok)
                if idx is not None:
                    vec[idx] += 1.0
            self.matrix.append(vec)
    
    def similarity(self, qvec: List[float], dvec: List[float]) -> float:
        """コサイン類似度を計算"""
        import math
        dot = sum(q * d for q, d in zip(qvec, dvec))
        qn = math.sqrt(sum(q * q for q in qvec)) or 1e-9
        dn = math.sqrt(sum(d * d for d in dvec)) or 1e-9
        return dot / (qn * dn)
    
    def query(self, question: str, k: int = 5) -> List[Dict[str, Any]]:
        """類似ドキュメントを検索"""
        tokens = self._tokenize(question)
        qvec = [0.0] * len(self.vocab)
        for tok in tokens:
            idx = self.vocab.get(tok)
            if idx is not None:
                qvec[idx] += 1.0
        
        scored = [(self.similarity(qvec, dvec), i) for i, dvec in enumerate(self.matrix)]
        scored.sort(reverse=True)
        top = [self.documents[i] for _, i in scored[:k] if _ > 0]
        return top


class ChromaClient:
    """
    ChromaDBを使用したRAG検索クライアント
    """
    
    def __init__(
        self,
        persist_dir: str = "data/chroma",
        collection_name: str = "documents"
    ):
        """
        Args:
            persist_dir: ChromaDBの永続化ディレクトリ
            collection_name: コレクション名
        """
        self.persist_dir = persist_dir
        self.collection_name = collection_name
        self.vector_db = None
        self.embeddings = None
        self.simple_store = SimpleVectorStore()
        self.using_chroma = False
        self._built = False
        self.last_doc_count = 0
        
        # ディレクトリ作成
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
    
    def build(self, documents: List[Dict[str, Any]]):
        """
        ドキュメントからベクターストアを構築
        
        Args:
            documents: ドキュメントのリスト [{"id": str, "text": str, "type": str}]
        """
        try:
            if not documents:
                logger.warning("⚠️ ドキュメントが空です")
                return
            
            # ChromaDBが利用可能な場合
            if _HAS_CHROMA and os.getenv("OPENAI_API_KEY"):
                try:
                    self._build_chroma(documents)
                    self.using_chroma = True
                    logger.info(f"[OK] ChromaDBでRAGを構築: {len(documents)}件")
                except Exception as e:
                    logger.warning(f"⚠️ ChromaDB構築失敗、SimpleVectorStoreを使用: {e}")
                    self._build_simple(documents)
            else:
                # フォールバック: SimpleVectorStore
                self._build_simple(documents)
            
            self._built = True
            self.last_doc_count = len(documents)
        
        except Exception as e:
            logger.error(f"❌ RAG構築エラー: {e}")
            raise
    
    def _build_chroma(self, documents: List[Dict[str, Any]]):
        """ChromaDBでベクターストアを構築"""
        # OpenAI Embeddingsを初期化
        self.embeddings = OpenAIEmbeddings()
        
        # LangChain Document形式に変換
        docs = [
            Document(
                page_content=doc.get("text", ""),
                metadata={"id": doc.get("id"), "type": doc.get("type", "unknown")}
            )
            for doc in documents
        ]
        
        # Chromaベクターストアを作成
        self.vector_db = Chroma.from_documents(
            documents=docs,
            embedding=self.embeddings,
            persist_directory=self.persist_dir,
            collection_name=self.collection_name
        )
        
        # 永続化
        if hasattr(self.vector_db, 'persist'):
            self.vector_db.persist()
    
    def _build_simple(self, documents: List[Dict[str, Any]]):
        """SimpleVectorStoreでベクターストアを構築"""
        self.simple_store.add_documents(documents)
        logger.info(f"[OK] SimpleVectorStoreでRAGを構築: {len(documents)}件")
    
    def query(self, question: str, k: int = 5) -> List[Dict[str, Any]]:
        """
        類似ドキュメントを検索
        
        Args:
            question: 検索クエリ
            k: 取得件数
        
        Returns:
            類似ドキュメントのリスト
        """
        if not self._built:
            logger.warning("⚠️ RAGが構築されていません")
            return []
        
        try:
            # ChromaDBを使用
            if self.using_chroma and self.vector_db:
                results = self.vector_db.similarity_search(question, k=k)
                return [
                    {
                        "text": doc.page_content,
                        "id": doc.metadata.get("id"),
                        "type": doc.metadata.get("type")
                    }
                    for doc in results
                ]
            
            # SimpleVectorStoreを使用
            else:
                return self.simple_store.query(question, k=k)
        
        except Exception as e:
            logger.error(f"❌ RAG検索エラー: {e}")
            return []
    
    def upsert_texts(self, items: List[Dict[str, Any]]) -> int:
        """
        テキストを追加・更新
        
        Args:
            items: [{"id": str, "text": str, "type": str}]
        
        Returns:
            追加件数
        """
        try:
            if not items:
                return 0
            
            # ChromaDBに追加
            if self.using_chroma and self.vector_db:
                docs = [
                    Document(
                        page_content=item.get("text", ""),
                        metadata={"id": item.get("id"), "type": item.get("type", "manual")}
                    )
                    for item in items
                ]
                self.vector_db.add_documents(docs)
                if hasattr(self.vector_db, 'persist'):
                    self.vector_db.persist()
            
            # SimpleVectorStoreに追加
            else:
                self.simple_store.add_documents(items)
            
            self.last_doc_count += len(items)
            logger.info(f"[OK] {len(items)}件のドキュメントを追加しました")
            return len(items)
        
        except Exception as e:
            logger.error(f"❌ ドキュメント追加エラー: {e}")
            return 0
    
    def purge(self):
        """永続化ディレクトリを削除してリセット"""
        try:
            if os.path.isdir(self.persist_dir):
                shutil.rmtree(self.persist_dir)
                logger.info(f"[OK] Chromaディレクトリを削除: {self.persist_dir}")
                self._built = False
                self.using_chroma = False
                self.vector_db = None
        except Exception as e:
            logger.warning(f"⚠️ Chromaディレクトリ削除失敗: {e}")

