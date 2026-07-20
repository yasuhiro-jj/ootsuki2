# Public Notion Direct Answer Phase 2

## Purpose

Use the reviewed `public_notion_knowledge/` snapshot for safe direct answers in
`/chat`, while preserving legacy fallback for every unsafe or uncertain case.

This phase does not call the Notion API during chat. It only reads the
app-bundled snapshot files:

- `public_notion_knowledge/menu.public.jsonl`
- `public_notion_knowledge/store_faq.public.jsonl`

## Direct Answer Scope

Allowed direct responses:

- product availability
- menu price
- business hours FAQ

Disallowed direct responses:

- orders and additional orders
- order changes
- cancellations
- reservations
- personal information collection
- customer memory
- strong recommendations
- unknown or ambiguous requests

## Feature Flags

Existing shadow candidate settings remain:

- `ENABLE_PUBLIC_NOTION_KNOWLEDGE_SHADOW=false`
- `PUBLIC_NOTION_KNOWLEDGE_DIR=public_notion_knowledge`
- `PUBLIC_NOTION_KNOWLEDGE_MIN_CONFIDENCE=0.75`

Direct response switching is controlled separately and defaults to disabled:

- `ENABLE_PUBLIC_NOTION_KNOWLEDGE_DIRECT_RESPONSES=false`
- `PUBLIC_NOTION_DIRECT_RESPONSE_MIN_CONFIDENCE=0.80`

The initial direct confidence threshold is `0.80`. Railway shadow logs showed
business-hours candidates at `0.80` and menu-price candidates at `0.84`; `0.80`
is the lowest observed confidence among the intentionally supported Phase 2
targets. Lower-confidence turns still fall back to the legacy router, and direct
answers also require a validated snapshot candidate plus ResponseGuard approval.

## Safety Flow

1. Planner classifies the turn.
2. Public Notion candidate builder checks the local snapshot.
3. Unsafe intents are rejected before response generation.
4. Direct response flag and confidence threshold are checked.
5. ResponseGuard rejects risky text such as order, reservation, phone-number, or
   personal-information language.
6. If every check passes, `/chat` returns the short public Notion response.
7. Otherwise `/chat` continues through the existing legacy router unchanged.

## Logging

For direct public Notion responses and fallback decisions, logs include:

- `response_source`: `public_notion` or legacy source
- planner intent and confidence
- candidate type and source
- fallback reason
- guard result
- actual returned response

Quality logs mask common PII/secrets through the existing
`ConversationQualityLogger`.

## Current Limitations

The response switch is disabled by default. This PR does not change Railway
environment variables and does not enable direct responses in production.
