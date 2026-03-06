import uuid
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import os

from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..models.conversation import ChatSession, Message, MessageRole, ChatRequest, ChatResponse, ConversationState
from ..models.notion_models import MenuItem, MenuCategory
from .notion_service import NotionService
from ..config import settings
from .rag_service import RAGService
from .unknown_keyword_service import UnknownKeywordSearchService

logger = logging.getLogger(__name__)

class ChatService:
    """チャット処理サービス"""
    
    def __init__(self, rag_service: Optional[RAGService] = None, serp_service: Optional[Any] = None):
        self.notion_service = NotionService()
        self.llm = None
        self.memory = ConversationBufferMemory(return_messages=True)
        self.sessions: Dict[str, ChatSession] = {}
        self.conversation_states: Dict[str, ConversationState] = {}
        self.rag = rag_service or RAGService()
        # Serpは遅延初期化も可能だが、DIがあれば優先
        if serp_service is not None:
            self.serp = serp_service
        # 不明キーワード検索サービスを初期化
        self.unknown_keyword_service = UnknownKeywordSearchService()
        self._initialize_llm()
    
    def _initialize_llm(self):
        """LLMを初期化"""
        try:
            if settings.openai_api_key:
                self.llm = ChatOpenAI(
                    model="gpt-4",
                    temperature=0.3,
                    api_key=settings.openai_api_key
                )
                logger.info("LLMが正常に初期化されました")
            else:
                logger.warning("OpenAI API Keyが設定されていません")
        except Exception as e:
            logger.error(f"LLMの初期化に失敗: {e}")
    
    def create_session(self, customer_id: Optional[str] = None) -> str:
        """新しいチャットセッションを作成"""
        session_id = str(uuid.uuid4())
        customer_id = customer_id or f"customer_{uuid.uuid4().hex[:8]}"
        
        session = ChatSession(
            session_id=session_id,
            customer_id=customer_id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        conversation_state = ConversationState(
            session_id=session_id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        self.sessions[session_id] = session
        self.conversation_states[session_id] = conversation_state
        
        # システムメッセージを追加
        system_message = self._create_system_message()
        session.add_message(MessageRole.SYSTEM, system_message)
        
        logger.info(f"新しいセッションを作成: {session_id}")
        return session_id
    
    def process_message(self, request: ChatRequest) -> ChatResponse:
        """メッセージを処理してレスポンスを生成"""
        session_id = request.session_id or self.create_session(request.customer_id)
        session = self.sessions.get(session_id)
        
        if not session:
            session_id = self.create_session(request.customer_id)
            session = self.sessions[session_id]
        
        # ユーザーメッセージを追加
        session.add_message(MessageRole.USER, request.message)
        
        # 会話状態を更新
        state = self.conversation_states[session_id]
        state.updated_at = datetime.now()
        
        # レスポンスを生成
        response_message = self._generate_response(session, state, request.message)
        
        # アシスタントメッセージを追加
        session.add_message(MessageRole.ASSISTANT, response_message)
        
        # 会話履歴をNotionに保存
        self._save_conversation_to_notion(session, request.message, response_message)
        
        # 提案を生成
        suggestions = self._generate_suggestions(state)
        
        return ChatResponse(
            message=response_message,
            session_id=session_id,
            suggestions=suggestions
        )
    
    def _create_system_message(self) -> str:
        """システムメッセージを作成"""
        return """あなたは「おおつき」のスタッフです。口調は“親しい丁寧語”（フレンドリーで敬意を保つ）。
次の原則を厳守して応答してください。不要な堅苦しさは避け、会話体で簡潔に。

事実厳守の原則:
1. NotionとRAGで取得できる情報のみを事実として述べる（推測で断定しない）。
2. 根拠が曖昧/不在の内容は「未確認」「わかり次第ご案内」などの保留表現を使い、確認質問（予算・シーン・好み等）を添える。
3. メニュー名・価格・提供可否・営業時間などは、常にNotion/RAGの情報を優先する。
4. 強い断定が必要な場合は条件付き表現（〜かもしれません／〜でしたら〜が良さそうです）を用いる。
5. 根拠テキストをそのまま羅列せず、要点を短くまとめて伝える。

接客スタイル:
1. 最初は短い挨拶→要点→必要に応じて簡潔な確認質問。
2. 代替案（価格帯や好みに応じた候補）を1〜3件に絞って提案。
3. 不明点は率直に伝え、確認後の再案内や連絡方法を案内する。"""
    
    def _generate_response(self, session: ChatSession, state: ConversationState, user_message: str) -> str:
        """レスポンスを生成"""
        if not self.llm:
            return "申し訳ございません。現在システムの準備中です。"
        
        try:
            # 1) まずNotionを取得（優先）
            menu_items = self.notion_service.get_menu_items()
            store_info = self.notion_service.get_store_info()
            menu_context = self._create_menu_context(menu_items)
            store_context = self._create_store_context(store_info)

            # 1.5) RAGで関連文書を検索し、上位文書を根拠として追加
            retrieved_docs = []
            try:
                retrieved_docs = self.rag.retrieve(user_message, k=5)
            except Exception as re:
                logger.warning(f"RAG取得に失敗: {re}")
            rag_context = ""
            if retrieved_docs:
                rag_context = "参照ドキュメント:\n" + "\n".join([f"- {d.get('text','')[:200]}" for d in retrieved_docs])
            
            # 会話履歴を取得
            conversation_history = session.get_conversation_history()
            
            # プロンプトを作成
            prompt = ChatPromptTemplate.from_messages([
                ("system", f"{self._create_system_message()}\n\n{menu_context}\n\n{store_context}\n\n{rag_context}"),
                MessagesPlaceholder(variable_name="history"),
                ("human", "{input}")
            ])
            
            # 2) Notion情報があればそれを前提に回答生成
            chain = prompt | self.llm
            
            # レスポンスを生成
            response = chain.invoke({
                "history": conversation_history[1:-1],  # システムメッセージを除く
                "input": user_message
            })
            
            # 会話状態を更新
            self._update_conversation_state(state, user_message, response.content)
            
            if (menu_items and len(menu_items) > 0) or store_info:
                return response.content
            
            # 3) Notionが空だった場合は軽いフォールバックで回答
            fallback_prompt = ChatPromptTemplate.from_messages([
                ("system", "あなたは飲食店スタッフです。店舗情報やメニューが空でも、状況確認と次の案内（予算・シーン・好みの確認）を行ってください。"),
                ("human", "{input}")
            ])
            fallback_chain = fallback_prompt | self.llm
            return fallback_chain.invoke({"input": user_message}).content
            
        except Exception as e:
            logger.error(f"レスポンス生成に失敗: {e}")
            # フォールバック: LLMが利用可能なら、フレンドリーな簡易応答を生成
            try:
                if self.llm:
                    fallback_prompt = ChatPromptTemplate.from_messages([
                        ("system", "あなたは飲食店スタッフです。口調は親しい丁寧語。\n店舗情報やメニューが取得できない場合でも、状況確認と次の案内（予算・シーン・好みの確認）を行ってください。"),
                        ("human", "{input}")
                    ])
                    chain = fallback_prompt | self.llm
                    response = chain.invoke({"input": user_message})
                    return response.content
            except Exception as ee:
                logger.error(f"フォールバックLLMでも失敗: {ee}")
            # 最終フォールバック: 定型文
            polite_intro = "いらっしゃいませ！現在、一部の情報取得に時間がかかっています。"
            helpful_hint = "よろしければ、ご希望のメニューやご予算、シーン（ランチ/ディナー/テイクアウト）を教えてください。最適なご提案をいたします。"
            return f"{polite_intro}\n{helpful_hint}"
    
    def _create_menu_context(self, menu_items: List[MenuItem]) -> str:
        """メニュー情報のコンテキストを作成"""
        if not menu_items:
            return "メニュー情報: 現在メニュー情報を取得できません。"
        
        context = "メニュー情報:\n"
        for item in menu_items:
            context += f"- {item.name} ({item.category.value}): ¥{item.price:,}\n"
            context += f"  {item.description}\n"
            if item.allergy_info:
                context += f"  アレルギー: {', '.join(item.allergy_info)}\n"
            if item.seasonal:
                context += "  季節限定\n"
            if item.vegetarian:
                context += "  ベジタリアン対応\n"
            context += "\n"
        
        return context
    
    def _create_store_context(self, store_info) -> str:
        """店舗情報のコンテキストを作成"""
        if not store_info:
            return "店舗情報: 現在店舗情報を取得できません。"

        try:
            if isinstance(store_info, dict):
                business_hours = store_info.get("business_hours")
                holidays = store_info.get("holidays")
                access = store_info.get("access")
                features = store_info.get("features")
                reservation_method = store_info.get("reservation_method")
                parking = store_info.get("parking")
            else:
                business_hours = getattr(store_info, "business_hours", None)
                holidays = getattr(store_info, "holidays", None)
                access = getattr(store_info, "access", None)
                features = getattr(store_info, "features", None)
                reservation_method = getattr(store_info, "reservation_method", None)
                parking = getattr(store_info, "parking", False)

            return f"""店舗情報:
- 営業時間: {business_hours}
- 定休日: {holidays}
- アクセス: {access}
- 特徴: {features}
- 予約方法: {reservation_method}
- 駐車場: {'あり' if parking else 'なし'}"""
        except Exception:
            return "店舗情報: 現在店舗情報を取得できません。"
    
    def _update_conversation_state(self, state: ConversationState, user_message: str, response: str):
        """会話状態を更新"""
        # メニューに関する質問かチェック
        menu_keywords = ["メニュー", "料理", "食べ物", "テイクアウト", "宴会", "ランチ", "ディナー"]
        if any(keyword in user_message for keyword in menu_keywords):
            state.conversation_flow = "menu_inquiry"
        
        # 予約に関する質問かチェック
        reservation_keywords = ["予約", "予約方法", "電話", "来店"]
        if any(keyword in user_message for keyword in reservation_keywords):
            state.conversation_flow = "reservation"
    
    def _generate_suggestions(self, state: ConversationState) -> List[str]:
        """提案を生成"""
        suggestions = []
        
        if state.conversation_flow == "greeting":
            suggestions = [
                "メニューについて教えてください",
                "営業時間を教えてください",
                "予約方法を教えてください"
            ]
        elif state.conversation_flow == "menu_inquiry":
            suggestions = [
                "テイクアウトメニューを見たい",
                "宴会メニューについて詳しく",
                "価格を教えてください"
            ]
        elif state.conversation_flow == "reservation":
            suggestions = [
                "予約の電話番号を教えてください",
                "駐車場はありますか？",
                "アクセス方法を教えてください"
            ]
        
        return suggestions

    def _format_context(self, docs: list[dict]) -> str:
        if not docs:
            return ""
        lines = []
        for d in docs[:6]:
            t = d.get("type")
            lines.append(f"[{t}] {d.get('text','')}")
        return "\n\n".join(lines)

    async def process_message_rag_serp(self, request: ChatRequest) -> ChatResponse:
        """RAGを最優先し、不足時にSerpAPIで補完して再検索→統合回答。"""
        session_id = request.session_id or self.create_session(request.customer_id)
        session = self.sessions.get(session_id)
        if not session:
            session_id = self.create_session(request.customer_id)
            session = self.sessions[session_id]
        session.add_message(MessageRole.USER, request.message)
        state = self.conversation_states[session_id]
        state.updated_at = datetime.now()

        user_text = request.message
        rag_hits = []
        try:
            rag_hits = self.rag.retrieve(user_text, k=6)
        except Exception as re:
            logger.warning(f"RAG取得に失敗: {re}")
        ctx = self._format_context(rag_hits)

        # 不明キーワードDB検索（RAG結果が空の場合）
        unknown_db_fallback_used = False
        matched_record_url = None
        similarity_score = None
        matched_question_title = None
        
        if self.unknown_keyword_service.should_search(rag_hits):
            try:
                unknown_result = self.unknown_keyword_service.search_similar_question(user_text)
                if unknown_result and unknown_result.get("standard_answer"):
                    # 標準回答が見つかった場合、それを返す
                    standard_answer = unknown_result["standard_answer"]
                    unknown_db_fallback_used = True
                    matched_record_url = unknown_result.get("page_url", "")
                    similarity_score = unknown_result.get("similarity_score", 0.0)
                    matched_question_title = unknown_result.get("question_title", "")
                    
                    # LangSmithとFastAPIへのログ出力
                    logger.info(
                        f"[UnknownKeywordFallback] 採用: "
                        f"score={similarity_score:.1f}, "
                        f"question='{matched_question_title[:50]}', "
                        f"url={matched_record_url}"
                    )
                    
                    # LangSmithへのログ（LangSmithが設定されている場合）
                    try:
                        from langsmith import traceable
                        import os
                        if os.getenv("LANGSMITH_API_KEY"):
                            # LangSmithのトレースに追加情報を記録
                            # 実際のトレースは上位の@traceableデコレータで行われる想定
                            pass
                    except Exception:
                        pass
                    
                    # 会話状態を更新
                    self._update_conversation_state(state, user_text, standard_answer)
                    session.add_message(MessageRole.ASSISTANT, standard_answer)
                    suggestions = self._generate_suggestions(state)
                    
                    return ChatResponse(
                        message=standard_answer,
                        session_id=session_id,
                        suggestions=suggestions
                    )
            except Exception as uk_err:
                logger.warning(f"不明キーワードDB検索エラー: {uk_err}")
                # エラーが発生しても処理を続行

        serp_refs = ""
        if len(rag_hits) < 2:
            try:
                from .serp_service import SerpService
                if not hasattr(self, "serp"):
                    self.serp = SerpService()
                serp_results = await self.serp.search(user_text, num=3)
                to_add = []
                for r in serp_results or []:
                    text = f"{r.get('title','')}\n{r.get('snippet','')}\n{r.get('link','')}"
                    to_add.append({"id": r.get("link"), "text": text, "type": "web"})
                if to_add:
                    self.rag.upsert_texts(to_add)
                    rag_hits = self.rag.retrieve(user_text, k=6)
                    ctx = self._format_context(rag_hits)
                serp_refs = "\n".join([f"{r.get('title','')} — {r.get('link','')}" for r in serp_results or []])

                # 追加: スクレイピングで本文も取り込み（不足時のみ）
                if len(rag_hits) < 2 and serp_results:
                    try:
                        from .scrape_service import ScrapeService
                        if not hasattr(self, "scraper"):
                            self.scraper = ScrapeService()
                        scrape_adds = []
                        for r in serp_results[:2]:
                            link = r.get("link")
                            if not link:
                                continue
                            page_text = await self.scraper.fetch_text(link, max_chars=6000)
                            if page_text:
                                scrape_adds.append({
                                    "id": link,
                                    "text": page_text,
                                    "type": "web-page"
                                })
                        if scrape_adds:
                            self.rag.upsert_texts(scrape_adds)
                            rag_hits = self.rag.retrieve(user_text, k=6)
                            ctx = self._format_context(rag_hits)
                    except Exception as se2:
                        logger.warning(f"スクレイピング補完に失敗: {se2}")
            except Exception as se:
                logger.warning(f"Serp補完に失敗: {se}")
                serp_refs = ""

        prompt = ChatPromptTemplate.from_messages([
            ("system", self._create_system_message()),
            ("system", f"店内コンテキスト:\n{ctx if ctx else '(なし)'}\n\n参考情報（外部）:\n{serp_refs if serp_refs else '(なし)'}"),
            ("human", "{input}")
        ])
        # OpenAIキーなしでも動くフォールバック
        if not self.llm:
            summary_lines = [
                "いらっしゃいませ！現在は簡易モードで回答しています。",
            ]
            if ctx:
                summary_lines.append("店内コンテキストからの要点:")
                # 上位3件のみ要約っぽく整形
                for part in (ctx.split("\n\n")[:3]):
                    trimmed = part.strip()
                    summary_lines.append(f"- {trimmed[:180]}" if trimmed else "")
            if serp_refs:
                summary_lines.append("外部参考:")
                for ref in serp_refs.split("\n")[:3]:
                    summary_lines.append(f"- {ref}")
            fallback_answer = "\n".join([l for l in summary_lines if l])
            self._update_conversation_state(state, user_text, fallback_answer)
            session.add_message(MessageRole.ASSISTANT, fallback_answer)
            suggestions = self._generate_suggestions(state)
            return ChatResponse(message=fallback_answer, session_id=session_id, suggestions=suggestions)

        chain = prompt | self.llm
        try:
            resp = await chain.ainvoke({"input": user_text})
            
            # 不明キーワードDB検索が使用されなかった場合のログ
            if not unknown_db_fallback_used:
                logger.debug(
                    f"[UnknownKeywordFallback] 未使用: "
                    f"rag_hits={len(rag_hits)}, "
                    f"query='{user_text[:50]}'"
                )
            
            self._update_conversation_state(state, user_text, resp.content)
            session.add_message(MessageRole.ASSISTANT, resp.content)
            suggestions = self._generate_suggestions(state)
            return ChatResponse(message=resp.content, session_id=session_id, suggestions=suggestions)
        except Exception as llm_err:
            logger.warning(f"LLM応答に失敗（フォールバック適用）: {llm_err}")
            summary_lines = [
                "いらっしゃいませ！現在は簡易モードで回答しています。",
            ]
            if ctx:
                summary_lines.append("店内コンテキストからの要点:")
                for part in (ctx.split("\n\n")[:3]):
                    trimmed = part.strip()
                    if trimmed:
                        summary_lines.append(f"- {trimmed[:180]}")
            if serp_refs:
                summary_lines.append("外部参考:")
                for ref in serp_refs.split("\n")[:3]:
                    if ref:
                        summary_lines.append(f"- {ref}")
            fallback_answer = "\n".join(summary_lines)
            self._update_conversation_state(state, user_text, fallback_answer)
            session.add_message(MessageRole.ASSISTANT, fallback_answer)
            suggestions = self._generate_suggestions(state)
            return ChatResponse(message=fallback_answer, session_id=session_id, suggestions=suggestions)
    
    def _save_conversation_to_notion(self, session: ChatSession, question: str, answer: str):
        """会話履歴をNotionに保存"""
        try:
            from ..models.notion_models import ConversationHistory
            
            conversation = ConversationHistory(
                customer_id=session.customer_id,
                question=question,
                answer=answer,
                timestamp=datetime.now()
            )
            
            self.notion_service.save_conversation_history(conversation)
            
        except Exception as e:
            logger.error(f"会話履歴の保存に失敗: {e}")
    
    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """セッションを取得"""
        return self.sessions.get(session_id)
    
    def delete_session(self, session_id: str) -> bool:
        """セッションを削除"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            if session_id in self.conversation_states:
                del self.conversation_states[session_id]
            return True
        return False
