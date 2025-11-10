"""
API Framework

FastAPIベースの汎用APIフレームワーク
"""

import logging
import asyncio
from typing import Optional, Dict, Any, Set
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path

from .config_loader import ConfigLoader
from .ai_engine import AIEngine
from .chroma_client import ChromaClient
from .notion_client import NotionClient

logger = logging.getLogger(__name__)

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


class ChatResponse(BaseModel):
    """チャットレスポンス"""
    message: str
    session_id: str
    timestamp: str
    options: Optional[list] = []  # ハイブリッドUI用選択肢


class ConnectionManager:
    """WebSocket接続管理"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_metadata: Dict[str, dict] = {}
    
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
            
            # MenuServiceを初期化
            from core.menu_service import MenuService
            menu_db_id = config.get("notion.database_ids.menu_db")
            menu_service = MenuService(notion_client, menu_db_id)
            logger.info(f"[DEBUG] MenuService初期化完了 (DB ID: {menu_db_id})")
            
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
    
    # チャットエンドポイント
    @app.post("/chat", response_model=ChatResponse)
    async def chat(request: ChatRequest):
        """チャット処理"""
        try:
            # セッション作成または取得
            session_id = request.session_id
            if not session_id:
                session_id = ai_engine.create_session(request.customer_id)
            
            # RAG検索（件数を増やして複数メニュー提案に対応）
            rag_results = []
            if chroma_client._built:
                rag_results = chroma_client.query(request.message, k=15)
            
            response_options: list = []
            response_message = ""
            agent_used = False

            if agent_engine:
                try:
                    response_message = agent_engine.run(
                        session_id=session_id,
                        user_message=request.message,
                        rag_results=rag_results,
                    )
                    agent_used = True
                    logger.info("[OK] AgentExecutorで応答生成")
                except AgentEngineError as e:
                    logger.warning(f"[WARN] AgentExecutorエラーのためフォールバック: {e}")
                    import traceback
                    logger.error(f"[ERROR] AgentExecutorエラー詳細: {traceback.format_exc()}")
                except Exception as e:
                    logger.warning(f"[WARN] AgentExecutor予期せぬエラー: {e}")
                    import traceback
                    logger.error(f"[ERROR] AgentExecutor予期せぬエラー詳細: {traceback.format_exc()}")

            if not agent_used:
                if graph_engine and config.get("features.enable_langgraph", False):
                    try:
                        initial_state: ConversationState = {
                            "messages": [request.message],
                            "current_step": "",
                            "user_intent": "",
                            "context": {},
                            "rag_results": rag_results,
                            "response": "",
                            "options": [],
                            "selected_option": "",
                        }

                        final_state = graph_engine.invoke(initial_state)
                        response_message = final_state.get("response", "")
                        response_options = final_state.get("options", [])

                        session = ai_engine.get_session(session_id)
                        if session:
                            session.add_message("user", request.message)
                            session.add_message("assistant", response_message)

                        logger.info(
                            f"[OK] LangGraphで応答生成: {final_state.get('current_step')} (options: {len(response_options)})"
                        )
                    except Exception as e:
                        logger.warning(f"[WARN] LangGraphエラー、通常モードで応答: {e}")
                        response_message = ai_engine.generate_response_with_rag(
                            session_id=session_id,
                            user_message=request.message,
                            rag_results=rag_results,
                        )
                        response_options = []
                else:
                    response_message = ai_engine.generate_response_with_rag(
                        session_id=session_id,
                        user_message=request.message,
                        rag_results=rag_results,
                    )
                    response_options = []
            
            # 会話履歴をNotionに保存（設定で有効な場合）
            if config.get("features.save_conversation", False):
                try:
                    conversation_db_id = config.get("notion.database_ids.conversation_history_db")
                    if conversation_db_id and conversation_db_id.strip():
                        customer_id = request.customer_id or session_id[:8]  # セッションIDの最初の8文字を使用
                        notion_client.save_conversation_history(
                            database_id=conversation_db_id,
                            customer_id=customer_id,
                            question=request.message,
                            answer=response_message,
                            timestamp=datetime.now()
                        )
                        logger.info(f"[OK] 会話履歴を保存しました: {customer_id}")
                    else:
                        logger.warning("[WARN] 会話履歴データベースIDが設定されていません")
                except Exception as e:
                    logger.error(f"[ERROR] 会話履歴の保存に失敗: {e}")
                    # エラーが発生しても会話は続行
            
            # レスポンス
            return ChatResponse(
                message=response_message,
                session_id=session_id,
                timestamp=datetime.now().isoformat(),
                options=response_options
            )
        
        except Exception as e:
            logger.error(f"[ERROR] チャット処理エラー: {e}")
            import traceback
            logger.error(f"[ERROR] トレースバック: {traceback.format_exc()}")
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
            
            session_id = ai_engine.create_session()
            
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
                data = await websocket.receive_json()
                message = data.get("message", "")
                
                logger.info(f"[WS] 受信 ({session_id[:8]}...): {message}")
                
                # SimpleGraphで処理
                if simple_graph:
                    logger.info(f"[WS] SimpleGraphEngine使用: {message}")
                    try:
                        state: State = {
                            "messages": [message],
                            "intent": "",
                            "context": {"trigger": "user"},
                            "response": "",
                            "options": [],
                            "should_push": False,
                            "session_id": session_id
                        }
                        
                        logger.info(f"[WS] SimpleGraphEngine invoke開始")
                        result = simple_graph.invoke(state)
                        logger.info(f"[WS] SimpleGraphEngine invoke完了: {result.get('response', '')[:50]}...")
                        
                        # 会話履歴をNotionに保存（設定で有効な場合）
                        if config.get("features.save_conversation", False):
                            try:
                                conversation_db_id = config.get("notion.database_ids.conversation_history_db")
                                if conversation_db_id and conversation_db_id.strip():
                                    customer_id = session_id[:8]  # セッションIDの最初の8文字を使用
                                    notion_client.save_conversation_history(
                                        database_id=conversation_db_id,
                                        customer_id=customer_id,
                                        question=message,
                                        answer=result.get("response", ""),
                                        timestamp=datetime.now()
                                    )
                                    logger.info(f"[WS] 会話履歴を保存しました: {customer_id}")
                                else:
                                    logger.warning("[WARN] 会話履歴データベースIDが設定されていません")
                            except Exception as e:
                                logger.error(f"[WS] 会話履歴の保存に失敗: {e}")
                                # エラーが発生しても会話は続行
                        
                        # 応答をWebSocket経由で返す
                        response = {
                            "type": "response",
                            "message": result.get("response", ""),
                            "options": result.get("options", []),
                            "timestamp": datetime.now().isoformat()
                        }
                        await websocket.send_json(response)
                        
                        logger.info(f"[WS] 送信 ({session_id[:8]}...): {result.get('response', '')[:50]}...")
                    
                    except Exception as e:
                        logger.error(f"[WS] グラフ実行エラー: {e}")
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

