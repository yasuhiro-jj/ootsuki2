# Public Notion Knowledge Chat Shadow Plan

## Purpose

Connect GitHub Actions-validated public Notion knowledge to the chatbot as safe
shadow response candidates without replacing the existing `/chat` response.

Current validated public knowledge:

- public menu: 47 rows
- public store FAQ: 1 row for business hours

## Scope

This phase only reads local validated artifacts produced by Notion Knowledge
Sync Validation:

- `outputs/notion_sync/menu.public.jsonl`
- `outputs/notion_sync/store_faq.public.jsonl`

It does not call the Notion API during chat responses and it does not modify
Notion data.

## Candidate Targets

Only these candidate types are in scope:

- product availability
- menu price
- business hours FAQ

These remain out of scope and must fall back to the existing router:

- order placement
- additional order handling
- order changes
- cancellation
- reservation flows
- personal information collection
- customer-memory based suggestions
- recommendations

## Safety Design

The new component runs in shadow mode:

1. `/chat` keeps calling `AutonomousConversationOrchestrator.inspect()`.
2. If the feature flag is enabled, the orchestrator checks the local public
   knowledge artifact and builds a candidate only for the safe target intents.
3. The candidate is logged and attached to the decision metadata.
4. The decision still returns `handled=False` and `fallback_to_legacy=True`.
5. Existing response generation continues unchanged.

If any of these conditions fail, the candidate is rejected:

- feature flag is false
- local public knowledge files are missing
- planner confidence is below the guard threshold
- intent is not product existence or store FAQ
- the message looks like order/reservation/cancel/personal-info/customer-memory
- no matching public menu or business-hours FAQ exists
- an exception occurs

## Feature Flags

Default is disabled.

- `ENABLE_PUBLIC_NOTION_KNOWLEDGE_SHADOW=false`
- `PUBLIC_NOTION_KNOWLEDGE_DIR=outputs/notion_sync`
- `PUBLIC_NOTION_KNOWLEDGE_MIN_CONFIDENCE=0.75`

## Implementation Plan

1. Add a public knowledge repository that reads validated JSONL files from disk.
2. Add a candidate builder for product availability, price, and business hours.
3. Add a guard layer so unsafe intents always reject candidates.
4. Wire the candidate builder into `AutonomousConversationOrchestrator` in
   shadow mode only.
5. Log candidate status from `/chat` without changing the returned response.
6. Add unit tests for matching, missing artifacts, low confidence, unsafe
   intents, and exception fallback.
7. Update docs and `.env.example`.

## GitHub Actions

No new Notion calls are added to chat. GitHub Actions remains the place to
validate Notion data and publish the artifact contents for inspection. Runtime
environments can copy the validated `menu.public.jsonl` and
`store_faq.public.jsonl` files into `PUBLIC_NOTION_KNOWLEDGE_DIR` later.

## Completion Criteria

- feature flag defaults to false
- existing `/chat` responses remain unchanged
- no chat-time Notion API calls are introduced
- safe candidates can be generated from local public JSONL files
- unsafe intents always reject candidates and fall back to legacy
- tests pass
- PR is created from a feature branch
