# Public Notion Knowledge Snapshot Plan

## Purpose

Publish validated public Notion knowledge into the application repository as a
reviewable snapshot PR.

This makes Railway production able to read app-bundled public knowledge without
calling the Notion API during `/chat`.

## Current Inputs

The existing manual workflow already produces:

- `outputs/notion_sync/menu.public.jsonl`
- `outputs/notion_sync/store_faq.public.jsonl`
- `outputs/notion_sync/public_knowledge_report.json`
- `outputs/notion_sync/report.json`

Known current public counts:

- public menu: 47
- public store FAQ: 1 business-hours row

## Snapshot Location

Committed snapshots live under:

- `public_notion_knowledge/menu.public.jsonl`
- `public_notion_knowledge/store_faq.public.jsonl`
- `public_notion_knowledge/public_knowledge_report.json`
- `public_notion_knowledge/manifest.json`

`PublicNotionKnowledgeRepository` defaults to this directory. The
`PUBLIC_NOTION_KNOWLEDGE_DIR` environment variable can still override it.

## Manual Workflow

The workflow remains `workflow_dispatch` only.

To only validate and upload artifacts:

1. Run `Notion Knowledge Sync Validation`.
2. Set `target=all`.
3. Set `create_snapshot_pr=false`.

To prepare a snapshot PR:

1. Run `Notion Knowledge Sync Validation`.
2. Set `target=all`.
3. Set `create_snapshot_pr=true`.
4. Review the generated PR before merging.

Snapshot PR creation refuses partial targets. `target=menu` and `target=store`
can still validate artifacts, but cannot update app-bundled snapshots.

## Safety Rules

- The workflow reads Notion only through the existing read-only sync command.
- The workflow never updates Notion.
- Validation errors stop snapshot generation.
- Snapshot changes are pushed to a dedicated generated branch.
- The workflow creates a PR and never merges it.
- `/chat` response switching is not part of this phase.
- `ENABLE_PUBLIC_NOTION_KNOWLEDGE_SHADOW` remains false by default.

## Review Data

The generated PR body and `manifest.json` show:

- updated files
- public menu count
- public store FAQ count
- excluded reasons
- warnings

## Runtime Behavior

When the shadow feature flag is disabled, runtime behavior is unchanged.

When it is later enabled, the app reads the committed snapshot from
`public_notion_knowledge/` unless `PUBLIC_NOTION_KNOWLEDGE_DIR` points
elsewhere. Missing files safely behave as empty public knowledge.
