"""
API Framework

FastAPIベースの汎用APIフレームワーク
"""

import logging
import asyncio
import time
from dataclasses import asdict
from typing import Optional, Dict, Any, Set, List
from datetime import datetime
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path

from .config_loader import ConfigLoader
from .ai_engine import AIEngine
from .chroma_client import ChromaClient
from .intent_classifier import IntentClassifier, IntentType
from .notion_client import NotionClient
from .notion_knowledge_service import NotionKnowledgeContextService
from .unknown_keyword_service import UnknownKeywordSearchService
from .conversation_router import (
    classify_conversation_route,
    infer_memory_updates,
    should_search_standard_answer,
)
from .menu_existence import (
    format_direct_menu_existence_answer,
    is_direct_menu_existence_question,
)
from .response_compactness import (
    detect_short_store_faq_key,
    format_accept_proposal_reply,
    format_cancel_request_reply,
    format_contextual_price_reply,
    format_initial_reservation_reply,
    format_night_visit_reply,
    format_other_recommendation_reply,
    format_party_size_without_context_reply,
    format_reservation_correction_reply,
    format_reservation_followup_reply,
    format_short_order_confirmation,
    format_short_store_faq_reply,
    format_snack_recommendation_reply,
    format_today_business_reply,
    format_what_available_reply,
    get_recent_item_name,
    is_accept_proposal_request,
    is_cancel_request,
    is_contextual_price_request,
    is_initial_reservation_request,
    is_night_visit_request,
    is_other_recommendation_request,
    is_party_size_without_context,
    is_previous_price_request,
    is_reservation_correction,
    is_reservation_followup_request,
    is_short_order_confirmation,
    is_snack_recommendation_request,
    is_today_business_request,
    is_what_available_request,
    normalize_customer_reply,
    should_append_line_contact_footer,
)
from .conversation_quality import ConversationQualityLog, ConversationQualityLogger
from .customer_memory import (
    EVENT_ORDER_CANCELLED,
    EVENT_ORDER_CONFIRMED,
    EVENT_RECOMMENDATION_SHOWN,
    CustomerMemoryContext,
    CustomerMemoryRepository,
    normalize_consent_status,
)
from .customer_memory_followups import build_customer_memory_followup_reply
from .security.admin_auth import require_admin_api_key
from .integrations.chatbot_ai_manager import (
    ChatbotAIManagerBridge,
    ExplicitSalesRecommendationConnector,
    SalesStrategyManagementService,
    SalesStrategyRepository,
    SalesStrategyValidationError,
)
from .integrations.chatbot_ai_manager.explicit_recommendation import (
    SKIP_SESSION_LIMIT_REACHED,
)

logger = logging.getLogger(__name__)

PHONE_CONTACT_NUMBER = "0545-52-2124"
PHONE_CONTACT_TEL_URL = "tel:0545522124"
LINE_CONTACT_URL = "https://j2vwf7ca.autosns.app/addfriend/s/rrgjaO8SXk/@241usmjy"
LINE_CONTACT_FOOTER = (
    "詳しくはLINEもしくは、お電話でお問い合わせください：<br>"
    "お電話<br>"
    f'&nbsp;&nbsp;<a href="{PHONE_CONTACT_TEL_URL}">{PHONE_CONTACT_NUMBER}</a><br>'
    "LINE(24時間受付中)<br>"
    "&nbsp;&nbsp;↓<br>"
    f'&nbsp;&nbsp;<a href="{LINE_CONTACT_URL}" target="_blank" rel="noopener noreferrer">'
    "こちらから友達追加"
    "</a><br><br>"
    "メニューは下記のボタンをタップしてご覧ください<br>"
    '<a href="https://fuji-ootsuki.com/" target="_blank" rel="noopener noreferrer" '
    'style="display:inline-block;margin-top:6px;padding:5px 14px;border-radius:20px;'
    'border:1px solid #94a3b8;background:#ffffff;color:#334155;font-size:12px;'
    'font-weight:600;text-decoration:none;">メニューを見る</a>'
)

LATEST_INFO_UNAVAILABLE_MESSAGE = (
    "現在のリアルタイム情報にはまだ接続されていないため、"
    "今日の天気・ニュース・試合結果などを正確には確認できません。"
    "確認できる情報源を見ながらなら、一緒に整理できます。"
)


def append_line_contact_footer(message: str) -> str:
    """ユーザー向け回答の末尾にLINE案内を重複なく付与する。"""
    if not message:
        return ""

    normalized = normalize_customer_reply(message.rstrip())
    if LINE_CONTACT_FOOTER in normalized:
        return normalized

    if not should_append_line_contact_footer(normalized):
        return normalized

    return f"{normalized}\n\n{LINE_CONTACT_FOOTER}"


# LangGraphは条件付きimport（使用時のみ）
try:
    from .graph_engine import GraphEngine, ConversationState
    _HAS_LANGGRAPH = True
    logger.info("[OK] LangGraph import成功")
except ImportError as e:
    _HAS_LANGGRAPH = False
    logger.warning(f"[WARN] LangGraphが利用できません: {e}")
    # ダミークラスを定義
    GraphEngine = None
    ConversationState = None

# SimpleGraphEngineをimport
try:
    from .simple_graph_engine import SimpleGraphEngine, State
    _HAS_SIMPLE_GRAPH = True
    logger.info("[OK] SimpleGraphEngine import成功")
except ImportError as e:
    _HAS_SIMPLE_GRAPH = False
    logger.warning(f"[WARN] SimpleGraphEngineが利用できません: {e}")
    SimpleGraphEngine = None
    State = None

# AgentExecutorのimport（条件付き）
try:
    from .agent_engine import AgentEngine, AgentEngineError
    _HAS_AGENT_EXECUTOR = True
    logger.info("[OK] AgentExecutor import成功")
except Exception as e:
    AgentEngine = None  # type: ignore
    AgentEngineError = None  # type: ignore
    _HAS_AGENT_EXECUTOR = False
    logger.warning(f"[WARN] AgentExecutorが利用できません: {e}")


class ChatRequest(BaseModel):
    """チャットリクエスト"""
    message: str
    session_id: Optional[str] = None
    customer_id: Optional[str] = None

class SessionCreateRequest(BaseModel):
    """セッション作成リクエスト"""
    customer_secret: Optional[str] = None
    customer_consent: Optional[bool] = False
    session_id: Optional[str] = None
    customer_id: Optional[str] = None


class CustomerMemoryIdentifyRequest(BaseModel):
    anonymous_customer_id: Optional[str] = None
    consent_accepted: Optional[bool] = False
    source: Optional[str] = None


class CustomerMemoryConsentRequest(BaseModel):
    anonymous_customer_id: str
    consent_status: str


class CustomerMemoryConsentResponse(BaseModel):
    anonymous_customer_id: str
    consent_status: str
    updated: bool


class CustomerMemoryProfileResponse(BaseModel):
    customer_profile_id: str
    anonymous_customer_id: str
    consent_status: str
    preference_tags: List[str] = []
    favorite_items: List[str] = []
    avoided_items: List[str] = []
    last_ordered_items: List[str] = []
    last_recommended_items: List[str] = []
    recommendation_history: List[str] = []
    declined_products: List[str] = []
    visit_count: int = 0
    last_visit_at: str = ""
    last_ordered_at: str = ""
    last_recommended_at: str = ""
    memory_updated_at: str = ""
    communication_notes: str = ""


class ChatResponse(BaseModel):
    """チャットレスポンス"""
    message: str
    session_id: str
    timestamp: str
    options: Optional[list] = []  # ハイブリッドUI用選択肢
    suggestions: Optional[list] = None  # Next.jsフロントエンド用（optionsのエイリアス）
    image_url: Optional[str] = None  # メニュー先頭1件の検証済み画像URL
    line_reply_messages: Optional[List[Dict[str, Any]]] = None  # LINE Messaging API 用


class PriorityProductPayload(BaseModel):
    product_id: str
    product_name: str
    priority: int
    reason: str = ""
    suggest_when: Optional[List[str]] = None
    trigger_item_ids: Optional[List[str]] = None
    excluded_intents: Optional[List[str]] = None
    max_suggestions: int = 1
    inventory_priority: Optional[str] = None
    gross_margin_rank: Optional[int] = None


class SalesStrategyPayload(BaseModel):
    strategy_id: Optional[str] = None
    name: str
    active: bool = True
    valid_from: str
    valid_until: str
    sales_goal: str = ""
    max_suggestions_per_session: int = 1
    priority_products: List[PriorityProductPayload]
    allowed_topics: Optional[List[str]] = None
    blocked_intents: Optional[List[str]] = None
    generated_by: str = "manual"


class SalesStrategyUpdatePayload(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    sales_goal: Optional[str] = None
    max_suggestions_per_session: Optional[int] = None
    priority_products: Optional[List[PriorityProductPayload]] = None
    allowed_topics: Optional[List[str]] = None
    blocked_intents: Optional[List[str]] = None
    generated_by: Optional[str] = None


class ConnectionManager:
    """WebSocket接続管理"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_metadata: Dict[str, dict] = {}
        self.session_states: Dict[str, State] = {}  # セッションごとのstateを保持
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """WebSocket接続"""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.session_metadata[session_id] = {
            "connected_at": datetime.now(),
            "last_activity": datetime.now()
        }
        logger.info(f"[WS] 接続: {session_id[:8]}...")
    
    def disconnect(self, session_id: str):
        """WebSocket切断"""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            del self.session_metadata[session_id]
            if session_id in self.session_states:
                del self.session_states[session_id]
            logger.info(f"[WS] 切断: {session_id[:8]}...")
    
    async def send_personal(self, session_id: str, message: dict):
        """特定セッションにメッセージ送信"""
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(message)
                self.session_metadata[session_id]["last_activity"] = datetime.now()
                return True
            except Exception as e:
                logger.error(f"[WS] 送信エラー ({session_id[:8]}...): {e}")
                self.disconnect(session_id)
        return False
    
    async def broadcast(self, message: dict, exclude: Set[str] = None):
        """全セッションにブロードキャスト"""
        exclude = exclude or set()
        for session_id in list(self.active_connections.keys()):
            if session_id not in exclude:
                await self.send_personal(session_id, message)
    
    def get_active_sessions(self) -> list:
        """アクティブなセッション一覧を取得"""
        return list(self.active_connections.keys())


def create_app(config: ConfigLoader) -> FastAPI:
    """
    FastAPIアプリケーションを作成
    
    Args:
        config: 設定ローダー
    
    Returns:
        FastAPIアプリケーション
    """
    # アプリケーション作成
    app = FastAPI(
        title=config.get("project_name", "ootsuki2"),
        description=config.get("frontend_title", "AI Chat Bot"),
        version="2.0.0"
    )
    
    # CORS設定
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # テンプレートエンジン
    templates = Jinja2Templates(directory="templates")
    
    # 静的ファイルのマウント
    static_dir = Path("static")
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory="static"), name="static")
        logger.info("[OK] 静的ファイルマウント: /static")
    else:
        # ディレクトリが存在しない場合は作成
        static_dir.mkdir(exist_ok=True)
        (static_dir / "images").mkdir(exist_ok=True)
        app.mount("/static", StaticFiles(directory="static"), name="static")
        logger.info("[OK] 静的ファイルディレクトリを作成してマウント: /static")
    
    # サービス初期化
    ai_engine = AIEngine(
        model=config.get_ai_model(),
        temperature=config.get("ai.temperature", 0.7)
    )
    
    chroma_client = ChromaClient(
        persist_dir=config.get_chroma_persist_dir(),
        collection_name=config.app_name
    )
    
    notion_client = NotionClient()
    intent_classifier = IntentClassifier()

    from .menu_service import MenuService
    from .menu_image_resolve import attach_line_messages_if_image, resolve_menu_image_for_chat

    _menu_db_id = config.get("notion.database_ids.menu_db")
    shared_menu_service = MenuService(notion_client, _menu_db_id)
    notion_knowledge_service = NotionKnowledgeContextService(
        notion_client=notion_client,
        config=config,
        menu_service=shared_menu_service,
    )
    quality_logger = ConversationQualityLogger(
        path=config.get("conversation_quality.log_path", "outputs/conversation_quality_logs.jsonl"),
        enabled=config.get("features.enable_conversation_quality_logs", True),
    )
    sales_strategy_service = SalesStrategyManagementService(
        SalesStrategyRepository(
            config.get(
                "ai_manager.sales_strategy_path",
                "outputs/ai_manager_sales_strategies.json",
            )
        )
    )
    sales_strategy_bridge = ChatbotAIManagerBridge()
    explicit_sales_recommendation = ExplicitSalesRecommendationConnector(
        sales_strategy_service,
        sales_strategy_bridge,
    )
    customer_memory_repository = CustomerMemoryRepository(
        config.get(
            "customer_memory.profile_path",
            "outputs/customer_memory_profiles.json",
        )
    )
    
    # 不明キーワード検索サービス初期化
    unknown_keywords_db_id = config.get("notion.database_ids.unknown_keywords_db")
    unknown_keyword_service = None
    if unknown_keywords_db_id:
        unknown_keyword_service = UnknownKeywordSearchService(
            notion_client=notion_client,
            database_id=unknown_keywords_db_id
        )
        logger.info(f"[OK] 不明キーワード検索サービスを初期化しました: {unknown_keywords_db_id[:20]}...")
    else:
        logger.warning("[WARN] 不明キーワード記録DB IDが設定されていません")
    
    # LangGraph初期化（有効な場合かつimport成功時）
    graph_engine = None
    logger.info(f"[DEBUG] LangGraph初期化チェック: enable_langgraph={config.get('features.enable_langgraph', False)}, _HAS_LANGGRAPH={_HAS_LANGGRAPH}")
    
    if config.get("features.enable_langgraph", False) and _HAS_LANGGRAPH:
        try:
            logger.info("[DEBUG] LangGraph初期化開始...")
            graph_engine = GraphEngine(
                llm=ai_engine.llm,
                system_prompt=ai_engine.system_prompt,
                notion_client=notion_client,
                config=config
            )
            flow_type = config.get("langgraph.flow_type", "restaurant")
            graph_engine.build_graph(flow_type)
            logger.info(f"[OK] LangGraph有効化: {flow_type}フロー")
        except Exception as e:
            logger.error(f"[ERROR] LangGraph初期化エラー: {e}")
            import traceback
            logger.error(f"[ERROR] トレースバック: {traceback.format_exc()}")
    elif config.get("features.enable_langgraph", False) and not _HAS_LANGGRAPH:
        logger.warning("[WARN] LangGraphが無効化されています（importエラー）")
    else:
        logger.info(f"[DEBUG] LangGraph無効化: enable_langgraph={config.get('features.enable_langgraph', False)}, _HAS_LANGGRAPH={_HAS_LANGGRAPH}")
    
    # AgentExecutor初期化
    agent_engine = None
    if config.get("features.enable_agent_executor", False):
        if _HAS_AGENT_EXECUTOR:
            try:
                agent_engine = AgentEngine(
                    ai_engine=ai_engine,
                    notion_client=notion_client,
                    chroma_client=chroma_client,
                    config=config,
                )
                logger.info("[OK] AgentExecutorを有効化しました")
            except AgentEngineError as e:
                logger.error(f"[ERROR] AgentExecutor初期化エラー: {e}")
            except Exception as e:
                logger.error(f"[ERROR] AgentExecutor初期化で想定外のエラー: {e}")
        else:
            logger.warning("[WARN] AgentExecutor機能が有効化されていますがモジュールが利用できません")

    # SimpleGraphEngine初期化（WebSocket用）
    simple_graph = None
    if config.get("features.enable_simple_graph", True) and _HAS_SIMPLE_GRAPH:
        try:
            logger.info("[DEBUG] SimpleGraphEngine初期化開始...")
            
            menu_service = shared_menu_service
            logger.info(f"[DEBUG] MenuService初期化完了 (DB ID: {_menu_db_id})")
            
            # ConversationNodeSystemを初期化
            conversation_system = None
            try:
                from core.conversation_node_system import ConversationNodeSystem
                conversation_system = ConversationNodeSystem([], notion_client, config)
                logger.info("[DEBUG] ConversationNodeSystem初期化完了")
            except Exception as e:
                logger.warning(f"[WARNING] ConversationNodeSystem初期化エラー（フォールバック）: {e}")
                conversation_system = None
            
            simple_graph = SimpleGraphEngine(
                llm=ai_engine.llm,
                notion_client=notion_client,
                config=config,
                menu_service=menu_service,
                conversation_system=conversation_system
            )
            simple_graph.build_graph()
            logger.info("[OK] SimpleGraphEngine初期化完了（MenuService・ConversationNodeSystem注入済み）")
        except Exception as e:
            logger.error(f"[ERROR] SimpleGraphEngine初期化エラー: {e}")
            import traceback
            logger.error(f"[ERROR] トレースバック: {traceback.format_exc()}")
    
    # WebSocket接続管理
    ws_manager = ConnectionManager()

    def _elapsed_ms(started_at: float) -> int:
        return int((time.perf_counter() - started_at) * 1000)

    def _record_quality_log(
        *,
        session_id: str,
        user_id: Optional[str],
        user_message: str,
        ai_response: str,
        recent_history: Optional[List[Dict[str, Any]]] = None,
        session_memory: Optional[Dict[str, Any]] = None,
        detected_intent: Optional[str] = None,
        route: Optional[str] = None,
        route_reason: Optional[str] = None,
        node: Optional[str] = None,
        referenced_sources: Optional[Dict[str, Any]] = None,
        latency_ms: int = 0,
        error: Optional[str] = None,
        channel: str = "web",
    ) -> None:
        try:
            memory = session_memory or ai_engine.get_session_memory(session_id)
            quality_logger.save(
                ConversationQualityLog.from_turn(
                    session_id=session_id,
                    user_id=user_id,
                    user_message=user_message,
                    ai_response=ai_response,
                    recent_history=recent_history,
                    active_topic=memory.get("active_topic"),
                    pending_flow=memory.get("pending_flow"),
                    detected_intent=detected_intent,
                    route=route,
                    route_reason=route_reason,
                    node=node,
                    referenced_sources=referenced_sources,
                    latency_ms=latency_ms,
                    error=error,
                    channel=channel,
                )
            )
        except Exception as exc:
            logger.warning("[ConversationQuality] logging skipped: %s", exc)
    
    # プロアクティブスケジューラー
    scheduler = None
    if simple_graph and config.get("features.enable_scheduler", True):
        try:
            from .scheduler import ProactiveScheduler
            scheduler = ProactiveScheduler(simple_graph, ws_manager)
            logger.info("[OK] スケジューラー初期化完了")
        except Exception as e:
            logger.error(f"[ERROR] スケジューラー初期化エラー: {e}")
    
    # 起動時イベント
    @app.on_event("startup")
    async def startup_event():
        """アプリケーション起動時の処理"""
        logger.info(f">> {config.get('project_name')}が起動しました")
        config.print_summary()
        
        # RAGの初期構築
        try:
            documents = await load_knowledge_base(config, notion_client)
            if documents:
                chroma_client.build(documents)
                logger.info(f"[OK] RAG初期化完了: {len(documents)}件")
        except Exception as e:
            logger.error(f"[ERROR] RAG初期化エラー: {e}")
        
        # スケジューラー開始
        if scheduler:
            scheduler.start()
    
    # 終了時イベント
    @app.on_event("shutdown")
    async def shutdown_event():
        """アプリケーション終了時の処理"""
        # スケジューラー停止
        if scheduler:
            scheduler.shutdown()
        
        logger.info(f"👋 {config.get('project_name')}を終了します")
    
    # ルートエンドポイント
    @app.get("/")
    async def root(request: Request):
        """ルートエンドポイント - HTMLを表示"""
        return templates.TemplateResponse(
            "base_chat.html",
            {
                "request": request,
                "title": config.get("frontend_title", "AI Chat"),
                "app_name": config.app_name
            }
        )
    
    # ヘルスチェック
    @app.get("/health")
    async def health_check():
        """ヘルスチェックエンドポイント"""
        return {
            "status": "healthy",
            "app_name": config.app_name,
            "notion_connected": bool(notion_client.client),
            "ai_ready": bool(ai_engine.llm),
            "rag_built": chroma_client._built
        }
    
    def _strategy_payload(model: BaseModel) -> Dict[str, Any]:
        data = model.dict(exclude_none=True)
        if "priority_products" in data:
            for product in data["priority_products"]:
                product["name"] = product.pop("product_name")
                product["priority_score"] = product.pop("priority")
        return data

    def _strategy_response(strategy) -> Dict[str, Any]:
        payload = asdict(strategy)
        for product in payload.get("priority_products", []):
            product["product_name"] = product.pop("name")
            product["priority"] = product.pop("priority_score")
        return payload

    def _customer_memory_response(profile) -> Dict[str, Any]:
        return customer_memory_repository.to_public_dict(profile)

    def _safe_link_customer_session(customer_id: Optional[str], session_id: str) -> None:
        try:
            customer_memory_repository.link_session(
                session_id=session_id,
                anonymous_customer_id=str(customer_id or ""),
            )
        except Exception as exc:
            logger.warning(
                "[CustomerMemory] link_session_failed session=%s error=%s",
                session_id[:8],
                exc.__class__.__name__,
            )

    def _safe_record_customer_event(
        customer_id: Optional[str],
        session_id: str,
        event_type: str,
        *,
        product_id: str = "",
        product_name: str = "",
        quantity: int = 1,
        strategy_id: str = "",
    ) -> None:
        try:
            customer_memory_repository.record_event(
                event_type=event_type,
                anonymous_customer_id=str(customer_id or ""),
                session_id=session_id,
                product_id=product_id,
                product_name=product_name,
                quantity=quantity,
                strategy_id=strategy_id,
            )
        except Exception as exc:
            logger.warning(
                "[CustomerMemory] record_event_failed session=%s event_type=%s error=%s",
                session_id[:8],
                event_type,
                exc.__class__.__name__,
            )

    @app.post(
        "/customer-memory/identify",
        response_model=CustomerMemoryProfileResponse,
    )
    async def identify_customer_memory(payload: CustomerMemoryIdentifyRequest):
        profile = customer_memory_repository.identify(
            payload.anonymous_customer_id,
            consent_accepted=bool(payload.consent_accepted),
        )
        return _customer_memory_response(profile)

    @app.post(
        "/customer-memory/consent",
        response_model=CustomerMemoryConsentResponse,
    )
    async def update_customer_memory_consent(payload: CustomerMemoryConsentRequest):
        consent_status = normalize_consent_status(payload.consent_status)
        if consent_status != payload.consent_status:
            raise HTTPException(status_code=400, detail="invalid consent_status")
        profile = customer_memory_repository.update_consent(
            anonymous_customer_id=payload.anonymous_customer_id,
            consent_status=consent_status,
        )
        if not profile:
            raise HTTPException(status_code=400, detail="invalid anonymous_customer_id")
        return {
            "anonymous_customer_id": profile.anonymous_customer_id,
            "consent_status": profile.consent_status,
            "updated": True,
        }

    @app.get(
        "/admin/customer-memory/{anonymous_customer_id}",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def get_customer_memory_admin(anonymous_customer_id: str):
        summary = customer_memory_repository.get_admin_summary(anonymous_customer_id)
        if not summary:
            raise HTTPException(status_code=404, detail="customer memory not found")
        return summary

    @app.post(
        "/admin/ai-manager/sales-strategies",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def create_sales_strategy(payload: SalesStrategyPayload):
        try:
            strategy = sales_strategy_service.create(_strategy_payload(payload))
            return _strategy_response(strategy)
        except SalesStrategyValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get(
        "/admin/ai-manager/sales-strategies",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def list_sales_strategies(include_inactive: bool = True):
        return {
            "strategies": [
                _strategy_response(strategy)
                for strategy in sales_strategy_service.list(include_inactive=include_inactive)
            ]
        }

    @app.get(
        "/admin/ai-manager/sales-strategies/current",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def get_current_sales_strategy():
        strategy = sales_strategy_service.get_current()
        if not strategy:
            return {"strategy": None}
        return {"strategy": _strategy_response(strategy)}

    @app.get(
        "/admin/ai-manager/sales-strategies/{strategy_id}",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def get_sales_strategy(strategy_id: str):
        strategy = sales_strategy_service.get(strategy_id)
        if not strategy:
            raise HTTPException(status_code=404, detail="sales strategy not found")
        return _strategy_response(strategy)

    @app.put(
        "/admin/ai-manager/sales-strategies/{strategy_id}",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def update_sales_strategy(strategy_id: str, payload: SalesStrategyUpdatePayload):
        try:
            strategy = sales_strategy_service.update(strategy_id, _strategy_payload(payload))
            return _strategy_response(strategy)
        except KeyError:
            raise HTTPException(status_code=404, detail="sales strategy not found")
        except SalesStrategyValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post(
        "/admin/ai-manager/sales-strategies/{strategy_id}/activate",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def activate_sales_strategy(strategy_id: str):
        try:
            strategy = sales_strategy_service.set_active(strategy_id, True)
            return _strategy_response(strategy)
        except KeyError:
            raise HTTPException(status_code=404, detail="sales strategy not found")
        except SalesStrategyValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post(
        "/admin/ai-manager/sales-strategies/{strategy_id}/deactivate",
        dependencies=[Depends(require_admin_api_key)],
    )
    async def deactivate_sales_strategy(strategy_id: str):
        try:
            strategy = sales_strategy_service.set_active(strategy_id, False)
            return _strategy_response(strategy)
        except KeyError:
            raise HTTPException(status_code=404, detail="sales strategy not found")
        except SalesStrategyValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # Chat endpoint
    @app.post("/chat", response_model=ChatResponse)
    async def chat(request: ChatRequest):
        """チャット処理"""
        started_at = time.perf_counter()
        session_id = request.session_id or ""
        user_message = request.message
        recent_turns: List[Dict[str, Any]] = []
        session_memory: Dict[str, Any] = {}
        conversation_route = None
        detected_intent = ""
        try:
            # セッション作成または取得
            if not session_id:
                session_id = ai_engine.create_session(request.customer_id)
            _safe_link_customer_session(request.customer_id, session_id)
            
            intent_result = intent_classifier.classify(user_message)
            ai_engine.save_memory(
                session_id,
                {
                    "intent": intent_result.intent.value,
                    "topic": intent_result.topic,
                    "user_type": intent_result.user_type,
                    "last_intent_reason": intent_result.reason,
                },
            )
            logger.info(
                "[Intent] session=%s intent=%s confidence=%.2f reason=%s topic=%s",
                session_id[:8],
                intent_result.intent.value,
                intent_result.confidence,
                intent_result.reason,
                intent_result.topic,
            )

            response_mode = (
                "suggestion"
                if intent_result.intent in {IntentType.PROPOSAL, IntentType.TROUBLE, IntentType.UNKNOWN}
                else "normal"
            )
            tone = ai_engine.adjust_tone(intent_result.intent.value)
            session_memory = ai_engine.get_session_memory(session_id)
            recent_turns = ai_engine.get_llm_conversation_turns(session_id, max_pairs=4)
            recent_messages = [
                turn.get("content", "")
                for turn in recent_turns
                if turn.get("content")
            ]
            conversation_route = classify_conversation_route(
                user_message,
                recent_messages=recent_messages,
                active_topic=session_memory.get("active_topic"),
                pending_flow=session_memory.get("pending_flow"),
            )
            allow_standard_answer_search = should_search_standard_answer(
                user_message,
                recent_messages=recent_messages,
                active_topic=session_memory.get("active_topic"),
                pending_flow=session_memory.get("pending_flow"),
            )
            logger.info(
                "[Route] session=%s conversation_route=%s reason=%s standard_answer=%s",
                session_id[:8],
                conversation_route.kind,
                conversation_route.reason,
                allow_standard_answer_search,
            )
            memory_updates = infer_memory_updates(
                user_message,
                conversation_route,
                current_memory=session_memory,
            )
            try:
                customer_memory_context = customer_memory_repository.build_context(
                    str(request.customer_id or "")
                )
            except Exception as exc:
                logger.warning(
                    "[CustomerMemory] build_context_failed session=%s error=%s",
                    session_id[:8],
                    exc.__class__.__name__,
                )
                customer_memory_context = CustomerMemoryContext.unavailable(
                    str(request.customer_id or "")
                )
            if customer_memory_context is not None:
                memory_followup_reply = build_customer_memory_followup_reply(
                    user_message,
                    customer_memory_context,
                    session_memory=session_memory,
                )
            else:
                memory_followup_reply = None
            if memory_followup_reply:
                response_message = memory_followup_reply.message
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "customer_memory",
                        "detected_intent": memory_followup_reply.intent,
                        "last_assistant_action": "customer_memory_followup",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=memory_followup_reply.intent,
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="customer_memory_followup",
                    referenced_sources={
                        "memory_used": memory_followup_reply.memory_used,
                    },
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )
            defer_memory_updates_for_contextual_followup = (
                is_previous_price_request(user_message, session_memory)
                or is_contextual_price_request(user_message, session_memory)
                or is_accept_proposal_request(user_message, session_memory)
                or is_other_recommendation_request(user_message, session_memory)
                or is_what_available_request(user_message, session_memory)
            )
            initial_reservation_requested = is_initial_reservation_request(
                user_message, session_memory
            )
            short_store_faq_key = detect_short_store_faq_key(user_message)
            if (
                short_store_faq_key
                and session_memory.get("pending_flow") != "reservation"
                and session_memory.get("active_topic") != "reservation"
            ):
                response_message = format_short_store_faq_reply(short_store_faq_key)
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "store_info",
                        "detected_intent": "facility_inquiry",
                        "last_assistant_action": "short_store_faq",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="facility_inquiry",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node=f"short_store_faq:{short_store_faq_key}",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if memory_updates and not defer_memory_updates_for_contextual_followup:
                ai_engine.save_memory(session_id, memory_updates)
                session_memory = {**session_memory, **memory_updates}

            if initial_reservation_requested:
                response_message = format_initial_reservation_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "reservation",
                        "pending_flow": "reservation",
                        "detected_intent": "reservation",
                        "last_assistant_action": "initial_reservation_request",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="reservation",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="initial_reservation_request",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_reservation_correction(user_message, session_memory):
                response_message = format_reservation_correction_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "natural",
                        "pending_flow": "",
                        "detected_intent": "clarification_required",
                        "last_assistant_action": "reservation_correction",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="clarification_required",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="reservation_correction",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_cancel_request(user_message, session_memory):
                cancelled_item_name = get_recent_item_name(session_memory)
                response_message = format_cancel_request_reply(session_memory)
                if cancelled_item_name:
                    _safe_record_customer_event(
                        request.customer_id,
                        session_id,
                        EVENT_ORDER_CANCELLED,
                        product_name=cancelled_item_name,
                    )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "natural",
                        "pending_flow": "",
                        "detected_intent": "cancel",
                        "order_intent_level": "none",
                        "current_entity": "",
                        "recently_confirmed_item": "",
                        "last_assistant_action": "cancelled_pending_flow",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="cancel",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="cancel_request",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_today_business_request(user_message):
                response_message = format_today_business_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "store_info",
                        "detected_intent": "business_hours",
                        "last_assistant_action": "answered_today_business",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="business_hours",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="today_business",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_previous_price_request(
                user_message, session_memory
            ) or is_contextual_price_request(user_message, session_memory):
                recent_item_name = get_recent_item_name(session_memory)
                menu_items = shared_menu_service.fetch_menu_items(
                    recent_item_name,
                    limit=5,
                )
                exact_menu_items = [
                    item
                    for item in menu_items
                    if getattr(item, "name", "") == recent_item_name
                ]
                if exact_menu_items:
                    menu_items = exact_menu_items
                response_message = format_contextual_price_reply(
                    recent_item_name,
                    menu_items,
                )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "menu",
                        "current_entity": recent_item_name,
                        "detected_intent": "product_price",
                        "last_assistant_action": "answered_product_price",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="product_price",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="contextual_price",
                    referenced_sources={
                        "menu_hits": len(menu_items),
                        "menu_names": [
                            getattr(item, "name", "") for item in menu_items[:1]
                        ],
                    },
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_accept_proposal_request(user_message, session_memory):
                response_message = format_accept_proposal_reply(session_memory)
                recent_item_name = get_recent_item_name(session_memory)
                _safe_record_customer_event(
                    request.customer_id,
                    session_id,
                    EVENT_ORDER_CONFIRMED,
                    product_name=recent_item_name,
                )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "order",
                        "pending_flow": "order",
                        "detected_intent": "product_order",
                        "order_intent_level": "confirming",
                        "recently_confirmed_item": recent_item_name,
                        "last_assistant_action": "confirmed_order_item",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="product_order",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="accept_proposal",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_other_recommendation_request(user_message, session_memory):
                response_message = format_other_recommendation_reply()
                _safe_record_customer_event(
                    request.customer_id,
                    session_id,
                    EVENT_RECOMMENDATION_SHOWN,
                    product_name="唐揚げ",
                )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "recommendation",
                        "detected_intent": "product_recommendation",
                        "last_assistant_action": "other_recommendation",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="product_recommendation",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="other_recommendation",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_what_available_request(user_message, session_memory):
                response_message = format_what_available_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "menu",
                        "detected_intent": "menu_search",
                        "last_assistant_action": "what_available",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="menu_search",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="what_available",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_party_size_without_context(user_message, session_memory):
                response_message = format_party_size_without_context_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "reservation",
                        "pending_flow": "reservation",
                        "detected_intent": "reservation",
                        "last_assistant_action": "reservation_party_size_clarification",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="reservation",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="party_size_without_context",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_night_visit_request(user_message, session_memory):
                response_message = format_night_visit_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "reservation",
                        "pending_flow": "reservation",
                        "detected_intent": "reservation",
                        "last_assistant_action": "night_visit_clarification",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="reservation",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="night_visit",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_reservation_followup_request(user_message, session_memory):
                response_message = format_reservation_followup_reply(session_memory)
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "reservation",
                        "pending_flow": "reservation",
                        "detected_intent": "reservation",
                        "last_assistant_action": "reservation_followup",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="reservation",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="reservation_followup",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_short_order_confirmation(user_message, session_memory):
                response_message = format_short_order_confirmation(session_memory)
                _safe_record_customer_event(
                    request.customer_id,
                    session_id,
                    EVENT_ORDER_CONFIRMED,
                    product_name=get_recent_item_name(session_memory),
                )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "order",
                        "pending_flow": "order",
                        "detected_intent": "product_order",
                        "order_intent_level": "confirming",
                        "recently_confirmed_item": get_recent_item_name(session_memory),
                        "last_assistant_action": "confirmed_order_item",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="product_order",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="short_order_confirmation",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_snack_recommendation_request(user_message):
                response_message = format_snack_recommendation_reply()
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "recommendation",
                        "detected_intent": "product_recommendation",
                        "last_assistant_action": "snack_recommendation",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="product_recommendation",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="snack_recommendation",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            short_store_faq_key = detect_short_store_faq_key(user_message)
            if short_store_faq_key:
                response_message = format_short_store_faq_reply(short_store_faq_key)
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "store_info",
                        "detected_intent": "facility_inquiry",
                        "last_assistant_action": "short_store_faq",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", response_message)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent="facility_inquiry",
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node=f"short_store_faq:{short_store_faq_key}",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_direct_menu_existence_question(user_message):
                menu_items = shared_menu_service.search_menu_items_for_existence(
                    user_message,
                    limit=5,
                )
                response_message = format_direct_menu_existence_answer(menu_items)
                current_entity = (
                    getattr(menu_items[0], "name", "") if menu_items else user_message
                )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "menu",
                        "current_entity": current_entity,
                        "detected_intent": "product_existence",
                        "user_goal": "availability_check",
                        "order_intent_level": "none",
                        "answered_facts": {
                            "product_existence": current_entity,
                            "exists": bool(menu_items),
                        },
                        "previous_question": user_message,
                        "last_assistant_action": "answered_product_existence",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", user_message)
                    session.add_message("assistant", response_message)
                logger.info(
                    "[Decision] session=%s source=direct_menu_existence hits=%d",
                    session_id[:8],
                    len(menu_items),
                )
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=user_message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=intent_result.intent.value,
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="direct_menu_existence",
                    referenced_sources={
                        "menu_hits": len(menu_items),
                        "menu_names": [
                            getattr(item, "name", "") for item in menu_items[:5]
                        ],
                    },
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )

                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if conversation_route.kind == "latest":
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", request.message)
                    session.add_message("assistant", LATEST_INFO_UNAVAILABLE_MESSAGE)
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=LATEST_INFO_UNAVAILABLE_MESSAGE,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=intent_result.intent.value,
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="latest_unavailable",
                    referenced_sources={"latest_connected": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=LATEST_INFO_UNAVAILABLE_MESSAGE,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if conversation_route.kind == "natural":
                route_context = (
                    "この発話は店舗データを使わない自然会話として扱ってください。"
                    "メニュー、価格、営業時間、予約などの店舗事実は推測しないでください。"
                )
                response_message = ai_engine.generate_response(
                    session_id=session_id,
                    user_message=request.message,
                    context=route_context,
                    response_mode="normal",
                    tone="casual",
                    intent_result=intent_result,
                )
                logger.info(
                    "[Decision] session=%s source=natural_chat route=%s",
                    session_id[:8],
                    conversation_route.kind,
                )
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=request.message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=intent_result.intent.value,
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="natural_chat",
                    referenced_sources={"store_tools_used": False},
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )

                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if is_direct_menu_existence_question(user_message):
                menu_items = shared_menu_service.search_menu_items_for_existence(
                    user_message,
                    limit=5,
                )
                response_message = format_direct_menu_existence_answer(menu_items)
                current_entity = (
                    getattr(menu_items[0], "name", "") if menu_items else user_message
                )
                ai_engine.save_memory(
                    session_id,
                    {
                        "active_topic": "menu",
                        "current_entity": current_entity,
                        "detected_intent": "product_existence",
                        "user_goal": "availability_check",
                        "order_intent_level": "none",
                        "answered_facts": {
                            "product_existence": current_entity,
                            "exists": bool(menu_items),
                        },
                        "previous_question": user_message,
                        "last_assistant_action": "answered_product_existence",
                    },
                )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", user_message)
                    session.add_message("assistant", response_message)
                logger.info(
                    "[Decision] session=%s source=direct_menu_existence hits=%d",
                    session_id[:8],
                    len(menu_items),
                )
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=user_message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=intent_result.intent.value,
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="direct_menu_existence",
                    referenced_sources={
                        "menu_hits": len(menu_items),
                        "menu_names": [
                            getattr(item, "name", "") for item in menu_items[:5]
                        ],
                    },
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )

                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )
            
            # 【優先】不明キーワードDB検索を最初に実行（RAG結果に関係なく）
            sales_recommendation = explicit_sales_recommendation.try_recommend(
                session_id=session_id,
                user_message=user_message,
                intent_value=intent_result.intent.value,
                route_kind=conversation_route.kind,
                session_memory=session_memory,
                customer_memory_context=customer_memory_context,
            )
            if sales_recommendation.has_message:
                response_message = sales_recommendation.message
                ai_engine.save_memory(session_id, sales_recommendation.memory_updates or {})
                if sales_recommendation.skip_reason != SKIP_SESSION_LIMIT_REACHED:
                    _safe_record_customer_event(
                        request.customer_id,
                        session_id,
                        EVENT_RECOMMENDATION_SHOWN,
                        product_id=sales_recommendation.selected_product_id,
                        product_name=str(
                            (sales_recommendation.memory_updates or {}).get("last_recommended_item")
                            or ""
                        ),
                        strategy_id=sales_recommendation.strategy_id,
                    )
                session_memory = ai_engine.get_session_memory(session_id)
                session = ai_engine.get_session(session_id)
                if session:
                    session.add_message("user", user_message)
                    session.add_message("assistant", response_message)
                logger.info(
                    "[SalesStrategy] session=%s strategy_id=%s product_id=%s",
                    session_id[:8],
                    sales_recommendation.strategy_id,
                    sales_recommendation.selected_product_id,
                )
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=user_message,
                    ai_response=response_message,
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=intent_result.intent.value,
                    route=conversation_route.kind,
                    route_reason=conversation_route.reason,
                    node="sales_strategy_recommendation",
                    referenced_sources={
                        "strategy_id": sales_recommendation.strategy_id,
                        "selected_product_id": sales_recommendation.selected_product_id,
                    },
                    latency_ms=_elapsed_ms(started_at),
                    channel="web",
                )
                return ChatResponse(
                    message=response_message,
                    session_id=session_id,
                    timestamp=datetime.now().isoformat(),
                    options=[],
                    suggestions=None,
                    image_url=None,
                    line_reply_messages=None,
                )

            if sales_recommendation.skip_reason:
                logger.info(
                    "[SalesStrategy] session=%s skipped=%s",
                    session_id[:8],
                    sales_recommendation.skip_reason,
                )

            if unknown_keyword_service and allow_standard_answer_search:
                try:
                    unknown_result = unknown_keyword_service.search_similar_question(user_message)
                    if unknown_result and unknown_result.get("standard_answer"):
                        # 標準回答が見つかった場合、それを優先的に返す
                        menu_image_url, menu_image_log = resolve_menu_image_for_chat(
                            shared_menu_service, user_message
                        )
                        logger.info(menu_image_log)
                        standard_answer = append_line_contact_footer(
                            unknown_result["standard_answer"]
                        )
                        line_reply_messages = attach_line_messages_if_image(
                            standard_answer, menu_image_url
                        )
                        similarity_score = unknown_result.get("similarity_score", 0.0)
                        matched_question_title = unknown_result.get("question_title", "")
                        
                        logger.info(
                            f"[UnknownKeywordPriority] 標準回答を優先採用: "
                            f"score={similarity_score:.1f}, "
                            f"question='{matched_question_title[:50]}'"
                        )
                        logger.info(
                            "[Decision] session=%s source=unknown_keyword intent=%s mode=%s",
                            session_id[:8],
                            intent_result.intent.value,
                            response_mode,
                        )
                        
                        # セッションにメッセージを追加
                        session = ai_engine.get_session(session_id)
                        if session:
                            session.add_message("user", user_message)
                            session.add_message("assistant", standard_answer)
                        _record_quality_log(
                            session_id=session_id,
                            user_id=request.customer_id,
                            user_message=user_message,
                            ai_response=standard_answer,
                            recent_history=recent_turns,
                            session_memory=session_memory,
                            detected_intent=intent_result.intent.value,
                            route=conversation_route.kind,
                            route_reason=conversation_route.reason,
                            node="unknown_keyword_standard_answer",
                            referenced_sources={
                                "faq_match": matched_question_title,
                                "similarity_score": similarity_score,
                            },
                            latency_ms=_elapsed_ms(started_at),
                            channel="web",
                        )
                        
                        return ChatResponse(
                            message=standard_answer,
                            session_id=session_id,
                            timestamp=datetime.now().isoformat(),
                            options=[],
                            suggestions=None,
                            image_url=menu_image_url,
                            line_reply_messages=line_reply_messages,
                        )
                except Exception as uk_err:
                    logger.warning(f"不明キーワードDB検索エラー: {uk_err}")
                    # エラーが発生しても処理を続行（RAG検索にフォールバック）
            
            # 不明キーワード検索でマッチしなかった場合、RAG検索を実行
            # RAG検索（件数を増やして複数メニュー提案に対応）
            rag_results = []
            if chroma_client._built:
                rag_results = chroma_client.query(user_message, k=15)

            unknown_context_result = None
            if (
                unknown_keyword_service
                and response_mode == "suggestion"
                and allow_standard_answer_search
            ):
                try:
                    unknown_context_result = unknown_keyword_service.search_similar_question(
                        user_message,
                        threshold=60.0,
                    )
                except Exception as context_err:
                    logger.warning(f"不明キーワード補助検索エラー: {context_err}")

            notion_context = [unknown_context_result] if unknown_context_result else []
            combined_context = ai_engine.build_context(
                user_input=user_message,
                session_id=session_id,
                rag_data=rag_results,
                notion_data=notion_context,
                intent_result=intent_result,
            )
            live_notion_context = notion_knowledge_service.build_context(
                message=user_message,
                route=conversation_route,
                session_memory=session_memory,
            )
            if live_notion_context:
                combined_context = (
                    f"{combined_context}\n\n"
                    "[Live Notion knowledge]\n"
                    f"{live_notion_context}"
                ).strip()
            
            response_options: list = []
            response_message = ""
            agent_used = False
            detected_intent = intent_result.intent.value
            response_source = "ai_engine"

            if agent_engine:
                try:
                    response_message = agent_engine.run(
                        session_id=session_id,
                        user_message=request.message,
                        rag_results=rag_results,
                    )
                    agent_used = True
                    response_source = "agent"
                    logger.info("[OK] AgentExecutorで応答生成")
                except AgentEngineError as e:
                    logger.warning(f"[WARN] AgentExecutorエラーのためフォールバック: {e}")
                    import traceback
                    logger.error(f"[ERROR] AgentExecutorエラー詳細: {traceback.format_exc()}")
                except Exception as e:
                    logger.warning(f"[WARN] AgentExecutor予期せぬエラー: {e}")
                    import traceback
                    logger.error(f"[ERROR] AgentExecutor予期せぬエラー詳細: {traceback.format_exc()}")

            should_use_graph = intent_result.intent in {
                IntentType.QUESTION,
                IntentType.COMPARISON,
            }

            if not agent_used:
                if (
                    should_use_graph
                    and graph_engine
                    and config.get("features.enable_langgraph", False)
                ):
                    try:
                        ai_engine.ensure_session(session_id)
                        conv_turns = ai_engine.get_llm_conversation_turns(session_id)
                        initial_state: ConversationState = {
                            "messages": [request.message],
                            "current_step": "",
                            "user_intent": intent_result.intent.value,
                            "context": {
                                "conversation_turns": conv_turns,
                                "combined_context": combined_context,
                                "intent": intent_result.intent.value,
                                "topic": intent_result.topic,
                            },
                            "rag_results": rag_results,
                            "response": "",
                            "options": [],
                            "selected_option": "",
                        }

                        final_state = graph_engine.invoke(initial_state)
                        response_message = final_state.get("response", "")
                        response_options = final_state.get("options", [])
                        response_source = "langgraph"
                        # 意図を取得（存在する場合）
                        detected_intent = final_state.get("user_intent", "Other")
                        if not detected_intent or detected_intent.strip() == "":
                            detected_intent = "Other"

                        session = ai_engine.get_session(session_id)
                        if session:
                            session.add_message("user", request.message)
                            session.add_message("assistant", response_message)

                        logger.info(
                            f"[OK] LangGraphで応答生成: {final_state.get('current_step')} (options: {len(response_options)}, intent: {detected_intent})"
                        )
                    except Exception as e:
                        logger.warning(f"[WARN] LangGraphエラー、通常モードで応答: {e}")
                        if rag_results:
                            response_message = ai_engine.generate_response(
                                session_id=session_id,
                                user_message=request.message,
                                context=combined_context,
                                response_mode=response_mode,
                                tone=tone,
                                intent_result=intent_result,
                            )
                        else:
                            response_message = ai_engine.generate_hypothesis_answer(
                                session_id=session_id,
                                user_message=request.message,
                                intent_result=intent_result,
                                context=combined_context,
                            )
                        response_options = []
                else:
                    if rag_results:
                        response_message = ai_engine.generate_response(
                            session_id=session_id,
                            user_message=request.message,
                            context=combined_context,
                            response_mode=response_mode,
                            tone=tone,
                            intent_result=intent_result,
                        )
                    else:
                        response_message = ai_engine.generate_hypothesis_answer(
                            session_id=session_id,
                            user_message=request.message,
                            intent_result=intent_result,
                            context=combined_context,
                        )
                    response_options = []

            logger.info(
                "[Decision] session=%s source=%s intent=%s mode=%s rag_hits=%d notion_hits=%d",
                session_id[:8],
                response_source,
                intent_result.intent.value,
                response_mode,
                len(rag_results),
                len(notion_context),
            )
            
            # 会話履歴をNotionに保存（設定で有効な場合）
            menu_image_url, menu_image_log = resolve_menu_image_for_chat(
                shared_menu_service, user_message
            )
            logger.info(menu_image_log)
            response_message = append_line_contact_footer(response_message)
            line_reply_messages = attach_line_messages_if_image(
                response_message, menu_image_url
            )

            if config.get("features.save_conversation", False):
                try:
                    conversation_db_id = config.get("notion.database_ids.conversation_history_db")
                    if conversation_db_id and conversation_db_id.strip():
                        customer_id = request.customer_id or session_id[:8]  # セッションIDの最初の8文字を使用
                        # 検索キーワードはユーザーの発話そのものを使用
                        search_keyword = request.message.strip()
                        notion_client.save_conversation_history(
                            database_id=conversation_db_id,
                            customer_id=customer_id,
                            question=request.message,
                            answer=response_message,
                            timestamp=datetime.now(),
                            intent=detected_intent,
                            search_keyword=search_keyword
                        )
                        logger.info(f"[OK] 会話履歴を保存しました: {customer_id}, intent: {detected_intent}")
                    else:
                        logger.warning("[WARN] 会話履歴データベースIDが設定されていません")
                except Exception as e:
                    logger.error(f"[ERROR] 会話履歴の保存に失敗: {e}")
                    # エラーが発生しても会話は続行

            _record_quality_log(
                session_id=session_id,
                user_id=request.customer_id,
                user_message=request.message,
                ai_response=response_message,
                recent_history=recent_turns,
                session_memory=session_memory,
                detected_intent=detected_intent,
                route=conversation_route.kind,
                route_reason=conversation_route.reason,
                node=response_source,
                referenced_sources={
                    "rag_hits": len(rag_results),
                    "unknown_keyword_context": bool(unknown_context_result),
                    "live_notion_context": bool(live_notion_context),
                    "options_count": len(response_options),
                    "menu_image": bool(menu_image_url),
                },
                latency_ms=_elapsed_ms(started_at),
                channel="web",
            )
            
            # レスポンス
            return ChatResponse(
                message=response_message,
                session_id=session_id,
                timestamp=datetime.now().isoformat(),
                options=response_options,
                suggestions=response_options if response_options else None,  # Next.jsフロントエンド用
                image_url=menu_image_url,
                line_reply_messages=line_reply_messages,
            )
        
        except Exception as e:
            logger.error(f"[ERROR] チャット処理エラー: {e}")
            import traceback
            logger.error(f"[ERROR] トレースバック: {traceback.format_exc()}")
            if session_id:
                _record_quality_log(
                    session_id=session_id,
                    user_id=request.customer_id,
                    user_message=user_message,
                    ai_response="",
                    recent_history=recent_turns,
                    session_memory=session_memory,
                    detected_intent=detected_intent,
                    route=conversation_route.kind if conversation_route else "",
                    route_reason=conversation_route.reason if conversation_route else "",
                    node="chat_error",
                    referenced_sources={},
                    latency_ms=_elapsed_ms(started_at),
                    error=str(e),
                    channel="web",
                )
            raise HTTPException(status_code=500, detail=f"チャット処理でエラーが発生しました: {str(e)}")
    
    # セッション管理
    @app.post("/session")
    async def create_session(request: Optional[SessionCreateRequest] = None):
        """新しいセッションを作成"""
        try:
            # 顧客情報を含めてセッション作成
            customer_secret = None
            customer_consent = False
            
            if request:
                customer_secret = request.customer_secret
                customer_consent = request.customer_consent or False
            
            session_customer_id = request.customer_id if request else None
            session_id = ai_engine.create_session(session_customer_id)
            _safe_link_customer_session(session_customer_id, session_id)
            
            # 常連さまモードは一時保留のため、顧客情報の処理をコメントアウト
            # # 顧客情報をセッションメタデータに保存
            # session = ai_engine.get_session(session_id)
            # if session and customer_secret and customer_consent:
            #     # セッションに顧客情報を追加
            #     session.metadata = session.metadata or {}
            #     session.metadata['customer_secret'] = customer_secret
            #     session.metadata['customer_consent'] = customer_consent
            #     
            #     logger.info(f"[Session] 常連さまモード: {customer_secret}")
            
            return {
                "session_id": session_id,
                "customer_id": session_customer_id,
                "customer_mode": False  # 常連さまモードは一時保留
            }
        except Exception as e:
            logger.error(f"[ERROR] セッション作成エラー: {e}")
            raise HTTPException(status_code=500, detail="セッション作成でエラーが発生しました")
    
    @app.get("/session/{session_id}")
    async def get_session(session_id: str):
        """セッション情報を取得"""
        try:
            session = ai_engine.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="セッションが見つかりません")
            
            return {
                "session_id": session.session_id,
                "customer_id": session.customer_id,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
                "message_count": len(session.messages)
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[ERROR] セッション取得エラー: {e}")
            raise HTTPException(status_code=500, detail="セッション取得でエラーが発生しました")
    
    @app.delete("/session/{session_id}")
    async def delete_session(session_id: str):
        """セッションを削除"""
        try:
            success = ai_engine.delete_session(session_id)
            if not success:
                raise HTTPException(status_code=404, detail="セッションが見つかりません")
            
            return {"message": "セッションが削除されました"}
        except Exception as e:
            logger.error(f"[ERROR] セッション削除エラー: {e}")
            raise HTTPException(status_code=500, detail="セッション削除でエラーが発生しました")
    
    # RAG管理
    @app.post("/rag/rebuild")
    async def rag_rebuild(purge: bool = False):
        """RAGを再構築"""
        try:
            if purge:
                chroma_client.purge()
            
            documents = await load_knowledge_base(config, notion_client)
            chroma_client.build(documents)
            
            return {
                "message": "RAGを再構築しました",
                "doc_count": len(documents)
            }
        except Exception as e:
            logger.error(f"[ERROR] RAG再構築エラー: {e}")
            raise HTTPException(status_code=500, detail="RAG再構築でエラーが発生しました")
    
    @app.get("/rag/status")
    async def rag_status():
        """RAGの状態確認"""
        return {
            "built": chroma_client._built,
            "doc_count": chroma_client.last_doc_count,
            "using_chroma": chroma_client.using_chroma,
            "persist_dir": chroma_client.persist_dir
        }
    
    # WebSocketエンドポイント
    @app.websocket("/ws/{session_id}")
    async def websocket_endpoint(websocket: WebSocket, session_id: str):
        """WebSocket接続エンドポイント"""
        await ws_manager.connect(websocket, session_id)
        
        # 初回挨拶（SimpleGraphを使用）
        if simple_graph:
            try:
                initial_state: State = {
                    "messages": [],
                    "intent": "",
                    "context": {"trigger": "greeting"},
                    "response": "",
                    "options": [],
                    "should_push": False,
                    "session_id": session_id
                }
                
                result = simple_graph.invoke(initial_state)
                
                await websocket.send_json({
                    "type": "greeting",
                    "message": result["response"],
                    "options": result["options"],
                    "timestamp": datetime.now().isoformat()
                })
                
                # プロアクティブメッセージを90秒後に送信
                async def delayed_proactive():
                    await asyncio.sleep(90)
                    try:
                        proactive_state: State = {
                            "messages": [""],
                            "intent": "proactive",
                            "context": {"trigger": "proactive"},
                            "response": "",
                            "options": [],
                            "should_push": False,
                            "session_id": session_id
                        }
                        result = simple_graph.invoke(proactive_state)
                        
                        await ws_manager.send_personal(session_id, {
                            "type": "proactive",
                            "message": result["response"],
                            "options": result["options"],
                            "timestamp": datetime.now().isoformat()
                        })
                        logger.info(f"[Proactive] メッセージ送信: {session_id[:8]}...")
                    except Exception as e:
                        logger.error(f"[Proactive] エラー: {e}")
                
                asyncio.create_task(delayed_proactive())
            
            except Exception as e:
                logger.error(f"[WS] 初回挨拶エラー: {e}")
        
        try:
            while True:
                started_at = time.perf_counter()
                data = await websocket.receive_json()
                message = data.get("message", "")
                
                logger.info(f"[WS] 受信 ({session_id[:8]}...): {message}")
                
                # SimpleGraphで処理
                if simple_graph:
                    logger.info(f"[WS] SimpleGraphEngine使用: {message}")
                    try:
                        # セッションのstateを取得または作成
                        ai_engine.ensure_session(session_id)
                        conv_turns = ai_engine.get_llm_conversation_turns(session_id)

                        if session_id in ws_manager.session_states:
                            # 既存のstateを取得し、コンテキストを保持
                            existing_state = ws_manager.session_states[session_id]
                            merged_ctx = dict(existing_state.get("context", {"trigger": "user"}))
                            merged_ctx["conversation_turns"] = conv_turns
                            state: State = {
                                "messages": [message],
                                "intent": "",
                                "context": merged_ctx,
                                "response": "",
                                "options": [],
                                "should_push": False,
                                "session_id": session_id
                            }
                            logger.info(f"[WS] 既存のstateからコンテキストを復元: {list(state.get('context', {}).keys())}")
                        else:
                            # 新しいstateを作成
                            state: State = {
                                "messages": [message],
                                "intent": "",
                                "context": {
                                    "trigger": "user",
                                    "conversation_turns": conv_turns,
                                },
                                "response": "",
                                "options": [],
                                "should_push": False,
                                "session_id": session_id
                            }
                        
                        ws_session_memory = ai_engine.get_session_memory(session_id)
                        if is_initial_reservation_request(message, ws_session_memory):
                            direct_response = format_initial_reservation_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "reservation",
                                    "pending_flow": "reservation",
                                    "detected_intent": "reservation",
                                    "last_assistant_action": "initial_reservation_request",
                                },
                            )
                            result = {
                                **state,
                                "intent": "reservation",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] initial_reservation_request")
                        elif (
                            detect_short_store_faq_key(message)
                            and ws_session_memory.get("pending_flow") != "reservation"
                            and ws_session_memory.get("active_topic") != "reservation"
                        ):
                            short_store_faq_key = detect_short_store_faq_key(message)
                            direct_response = format_short_store_faq_reply(
                                short_store_faq_key or ""
                            )
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "store_info",
                                    "detected_intent": "facility_inquiry",
                                    "last_assistant_action": "short_store_faq",
                                },
                            )
                            result = {
                                **state,
                                "intent": "facility_inquiry",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] short_store_faq key=%s", short_store_faq_key)
                        elif is_reservation_correction(message, ws_session_memory):
                            direct_response = format_reservation_correction_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "natural",
                                    "pending_flow": "",
                                    "detected_intent": "clarification_required",
                                    "last_assistant_action": "reservation_correction",
                                },
                            )
                            result = {
                                **state,
                                "intent": "clarification_required",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] reservation_correction")
                        elif is_cancel_request(message, ws_session_memory):
                            direct_response = format_cancel_request_reply(ws_session_memory)
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "natural",
                                    "pending_flow": "",
                                    "detected_intent": "cancel",
                                    "order_intent_level": "none",
                                    "current_entity": "",
                                    "recently_confirmed_item": "",
                                    "last_assistant_action": "cancelled_pending_flow",
                                },
                            )
                            result = {
                                **state,
                                "intent": "cancel",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] cancel_request")
                        elif is_today_business_request(message):
                            direct_response = format_today_business_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "store_info",
                                    "detected_intent": "business_hours",
                                    "last_assistant_action": "answered_today_business",
                                },
                            )
                            result = {
                                **state,
                                "intent": "business_hours",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] today_business")
                        elif is_previous_price_request(
                            message, ws_session_memory
                        ) or is_contextual_price_request(message, ws_session_memory):
                            recent_item_name = get_recent_item_name(ws_session_memory)
                            menu_items = shared_menu_service.fetch_menu_items(
                                recent_item_name,
                                limit=5,
                            )
                            exact_menu_items = [
                                item
                                for item in menu_items
                                if getattr(item, "name", "") == recent_item_name
                            ]
                            if exact_menu_items:
                                menu_items = exact_menu_items
                            direct_response = format_contextual_price_reply(
                                recent_item_name,
                                menu_items,
                            )
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "menu",
                                    "current_entity": recent_item_name,
                                    "detected_intent": "product_price",
                                    "last_assistant_action": "answered_product_price",
                                },
                            )
                            result = {
                                **state,
                                "intent": "product_price",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] contextual_price")
                        elif is_accept_proposal_request(message, ws_session_memory):
                            direct_response = format_accept_proposal_reply(ws_session_memory)
                            recent_item_name = get_recent_item_name(ws_session_memory)
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "order",
                                    "pending_flow": "order",
                                    "detected_intent": "product_order",
                                    "order_intent_level": "confirming",
                                    "recently_confirmed_item": recent_item_name,
                                    "last_assistant_action": "confirmed_order_item",
                                },
                            )
                            result = {
                                **state,
                                "intent": "product_order",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] accept_proposal")
                        elif is_other_recommendation_request(message, ws_session_memory):
                            direct_response = format_other_recommendation_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "recommendation",
                                    "detected_intent": "product_recommendation",
                                    "last_assistant_action": "other_recommendation",
                                },
                            )
                            result = {
                                **state,
                                "intent": "product_recommendation",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] other_recommendation")
                        elif is_what_available_request(message, ws_session_memory):
                            direct_response = format_what_available_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "menu",
                                    "detected_intent": "menu_search",
                                    "last_assistant_action": "what_available",
                                },
                            )
                            result = {
                                **state,
                                "intent": "menu_search",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] what_available")
                        elif is_party_size_without_context(message, ws_session_memory):
                            direct_response = format_party_size_without_context_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "reservation",
                                    "pending_flow": "reservation",
                                    "detected_intent": "reservation",
                                    "last_assistant_action": "reservation_party_size_clarification",
                                },
                            )
                            result = {
                                **state,
                                "intent": "reservation",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] party_size_without_context")
                        elif is_night_visit_request(message, ws_session_memory):
                            direct_response = format_night_visit_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "reservation",
                                    "pending_flow": "reservation",
                                    "detected_intent": "reservation",
                                    "last_assistant_action": "night_visit_clarification",
                                },
                            )
                            result = {
                                **state,
                                "intent": "reservation",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] night_visit")
                        elif is_reservation_followup_request(message, ws_session_memory):
                            ws_route = classify_conversation_route(
                                message,
                                recent_messages=[
                                    turn.get("content", "")
                                    for turn in conv_turns
                                    if turn.get("content")
                                ],
                                active_topic=ws_session_memory.get("active_topic"),
                                pending_flow=ws_session_memory.get("pending_flow"),
                            )
                            ws_memory_updates = infer_memory_updates(
                                message,
                                ws_route,
                                current_memory=ws_session_memory,
                            )
                            if ws_memory_updates:
                                ai_engine.save_memory(session_id, ws_memory_updates)
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "reservation",
                                    "pending_flow": "reservation",
                                    "detected_intent": "reservation",
                                    "last_assistant_action": "reservation_followup",
                                },
                            )
                            ws_session_memory = ai_engine.get_session_memory(session_id)
                            direct_response = format_reservation_followup_reply(
                                ws_session_memory
                            )
                            result = {
                                **state,
                                "intent": "reservation",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] reservation_followup")
                        elif is_short_order_confirmation(message, ws_session_memory):
                            direct_response = format_short_order_confirmation(ws_session_memory)
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "order",
                                    "pending_flow": "order",
                                    "detected_intent": "product_order",
                                    "order_intent_level": "confirming",
                                    "recently_confirmed_item": get_recent_item_name(ws_session_memory),
                                    "last_assistant_action": "confirmed_order_item",
                                },
                            )
                            result = {
                                **state,
                                "intent": "product_order",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] short_order_confirmation")
                        elif detect_short_store_faq_key(message):
                            short_store_faq_key = detect_short_store_faq_key(message)
                            direct_response = format_short_store_faq_reply(
                                short_store_faq_key or ""
                            )
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "store_info",
                                    "detected_intent": "facility_inquiry",
                                    "last_assistant_action": "short_store_faq",
                                },
                            )
                            result = {
                                **state,
                                "intent": "facility_inquiry",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] short_store_faq key=%s", short_store_faq_key)
                        elif is_direct_menu_existence_question(message):
                            menu_items = shared_menu_service.search_menu_items_for_existence(
                                message,
                                limit=5,
                            )
                            direct_response = format_direct_menu_existence_answer(menu_items)
                            current_entity = (
                                getattr(menu_items[0], "name", "") if menu_items else message
                            )
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "menu",
                                    "current_entity": current_entity,
                                    "detected_intent": "product_existence",
                                    "user_goal": "availability_check",
                                    "order_intent_level": "none",
                                    "answered_facts": {
                                        "product_existence": current_entity,
                                        "exists": bool(menu_items),
                                    },
                                    "previous_question": message,
                                    "last_assistant_action": "answered_product_existence",
                                },
                            )
                            result = {
                                **state,
                                "intent": "menu_existence",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info(
                                "[WS] direct_menu_existence hits=%d",
                                len(menu_items),
                            )
                        elif is_snack_recommendation_request(message):
                            direct_response = format_snack_recommendation_reply()
                            ai_engine.save_memory(
                                session_id,
                                {
                                    "active_topic": "recommendation",
                                    "detected_intent": "product_recommendation",
                                    "last_assistant_action": "snack_recommendation",
                                },
                            )
                            result = {
                                **state,
                                "intent": "product_recommendation",
                                "response": direct_response,
                                "options": [],
                            }
                            logger.info("[WS] snack_recommendation")
                        else:
                            logger.info(f"[WS] SimpleGraphEngine invoke開始")
                            ws_intent_result = intent_classifier.classify(message)
                            ws_route = classify_conversation_route(
                                message,
                                recent_messages=[
                                    turn.get("content", "")
                                    for turn in conv_turns
                                    if turn.get("content")
                                ],
                                active_topic=ws_session_memory.get("active_topic"),
                                pending_flow=ws_session_memory.get("pending_flow"),
                            )
                            sales_recommendation = explicit_sales_recommendation.try_recommend(
                                session_id=session_id,
                                user_message=message,
                                intent_value=ws_intent_result.intent.value,
                                route_kind=ws_route.kind,
                                session_memory=ws_session_memory,
                            )
                            if sales_recommendation.has_message:
                                ai_engine.save_memory(
                                    session_id,
                                    sales_recommendation.memory_updates or {},
                                )
                                result = {
                                    **state,
                                    "intent": "product_recommendation",
                                    "response": sales_recommendation.message,
                                    "options": [],
                                    "context": {
                                        **state.get("context", {}),
                                        "conversation_route": ws_route.kind,
                                        "conversation_route_reason": ws_route.reason,
                                        "sales_strategy_id": sales_recommendation.strategy_id,
                                        "selected_product_id": sales_recommendation.selected_product_id,
                                    },
                                }
                                logger.info(
                                    "[WS][SalesStrategy] strategy_id=%s product_id=%s",
                                    sales_recommendation.strategy_id,
                                    sales_recommendation.selected_product_id,
                                )
                            else:
                                if sales_recommendation.skip_reason:
                                    logger.info(
                                        "[WS][SalesStrategy] skipped=%s",
                                        sales_recommendation.skip_reason,
                                    )
                                result = simple_graph.invoke(state)
                            logger.info(f"[WS] SimpleGraphEngine invoke完了: {result.get('response', '')[:50]}...")
                        
                        if message.strip():
                            sess = ai_engine.get_session(session_id)
                            if sess:
                                sess.add_message("user", message)
                                sess.add_message("assistant", result.get("response", ""))

                        # stateをセッションに保存（コンテキストを保持）
                        ws_manager.session_states[session_id] = result
                        logger.info(f"[WS] stateをセッションに保存: options={len(result.get('options', []))}件, context_keys={list(result.get('context', {}).keys())}")
                        
                        # 意図を取得（存在する場合、デフォルトは"Other"）
                        detected_intent = result.get("intent", "Other")
                        if not detected_intent or detected_intent.strip() == "":
                            detected_intent = "Other"
                        
                        # 会話履歴をNotionに保存（設定で有効な場合）
                        if config.get("features.save_conversation", False):
                            try:
                                conversation_db_id = config.get("notion.database_ids.conversation_history_db")
                                if conversation_db_id and conversation_db_id.strip():
                                    customer_id = session_id[:8]  # セッションIDの最初の8文字を使用
                                    # 検索キーワードはユーザーの発話そのものを使用
                                    search_keyword = message.strip()
                                    notion_client.save_conversation_history(
                                        database_id=conversation_db_id,
                                        customer_id=customer_id,
                                        question=message,
                                        answer=result.get("response", ""),
                                        timestamp=datetime.now(),
                                        intent=detected_intent,
                                        search_keyword=search_keyword
                                    )
                                    logger.info(f"[WS] 会話履歴を保存しました: {customer_id}, intent: {detected_intent}")
                                else:
                                    logger.warning("[WARN] 会話履歴データベースIDが設定されていません")
                            except Exception as e:
                                logger.error(f"[WS] 会話履歴の保存に失敗: {e}")
                                # エラーが発生しても会話は続行
                        
                        # 応答をWebSocket経由で返す（画像URLは HTTP /chat と同じ解決ロジック）
                        display_text = normalize_customer_reply(result.get("response", ""))
                        full_with_footer = append_line_contact_footer(display_text)
                        ws_img_url, ws_menu_log = resolve_menu_image_for_chat(
                            shared_menu_service, message
                        )
                        logger.info(ws_menu_log)
                        response = {
                            "type": "response",
                            "message": display_text,
                            "options": result.get("options", []),
                            "timestamp": datetime.now().isoformat(),
                            "image_url": ws_img_url,
                            "line_reply_messages": attach_line_messages_if_image(
                                full_with_footer, ws_img_url
                            ),
                        }
                        ws_context = result.get("context", {}) or {}
                        _record_quality_log(
                            session_id=session_id,
                            user_id=session_id,
                            user_message=message,
                            ai_response=display_text,
                            recent_history=conv_turns,
                            session_memory=ai_engine.get_session_memory(session_id),
                            detected_intent=detected_intent,
                            route=ws_context.get("conversation_route", ""),
                            route_reason=ws_context.get("conversation_route_reason", ""),
                            node=result.get("current_step") or result.get("intent") or "simple_graph",
                            referenced_sources={
                                "options_count": len(result.get("options", [])),
                                "menu_image": bool(ws_img_url),
                                "line_messages": bool(response.get("line_reply_messages")),
                            },
                            latency_ms=_elapsed_ms(started_at),
                            channel="websocket",
                        )
                        logger.info(f"[WS] 送信メッセージ詳細: {response['message']}")
                        await websocket.send_json(response)
                        
                        logger.info(f"[WS] 送信 ({session_id[:8]}...): {result.get('response', '')[:50]}...")
                        logger.info(f"[WS] 送信オプション数: {len(result.get('options', []))}件, オプション: {result.get('options', [])}")
                    
                    except Exception as e:
                        logger.error(f"[WS] グラフ実行エラー: {e}")
                        _record_quality_log(
                            session_id=session_id,
                            user_id=session_id,
                            user_message=message,
                            ai_response="",
                            recent_history=ai_engine.get_llm_conversation_turns(session_id),
                            session_memory=ai_engine.get_session_memory(session_id),
                            detected_intent="",
                            route="",
                            route_reason="",
                            node="websocket_error",
                            referenced_sources={},
                            latency_ms=_elapsed_ms(started_at),
                            error=str(e),
                            channel="websocket",
                        )
                        await websocket.send_json({
                            "type": "error",
                            "message": "申し訳ございません。エラーが発生しました。",
                            "options": [],
                            "timestamp": datetime.now().isoformat()
                        })
                else:
                    # SimpleGraphEngineが利用できない場合のフォールバック
                    logger.warning(f"[WS] SimpleGraphEngineが利用できません")
                    await websocket.send_json({
                        "type": "error",
                        "message": "申し訳ございません。システムが利用できません。",
                        "options": [],
                        "timestamp": datetime.now().isoformat()
                    })
        
        except WebSocketDisconnect:
            ws_manager.disconnect(session_id)
            logger.info(f"[WS] 切断: {session_id[:8]}...")
        except Exception as e:
            logger.error(f"[WS] エラー: {e}")
            ws_manager.disconnect(session_id)
    
    # WebSocket状態確認
    @app.get("/ws/status")
    async def websocket_status():
        """WebSocket接続状態を確認"""
        return {
            "active_connections": len(ws_manager.get_active_sessions()),
            "sessions": ws_manager.get_active_sessions()
        }
    
    return app


async def load_knowledge_base(
    config: ConfigLoader,
    notion_client: NotionClient
) -> list[Dict[str, Any]]:
    """
    ナレッジベースを読み込む
    
    Args:
        config: 設定ローダー
        notion_client: Notionクライアント
    
    Returns:
        ドキュメントリスト
    """
    documents = []
    
    # Notionデータベースから読み込み（個別ドキュメント化）
    db_ids = config.get("notion.database_ids", {})
    if db_ids:
        for db_name, db_id in db_ids.items():
            if db_id and db_id.strip():  # 空文字チェック追加
                try:
                    logger.info(f"[Notion] DB読み込み: {db_name} ({db_id[:20]}...)")
                    pages = notion_client.get_all_pages(db_id)
                    if pages:
                        # 各ページを個別のドキュメントとして登録
                        page_count = 0
                        for page in pages:
                            try:
                                properties = page.get("properties", {})
                                text_parts = []
                                
                                # 各プロパティを取得
                                for prop_name in properties.keys():
                                    value = notion_client.get_property_value(page, prop_name)
                                    if value is not None and value != "":
                                        # リスト型の場合は文字列化
                                        if isinstance(value, list):
                                            value = ", ".join(str(v) for v in value)
                                        text_parts.append(f"{prop_name}: {value}")
                                
                                if text_parts:
                                    page_text = "\n".join(text_parts)
                                    documents.append({
                                        "id": f"notion_{db_name}_{page.get('id')}",
                                        "text": page_text,
                                        "type": f"notion_{db_name}"
                                    })
                                    page_count += 1
                            except Exception as page_error:
                                logger.warning(f"[WARN] ページ処理エラー: {page_error}")
                                continue
                        
                        logger.info(f"[OK] {db_name}: {page_count}件のドキュメントを作成しました（{len(pages)}ページから）")
                except Exception as e:
                    logger.warning(f"[WARN] Notion DB読み込みエラー ({db_name}): {e}")
    
    # ローカルファイルから読み込み
    knowledge_path = config.get_knowledge_base_path()
    try:
        from pathlib import Path
        knowledge_dir = Path(knowledge_path)
        if knowledge_dir.exists():
            for file_path in knowledge_dir.glob("**/*.md"):
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    documents.append({
                        "id": str(file_path),
                        "text": content,
                        "type": "local"
                    })
    except Exception as e:
        logger.warning(f"[WARN] ローカルファイル読み込みエラー: {e}")
    
    return documents
