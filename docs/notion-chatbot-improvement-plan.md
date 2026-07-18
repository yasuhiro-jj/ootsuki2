# Notion Chatbot Improvement Plan

Created: 2026-07-18

## Purpose

Shift the Ootsuki chatbot from a growing set of hard-coded keyword branches into an autonomous conversation orchestrator powered by OpenAI + LangChain/LangGraph.

Notion should be the source of truth for correct store knowledge, menu data, good conversation examples, and improvement tasks. Conversation examples should not become one-off code branches. They should be used as evaluation data, prompt guidance, and regression tests.

This document covers investigation and implementation planning only. It does not perform production deployment, database deletion, direct push to `main`, or destructive data changes.

## Investigation Summary

Reviewed areas:

- Repository docs: `README.md`, `docs/`, `AGENTS.md`, `CLAUDE.md`
- Python/FastAPI chatbot: `core/api.py`, `core/conversation_router.py`, `core/response_compactness.py`, `core/menu_existence.py`, `core/menu_service.py`, `core/notion_client.py`, `core/notion_knowledge_service.py`, `core/ai_engine.py`, `core/customer_memory.py`
- Graph/flow code: `core/notion_engine.py`, `core/notion_graph_engine.py`, `core/simple_graph_engine.py`
- Next.js Notion agent path: `frontend/app/api/agent-chat/route.ts`, `frontend/lib/conversation/*`, `frontend/lib/notion-agent/*`, `frontend/lib/menu/*`
- AI manager bridge: `core/integrations/chatbot_ai_manager/*`, `docs/chatbot-ai-manager/*`
- Notion scripts: `scripts/import_menu_csv_to_notion.py`, `scripts/sync_menu_db_from_sales_notion.py`
- Tests: `tests/test_conversation_router.py`, `tests/test_response_compactness.py`, `tests/test_menu_existence.py`, `tests/test_notion_knowledge_service.py`, `tests/test_customer_memory.py`, `tests/test_customer_memory_followups.py`, `tests/test_chatbot_ai_manager_integration.py`

## Current Implementation

### Python `/chat` Main Path

- `core/api.py` owns `/chat`, WebSocket chat, `/rebuild-rag`, customer memory APIs, and AI manager admin APIs.
- Startup calls `load_knowledge_base()`, which reads all configured Notion DBs from `config/ootuki_restaurant.yaml` plus local Markdown knowledge under `apps/ootuki_restaurant/knowledge/**/*.md`, then builds `ChromaClient`.
- `/rebuild-rag` uses the same loader.
- Per-turn live Notion lookup is limited by `NotionKnowledgeContextService.build_context()`, which only builds compact store/menu context when the conversation route is `store`.
- If Notion is disconnected, `NotionClient` returns empty data and the existing bot can still continue with local/RAG/fallback behavior.

### Existing Routing And State

- `core/conversation_router.py`
  - Classifies turns as `store`, `natural`, `latest`, or `empty`.
  - Uses `active_topic`, `pending_flow`, recent messages, and lightweight slot extraction.
  - Tracks reservation slots in `reservation_slots`.
- `core/response_compactness.py`
  - Handles compact responses for reservation, short order confirmation, contextual price lookup, cancellation, store FAQ, and similar cases.
  - Already covers representative behavior such as:
    - `生ビールある？` via menu existence lookup.
    - `じゃあ一つ`, `同じの`, `もう一つ` via recent item context.
    - `やっぱりやめる` via pending flow/recent item cancellation.
    - `20人なんだけど`, `明日の夜` via reservation context and slot accumulation.
- `core/customer_memory.py`
  - Stores pseudonymous customer memory and events in JSON/JSONL.
  - Separates confirmed orders, recommendations, declines, cancellations, consent status, and session links.
- `core/integrations/chatbot_ai_manager/*`
  - Adds sales strategy recommendations while blocking suggestions in sensitive/irrelevant contexts such as reservation, FAQ, order confirmation, and product existence checks.

### Next.js Notion Agent Path

- `frontend/app/api/agent-chat/route.ts` is a separate Notion Agent style chatbot path.
- It currently has routes that can query Notion per response.
- It should not become the production source of truth until it is unified with the Python main path or explicitly chosen as the new main path.

## Target Architecture

The goal is a conversation brain, not a conversation pattern collection.

### Responsibilities

- Remember prior conversation context.
- Decide the current topic and user intent from context, not only keywords.
- Search Notion/menu/customer memory only when needed.
- Collect missing information for orders, reservations, and banquet consultation.
- Avoid inventing facts not present in store/menu knowledge.
- Return short, natural Japanese appropriate for a restaurant.
- Keep existing order, reservation, FAQ, customer memory, and AI manager behavior working.

### LangGraph Flow

```text
input
  -> load_state
  -> plan_next_action
  -> select_tools
  -> run_tools
  -> compose_reply
  -> reduce_state
  -> log_turn
  -> response
```

### Proposed Components

- `core/conversation_state.py`
  - Unified state model for active topic, pending flow, mentioned products, order candidates, confirmed orders, reservation slots, customer id, and consent status.
- `core/conversation_planner.py`
  - Uses OpenAI structured output to return intent, topic, missing slots, tool needs, confidence, and next action.
- `core/conversation_tools.py`
  - Wraps menu DB lookup, store knowledge lookup, customer memory, existing FAQ helpers, and AI manager bridge as tools.
- `core/conversation_orchestrator.py`
  - LangGraph entry point that coordinates state, planning, tools, response generation, state reduction, and legacy fallback.
- `core/notion_sync_service.py`
  - Reads Notion store/menu/evaluation/improvement DBs and writes local synchronized JSON/search documents.
- `core/notion_synced_repository.py`
  - Reads synchronized data without requiring live Notion calls at response time.

## First Implementation Stage

Do not attempt the whole large issue at once. Stage 1 should be the smallest safe implementation that moves the architecture in the right direction.

Stage 1 scope:

- Add unified conversation state.
- Add intent/topic/tool-selection planner.
- Add a LangGraph orchestrator skeleton.
- Keep the existing `/chat` branches as a fallback and safety net.
- Use existing menu, FAQ, reservation, customer memory, and AI manager services through wrappers.
- Add regression tests for ambiguous multi-turn conversations.
- Document architecture and Notion reference method.

Representative tests:

- `生ビールある？` -> `じゃあ2つ`
- `それと刺身` -> `やっぱりビールは一つで`
- `明日の夜、20人なんだけど`
- `個室ある？` -> `じゃあ宴会コースで`
- `子ども連れでも大丈夫？` -> `駐車場は？`
- `昨日の続きなんだけど`
- `予約じゃなくて質問です`

## Notion DB Design

### Store Knowledge DB

Purpose: business hours, holidays, reservation method, seating, parking, access, payment, child policy, and other store facts.

Suggested properties:

- `Title`: title
- `Category`: select
- `Answer`: rich_text
- `Keywords`: multi_select or rich_text
- `Priority`: number
- `Published`: checkbox
- `UpdatedAt`: last_edited_time

### Menu DB

Purpose: product existence, price, aliases, availability, description, recommendation reason, and image.

Suggested properties:

- `Name`: title
- `ShortName`: rich_text
- `Aliases`: multi_select or rich_text
- `Category`: select
- `Subcategory`: select
- `Price`: number
- `Available`: checkbox
- `Visible`: checkbox
- `StockStatus`: select (`available`, `limited`, `sold_out`, `unknown`)
- `Description`: rich_text
- `OneLiner`: rich_text
- `RecommendationReason`: rich_text
- `Image URL`: url
- `Priority`: number
- `UpdatedAt`: last_edited_time

### Conversation Evaluation DB

Purpose: good examples, failed conversations, expected intent/tool/state behavior, and regression cases. This is not a branching-rule DB.

Suggested properties:

- `CaseId`: title
- `Enabled`: checkbox
- `Scenario`: select
- `ConversationTurns`: rich_text
- `ExpectedIntent`: select
- `ExpectedToolUse`: multi_select
- `ExpectedStateDelta`: rich_text JSON
- `ExpectedReplyPolicy`: rich_text
- `ExpectedReplyContains`: rich_text
- `MustNotSay`: rich_text
- `Priority`: number
- `UpdatedAt`: last_edited_time

### Improvement Tasks DB

Purpose: manage chatbot/store/menu/conversation improvement work in Notion.

Suggested properties:

- `Task`: title
- `Status`: status (`Backlog`, `Ready`, `In Progress`, `Review`, `Done`, `Blocked`)
- `Area`: select (`store_knowledge`, `menu`, `conversation_orchestrator`, `tests`, `ai_manager`, `customer_memory`)
- `Priority`: select (`P0`, `P1`, `P2`, `P3`)
- `Source`: select (`owner_request`, `conversation_log`, `test_failure`, `manual_review`)
- `UserUtterance`: rich_text
- `ExpectedBehavior`: rich_text
- `AcceptanceCriteria`: rich_text
- `ImplementationNotes`: rich_text
- `SafeToAutomate`: checkbox
- `LastSyncedAt`: date

## Notion Sync Strategy

Principles:

- Do not call Notion API on every chatbot response.
- Sync Notion data into local app data/search documents.
- If Notion is disconnected, use the last synchronized data or existing fallback behavior.
- Never commit secrets.
- `.env.example` should contain variable names only.

Proposed sync interfaces:

- CLI: `python scripts/sync_notion_chatbot_data.py --target all`
  - Default dry-run.
  - `--apply` writes local sync files only.
- Admin API: `POST /admin/notion/sync`
  - Requires `ADMIN_API_KEY`.
  - Reads Notion and refreshes local sync files.
  - Does not write to Notion.

Local outputs:

- `data/notion_sync/store_knowledge.json`
- `data/notion_sync/menu.json`
- `data/notion_sync/conversation_eval_cases.json`
- `data/notion_sync/improvement_tasks.json`
- `data/notion_sync/rag_documents.json`
- `outputs/notion_sync_report.json`

## Environment Variables To Add To `.env.example`

Add names only, with empty values:

```env
NOTION_API_KEY=
NOTION_API_TOKEN=
NOTION_DATABASE_ID_MENU=
NOTION_DATABASE_ID_STORE=
NOTION_DATABASE_ID_CONVERSATION=
NOTION_DATABASE_ID_UNKNOWN_KEYWORDS=
NOTION_CHATBOT_STORE_KNOWLEDGE_DB_ID=
NOTION_CHATBOT_MENU_DB_ID=
NOTION_CHATBOT_CONVERSATION_EVAL_DB_ID=
NOTION_CHATBOT_IMPROVEMENT_TASKS_DB_ID=
NOTION_SYNC_CACHE_DIR=
NOTION_SYNC_REPORT_PATH=
CUSTOMER_MEMORY_PROFILE_PATH=
CUSTOMER_MEMORY_SESSION_LINKS_PATH=
CUSTOMER_MEMORY_EVENTS_PATH=
OPENAI_API_KEY=
CHROMA_PERSIST_DIR=
REQUIRE_CHROMA=
```

Keep compatibility with existing names first. New `NOTION_CHATBOT_*` names should be optional aliases or explicit overrides.

## Planned File Changes For Implementation Stage

- `.env.example`: add variable names only.
- `config/ootuki_restaurant.yaml`: add sync/orchestrator config keys.
- `core/conversation_state.py`: new unified state model.
- `core/conversation_planner.py`: new OpenAI structured planner.
- `core/conversation_tools.py`: new tool wrapper layer.
- `core/conversation_orchestrator.py`: new LangGraph orchestration layer.
- `core/notion_sync_service.py`: new Notion read/sync service.
- `core/notion_synced_repository.py`: new local synced data repository.
- `scripts/sync_notion_chatbot_data.py`: new local sync CLI.
- `core/api.py`: call orchestrator with legacy fallback; add admin sync endpoint; prefer synced RAG docs.
- `core/notion_knowledge_service.py`: prefer synced store/menu data over live Notion lookup.
- Existing router/compactness modules: keep as fallback/safety net in Stage 1.
- Tests:
  - `tests/test_conversation_state.py`
  - `tests/test_conversation_orchestrator.py`
  - `tests/test_notion_sync_service.py`
  - `tests/test_notion_synced_repository.py`
  - update existing conversation/menu/customer-memory/AI-manager regression tests.

## GitHub Issue Guidance

The GitHub Issue should describe the AI capability to build, not a list of individual conversation branches.

Recommended title:

```md
OpenAI + LangGraphによる自律会話オーケストレーターを実装する
```

Additional instruction for Codex implementation:

```text
Issueの目的を実現するため、まず現行コードを調査し、
LangGraphの会話オーケストレーター導入計画を作成してください。

既存機能を壊さない最小構成で、
第1段階として「会話状態の統一」と「意図判断必要な情報源を選ぶ処理」まで実装してください。

実装、回帰テスト、コミット、push、PR作成まで行ってください。
残りの機能は、次のIssueとして分割提案してください。
```

## Safety Policy

- Do not convert all conversation examples into hard-coded branches.
- Keep the existing deterministic rules as fallback until the orchestrator is proven by tests.
- Notion is the source of truth for facts, but response-time live Notion dependency should be avoided.
- Unknown facts must not be invented.
- Do not commit `.env`, `.env.local`, API keys, Notion tokens, or customer-sensitive data.
- Do not delete DBs, archive Notion pages, operate Railway Volume, deploy production, force push, or push directly to `main`.

## Follow-Up Issue Split

After Stage 1, split remaining work into smaller issues:

- Stage 2: Notion sync service and synced repository.
- Stage 3: Notion conversation evaluation cases -> automated regression tests.
- Stage 4: Replace selected legacy branches with orchestrator decisions where tests prove parity.
- Stage 5: Conversation failure extraction from quality logs into improvement task candidates.
- Stage 6: Optional admin UI/AI manager integration for reviewing conversation improvements.

## Phase 1 Implementation Result

Implemented on branch `feature/autonomous-conversation-phase1`.

Added:

- `core/conversation_state.py`
  - Normalizes existing session memory into a single `ConversationState`.
  - Tracks active topic, pending flow, current product, order candidate, confirmed orders, reservation slots, customer id, and consent status.
  - Preserves legacy memory keys such as `active_topic`, `pending_flow`, `current_entity`, `recently_confirmed_item`, and `reservation_slots`.
- `core/conversation_planner.py`
  - Adds a deterministic Stage 1 planner for product existence, order, order change, cancel, reservation, store FAQ, recommendation, customer-memory reference, smalltalk, and unknown.
  - Returns required information sources without requiring a new realtime Notion call.
- `core/conversation_tools.py`
  - Maps planner output to existing information sources: menu price, store knowledge, customer memory, existing reservation handling, and legacy router.
- `core/conversation_orchestrator.py`
  - Adds the conservative orchestration entry point.
  - Converts planner exceptions into `fallback_to_legacy=True` decisions.
  - Does not take over response generation in Phase 1.
- `core/api.py`
  - Calls the orchestrator from `/chat` after session memory and recent history are loaded.
  - Logs intent/topic/tool selection, then always continues into the existing conversation router and response pipeline.
- `.env.example`
  - Adds required variable names only, with empty values.
- `config/ootuki_restaurant.yaml`
  - Adds optional Notion chatbot sync config and `enable_autonomous_conversation_orchestrator`.
- Tests:
  - `tests/test_conversation_state.py`
  - `tests/test_conversation_orchestrator.py`

Important Phase 1 boundary:

- The new orchestrator is a decision layer, not the final responder.
- Existing deterministic safeguards remain the source of actual behavior for product existence, order follow-up, cancellation, reservation, FAQ, customer memory, AI manager, RAG, and Notion context.
- The fallback guarantee is explicit: if planning fails or a turn is unsupported, the legacy router still handles the request.
