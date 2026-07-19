# Notion Knowledge Sync Plan

## Purpose

Use the existing Ootsuki Notion menu and store-information databases as the
source of truth, then read, normalize, and validate their contents without
changing Notion data.

Phase 6-A covers only:

- Menu DB: `おおつきチャットボット (1)`
- Store FAQ DB: `おおつき店舗情報DB`

It does not ingest conversation-flow tests, recommendations, or conversation
history yet.

## Read-Only Command

Default behavior is dry-run. The command never writes to Notion.

```bash
python scripts/sync_notion_knowledge.py --target all --dry-run --output-dir outputs/notion_sync
```

Targeted runs:

```bash
python scripts/sync_notion_knowledge.py --target menu --dry-run
python scripts/sync_notion_knowledge.py --target store --dry-run
```

Validate a generated report:

```bash
python scripts/validate_notion_knowledge.py --report outputs/notion_sync/report.json --strict-schema
```

## Output Files

The sync writes local files only:

- `outputs/notion_sync/menu.normalized.jsonl`
- `outputs/notion_sync/store_faq.normalized.jsonl`
- `outputs/notion_sync/report.json`

`report.json` contains:

- target
- menu/store DB IDs
- normalized row counts
- output paths
- validation issues
- error and warning counts

## Required Environment Variables / Secrets

Local and GitHub Actions read secrets from environment variables only.

- `NOTION_API_KEY`
- `NOTION_CHATBOT_MENU_DB_ID`
- `NOTION_CHATBOT_STORE_KNOWLEDGE_DB_ID`

Fallback names are also supported locally:

- `NOTION_API_TOKEN`
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID_MENU`
- `NOTION_DATABASE_ID_STORE`

Do not commit actual token values.

## Normalized Menu Fields

| Normalized field | Existing Notion property |
| --- | --- |
| `name` | `名前` |
| `price` | `販売単価` |
| `description` | `商品説明` |
| `category` | `カテゴリー` |
| `subcategory` | `サブカテゴリー` |
| `tags` | `タグ` |
| `requires_reservation` | `事前予約` |
| `serving_size` | `対応人数` |
| `image_url` | `画像　URL` |

Validation detects:

- missing product name
- missing price
- abnormal price
- duplicate product name
- uncategorized menu item

## Normalized Store FAQ Fields

| Normalized field | Existing Notion property |
| --- | --- |
| `key` | `項目名` |
| `answer` | `内容` |
| `category` | `カテゴリ` |
| `payment_methods` | `決済` |
| `parking` | `parking` |
| `takeout` | `テイクアウト対応` |
| `seats` | `席数` |
| `valid_from` | `有効期間開始` |
| `valid_until` | `有効期間終了` |
| `priority` | `表示優先度` |
| `address` | `address` |
| `phone` | `phone` |
| `website` | `website` |
| `google_map` | `google_map` |
| `holidays` | `holidays` |
| `access` | `access` |
| `features` | `features` |
| `reservation_method` | `reservation_method` |
| `notes` | `備考` |

Validation detects:

- missing FAQ key
- missing answer material
- duplicate FAQ key
- uncategorized FAQ row

## GitHub Actions

Workflow:

- `.github/workflows/notion-knowledge-sync.yml`

Trigger:

- `workflow_dispatch` only

The workflow:

1. Installs Python dependencies.
2. Runs `scripts/sync_notion_knowledge.py` in dry-run mode.
3. Runs `scripts/validate_notion_knowledge.py`.
4. Uploads `outputs/notion_sync/` as an artifact.

It does not deploy and does not write to Notion.

## Phase 6-B Minimum Notion Columns

The existing menu and store DBs can be read as-is. For better production
quality in Phase 6-B, add only these minimum columns:

- Menu DB: `公開状態` or `表示ON/OFF`
- Menu DB: `提供可否` or `在庫あり`
- Menu DB: `別名/検索語`
- Store FAQ DB: `回答可否` or `公開可`
- Store FAQ DB: `FAQカテゴリ`
- Store FAQ DB: `検索語/同義語`

Do not add columns as part of Phase 6-A.
