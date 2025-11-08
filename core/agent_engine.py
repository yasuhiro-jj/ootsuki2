"""
Agent Executor Engine

LangChain AgentExecutor を利用してツール呼び出し型の会話制御を提供する
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

try:
    from langchain.agents import AgentExecutor, AgentType, initialize_agent
except ImportError as exc:  # pragma: no cover - import 安全対策
    raise ImportError(
        "LangChain Agents モジュールが見つかりません。'langchain' パッケージを更新してください。"
    ) from exc

try:
    from langchain.tools import Tool
except ImportError:  # pragma: no cover - 旧API互換
    from langchain.agents import Tool  # type: ignore

from langchain_core.messages import SystemMessage

from .menu_service import MenuService, MenuItemView

logger = logging.getLogger(__name__)


class AgentEngineError(Exception):
    """AgentEngine 関連の例外"""


class AgentEngine:
    """AgentExecutor を用いた高度な会話制御"""

    def __init__(
        self,
        ai_engine,
        notion_client,
        chroma_client,
        config,
    ) -> None:
        if not getattr(ai_engine, "llm", None):
            raise AgentEngineError("LLM が初期化されていないため AgentExecutor を利用できません")

        self._ai_engine = ai_engine
        self._llm = ai_engine.llm
        self._notion_client = notion_client
        self._chroma_client = chroma_client
        self._config = config

        self._system_prompt: str = config.get(
            "agent.system_prompt", ai_engine.system_prompt
        )
        self._max_iterations: int = config.get("agent.max_iterations", 5)
        self._menu_db_id: Optional[str] = config.get("notion.database_ids.menu_db")

        self._menu_service = MenuService(notion_client, self._menu_db_id)

        self._tools: List[Tool] = self._build_tools()
        self._executors: Dict[str, AgentExecutor] = {}

    # ============================================================
    # Public API
    # ============================================================
    def run(
        self,
        session_id: str,
        user_message: str,
        rag_results: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """AgentExecutor で応答を生成"""

        if not user_message:
            raise AgentEngineError("ユーザーメッセージが空です")

        session = self._ensure_session(session_id)
        # セッションが再作成された場合は実際のセッションIDを使用
        actual_session_id = session.session_id if session else session_id
        executor = self._ensure_executor(actual_session_id, session)

        # RAGコンテキストを付与
        message_with_context = self._compose_message(user_message, rag_results)

        # LangChain 1.0では ConversationBufferMemory が廃止されたため、
        # メモリへの追加は行いません（セッション履歴は _ai_engine で管理）

        try:
            response = executor.invoke({"input": message_with_context})
        except Exception as exc:
            logger.error(f"[Agent] 実行エラー: {exc}")
            raise AgentEngineError("AgentExecutor の実行に失敗しました") from exc

        if isinstance(response, dict):
            output = response.get("output") or response.get("result") or ""
        else:
            output = str(response)

        if not output:
            output = "申し訳ございません。情報を取得できませんでした。"

        if session:
            session.add_message("user", user_message)
            session.add_message("assistant", output)
        # メモリへの追加は不要（セッション履歴で管理）

        return output

    # ============================================================
    # Internal helpers
    # ============================================================
    def _ensure_session(self, session_id: str):
        session = self._ai_engine.get_session(session_id)
        if session:
            return session

        # セッションが見つからない場合は新規作成
        new_session_id = self._ai_engine.create_session()
        logger.warning(f"[Agent] セッションが見つかりませんでした。新規作成: {new_session_id}")
        return self._ai_engine.get_session(new_session_id)

    def _ensure_executor(self, session_id: str, session) -> AgentExecutor:
        # セッションIDでexecutorを取得（セッションが再作成された場合は新しいIDを使用）
        actual_session_id = session.session_id if session else session_id
        executor = self._executors.get(actual_session_id)
        if executor:
            return executor

        # LangChain 1.0では ConversationBufferMemory は廃止されました
        # メモリなしでAgentExecutorを初期化します
        try:
            executor = initialize_agent(
                tools=self._tools,
                llm=self._llm,
                agent=AgentType.OPENAI_FUNCTIONS,
                verbose=False,
                handle_parsing_errors=True,
                max_iterations=self._max_iterations,
                agent_kwargs={"system_message": SystemMessage(content=self._system_prompt)},
            )
        except Exception as e:
            logger.error(f"[Agent] AgentExecutor初期化エラー: {e}")
            import traceback
            logger.error(f"[Agent] トレースバック: {traceback.format_exc()}")
            raise AgentEngineError(f"AgentExecutor初期化に失敗しました: {e}") from e

        self._executors[actual_session_id] = executor
        # メモリ管理は廃止されたため、_hydrate_memory_from_session は呼び出しません
        return executor

    def _build_tools(self) -> List[Tool]:
        def menu_search_tool(query: str) -> str:
            if not self._menu_service or not query:
                return "メニュー情報を取得できませんでした。"
            result = self._menu_service.search_menu_by_query(query, limit=5)
            return result or "該当するメニューが見つかりませんでした。"

        def menu_price_tool(query: str) -> str:
            if not self._menu_service or not query:
                return "価格は取得できませんでした。"
            items = self._menu_service.fetch_menu_items(query, limit=1)
            if not items:
                return "該当メニューの価格が見つかりませんでした。"
            item: MenuItemView = items[0]
            price_text = f"{item.price:,}円" if item.price is not None else "価格情報なし"
            feature = item.one_liner or item.description or ""
            lines = [f"{item.name} の価格は {price_text} です。"]
            if feature:
                lines.append(feature)
            return "\n".join(lines)

        def rag_lookup_tool(query: str) -> str:
            if not query:
                return "検索キーワードを入力してください。"
            if not self._chroma_client or not getattr(self._chroma_client, "_built", False):
                return "ナレッジベースがまだ準備できていません。"
            docs = self._chroma_client.query(query, k=5)
            if not docs:
                return "関連する資料は見つかりませんでした。"
            formatted = []
            for idx, doc in enumerate(docs[:3], 1):
                text = doc.get("text", "").strip()
                if len(text) > 200:
                    text = text[:200] + "..."
                formatted.append(f"[{idx}] {text}")
            return "\n".join(formatted)

        def store_info_tool(_: str) -> str:
            info = self._config.get("store_info.default_message")
            if info:
                return info
            return "営業時間やアクセスなどはスタッフにお尋ねください。"

        tools: List[Tool] = [
            Tool(
                name="menu_search",
                func=menu_search_tool,
                description=(
                    "NotionのメニューDBを検索して、ユーザーの質問に合うメニュー候補を返します。"
                ),
            ),
            Tool(
                name="menu_price_lookup",
                func=menu_price_tool,
                description="メニュー名から価格と簡単な特徴を取得します。",
            ),
            Tool(
                name="knowledge_base_lookup",
                func=rag_lookup_tool,
                description="ナレッジベースから参考情報を検索して要点をまとめます。",
            ),
            Tool(
                name="store_info_default",
                func=store_info_tool,
                description="営業時間・アクセスなどの店舗共通情報を返します。",
            ),
        ]

        logger.info(f"[Agent] ツールを登録しました: {[tool.name for tool in tools]}")
        return tools

    # LangChain 1.0では ConversationBufferMemory が廃止されたため、
    # これらのメソッドは使用しません（セッション履歴は _ai_engine で管理）
    
    # def _hydrate_memory_from_session(self, executor, session) -> None:
    #     # 廃止: メモリ機能が削除されました
    #     pass

    # def _append_to_memory(self, executor, role: str, content: str) -> None:
    #     # 廃止: メモリ機能が削除されました
    #     pass

    def _compose_message(
        self,
        user_message: str,
        rag_results: Optional[List[Dict[str, Any]]],
    ) -> str:
        if not rag_results:
            return user_message

        formatted = []
        for idx, doc in enumerate(rag_results[:3], 1):
            text = doc.get("text", "").strip()
            if not text:
                continue
            if len(text) > 200:
                text = text[:200] + "..."
            formatted.append(f"- {text}")

        if not formatted:
            return user_message

        context = "\n".join(formatted)
        return f"{user_message}\n\n[参考情報]\n{context}"


