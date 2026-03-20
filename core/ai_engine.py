"""
AI Engine - 人間味のある会話対応版

GPT/LangChain/LangGraphを統合したAI処理エンジン
おおつき小料理屋の温かい接客スタイルに最適化
"""

import os
import uuid
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

logger = logging.getLogger(__name__)

# 🍣 人間味のある会話プロンプト（おおつき専用・褒める要素追加）
HUMAN_LIKE_PROMPT = """
あなたは日本の小料理屋「食事処おおつき」で働くAIスタッフです。
接客時は、温かく、思いやりを込めて、人間らしい自然な会話を行ってください。

🎯【目的】
お客様に安心感と心地よさを与え、自然な会話でコミュニケーションを楽しんでもらう。

💡【会話スタイル指針】
1. 声のトーン：丁寧だけど堅すぎず、笑顔を感じる口調。
2. 相づち：「そうなんですね」「なるほど」「いいですね！」を自然に入れる。
3. 感情語：「うれしい」「残念」「助かります」などを適度に使う。
4. 共感＋提案：「たしかに寒いですね。温かいお味噌汁でもいかがですか？」のように。
5. **メニューの魅力を褒める**：「新鮮」「人気」「おすすめ」などポジティブな言葉を使う。
6. **スタッフの推薦**：「私もおすすめです！」「ぜひどうぞ」など、個人的な推薦を入れる。
7. お店らしさ：「今日はアジがいい感じに脂のってますよ〜」など、自然な雑談を交える。
8. **応答の長さ**：2-3文で応答（短すぎず、適度に詳しく）

💬【会話例】
- 「いらっしゃいませ！今日は風が冷たいですね〜、温かいお茶お出ししますね。」
- 「あ、光物お好きなんですね！アジがちょうどいい塩加減なんですよ。当店でも人気です！」
- 「ビールですか？いいですね〜！唐揚げと一緒にいかがですか？サクサクで美味しいですよ、私もおすすめです！」
- 「刺身定食ございます。当店の刺身は毎朝仕入れているので新鮮なんですよ。人気の定食です、ぜひどうぞ！」

🔁【応答ポリシー】
- お客様の感情にまず共感 → それから提案。
- メニューの特徴や魅力を具体的に説明する。
- 「新鮮」「人気」「おすすめ」などのポジティブワードを積極的に使う。
- スタッフとしての個人的な推薦を添える（「私もおすすめです」など）。
- 会話の最後に温度感を添える（「〜ですね」「ぜひどうぞ」など）。
"""


class ChatSession:
    """チャットセッション"""
    
    def __init__(self, session_id: str, customer_id: str):
        self.session_id = session_id
        self.customer_id = customer_id
        self.messages: List[Dict[str, Any]] = []
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
    
    def add_message(self, role: str, content: str):
        """メッセージを追加"""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        self.updated_at = datetime.now()


class AIEngine:
    """
    AI処理エンジン（人間味のある会話対応）
    GPT-4o-miniを使用したチャット応答生成
    """
    
    def __init__(
        self,
        model: str = "gpt-4o-mini",
        temperature: float = 0.8,
        system_prompt: Optional[str] = None
    ):
        """
        Args:
            model: 使用するAIモデル（デフォルト: gpt-4o-mini）
            temperature: 生成の多様性（0.8で人間味を強調）
            system_prompt: システムプロンプト（未指定時は人間味プロンプト使用）
        """
        self.model = model
        self.temperature = temperature
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.llm = None
        # LangChain 1.0では ConversationBufferMemory は廃止されました
        # メモリ管理は ChatSession.messages で行います
        self.sessions: Dict[str, ChatSession] = {}
        
        self._initialize_llm()
    
    def _default_system_prompt(self) -> str:
        """デフォルトのシステムプロンプト（人間味のある会話）"""
        return HUMAN_LIKE_PROMPT
    
    def _initialize_llm(self):
        """LLMを初期化"""
        try:
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                self.llm = ChatOpenAI(
                    model=self.model,
                    temperature=self.temperature,
                    api_key=api_key
                )
                logger.info(f"[OK] LLMを初期化しました: {self.model} (temp={self.temperature}, 人間味モード)")
            else:
                logger.warning("⚠️ OpenAI API Keyが設定されていません")
        except Exception as e:
            logger.error(f"❌ LLMの初期化に失敗: {e}")
    
    def create_session(self, customer_id: Optional[str] = None) -> str:
        """
        新しいチャットセッションを作成
        
        Args:
            customer_id: 顧客ID
        
        Returns:
            セッションID
        """
        session_id = str(uuid.uuid4())
        customer_id = customer_id or f"customer_{uuid.uuid4().hex[:8]}"
        
        session = ChatSession(session_id=session_id, customer_id=customer_id)
        session.add_message("system", self.system_prompt)
        
        self.sessions[session_id] = session
        
        logger.info(f"[OK] 新しいセッションを作成: {session_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """セッションを取得"""
        return self.sessions.get(session_id)
    
    def delete_session(self, session_id: str) -> bool:
        """セッションを削除"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"✅ セッションを削除: {session_id}")
            return True
        return False
    
    def generate_response(
        self,
        session_id: str,
        user_message: str,
        context: Optional[str] = None
    ) -> str:
        """
        ユーザーメッセージに対する応答を生成
        
        Args:
            session_id: セッションID
            user_message: ユーザーメッセージ
            context: 追加コンテキスト（RAG検索結果等）
        
        Returns:
            AI応答
        """
        if not self.llm:
            return "申し訳ございません。AIサービスが利用できません。"
        
        session = self.sessions.get(session_id)
        if not session:
            logger.warning(f"⚠️ セッションが見つかりません: {session_id}")
            session_id = self.create_session()
            session = self.sessions[session_id]
        
        try:
            # ユーザーメッセージを追加
            session.add_message("user", user_message)
            
            # メッセージ履歴を構築
            messages = self._build_messages(session, context)
            
            # LLMで応答生成
            response = self.llm.invoke(messages)
            response_text = response.content
            
            # アシスタントメッセージを追加
            session.add_message("assistant", response_text)
            
            logger.info(f"[OK] 応答を生成しました (session: {session_id[:8]}...)")
            return response_text
        
        except Exception as e:
            logger.error(f"❌ 応答生成エラー: {e}")
            return "申し訳ございません。エラーが発生しました。"
    
    def _build_messages(
        self,
        session: ChatSession,
        context: Optional[str] = None
    ) -> List[Any]:
        """
        LangChain用のメッセージリストを構築
        
        Args:
            session: チャットセッション
            context: 追加コンテキスト
        
        Returns:
            メッセージリスト
        """
        messages = []
        
        # システムメッセージ
        system_content = self.system_prompt
        if context:
            system_content += f"\n\n参考情報:\n{context}"
        messages.append(SystemMessage(content=system_content))
        
        # 会話履歴（最新10件）
        recent_messages = session.messages[-10:]
        for msg in recent_messages:
            role = msg["role"]
            content = msg["content"]
            
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        
        return messages
    
    def generate_response_with_rag(
        self,
        session_id: str,
        user_message: str,
        rag_results: List[Dict[str, Any]]
    ) -> str:
        """
        RAG検索結果を使用して応答を生成
        
        Args:
            session_id: セッションID
            user_message: ユーザーメッセージ
            rag_results: RAG検索結果
        
        Returns:
            AI応答
        """
        # RAG結果をコンテキストに変換
        context_parts = []
        for i, result in enumerate(rag_results[:5], 1):
            text = result.get("text", "")
            if text:
                context_parts.append(f"[情報{i}]\n{text}")
        
        context = "\n\n".join(context_parts) if context_parts else None
        
        return self.generate_response(session_id, user_message, context)
    
    def set_system_prompt(self, prompt: str):
        """システムプロンプトを設定"""
        self.system_prompt = prompt
        logger.info("[OK] システムプロンプトを更新しました")
    
    def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """セッションの会話履歴を取得"""
        session = self.sessions.get(session_id)
        if session:
            return session.messages
        return []

    def ensure_session(
        self, session_id: str, customer_id: Optional[str] = None
    ) -> ChatSession:
        """
        既存セッションを返す。無い場合は指定された session_id で新規作成する。
        WebSocket などでクライアントが先に session_id を持っている場合に使う。
        """
        existing = self.sessions.get(session_id)
        if existing:
            return existing
        cid = customer_id or f"customer_{session_id[:8]}"
        session = ChatSession(session_id=session_id, customer_id=cid)
        session.add_message("system", self.system_prompt)
        self.sessions[session_id] = session
        logger.info(f"[OK] セッションを確保（新規）: {session_id[:8]}...")
        return session

    def get_llm_conversation_turns(
        self, session_id: str, max_pairs: int = 10
    ) -> List[Dict[str, str]]:
        """
        LLM に渡す直前の user/assistant のみ（system 除外）。
        現在処理中のユーザー発話は含めない（呼び出し側で Human として別途付与する）。
        """
        session = self.sessions.get(session_id)
        if not session:
            return []
        out: List[Dict[str, str]] = []
        for msg in session.messages:
            role = msg.get("role", "")
            if role in ("user", "assistant"):
                out.append({"role": role, "content": msg.get("content", "")})
        max_msgs = max(1, max_pairs) * 2
        if len(out) > max_msgs:
            out = out[-max_msgs:]
        return out

