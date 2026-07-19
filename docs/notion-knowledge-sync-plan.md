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

## Phase 6-B Public Knowledge Filter

Issue #8 adds a read-only public knowledge filter on top of the Phase 6-A
normalization output. The sync still writes all fetched rows to normalized
local files, and it does not modify Notion.

Additional output files:

- `outputs/notion_sync/menu.public.jsonl`
- `outputs/notion_sync/store_faq.public.jsonl`
- `outputs/notion_sync/public_knowledge_report.json`

`report.json` also includes:

- `public_menu_count`
- `public_store_faq_count`
- `public_knowledge.menu.included_count`
- `public_knowledge.menu.excluded_count`
- `public_knowledge.menu.excluded_reasons`
- `public_knowledge.menu.warnings`
- `public_knowledge.store_faq.included_count`
- `public_knowledge.store_faq.excluded_count`
- `public_knowledge.store_faq.excluded_reasons`
- `public_knowledge.store_faq.warnings`

### Public Menu Conditions

Only menu rows satisfying all conditions are written to `menu.public.jsonl`:

- `AI公開 == true`
- `提供状態` is `提供中` or `季節限定`
- product name is not empty, `コピー`, `ー`, or another placeholder
- price exists and is not abnormal

Rows outside those conditions are not deleted. They remain in
`menu.normalized.jsonl` and are counted with exclusion reason codes:

- `not_ai_public`
- `not_available_for_public_ai`
- `placeholder_name`
- `missing_price`
- `abnormal_price`

Duplicate names inside the public menu set are kept and reported as
`menu.public_duplicate_name` warnings.

`別名検索語` is normalized into the `aliases` list. Commas, Japanese commas,
newlines, semicolons, and slashes can be used as separators.

### Public Store FAQ Conditions

Only store FAQ rows satisfying all conditions are written to
`store_faq.public.jsonl`:

- `回答可否 == true`
- `FAQカテゴリ` is present
- the row has answer material
- `valid_until` / `有効終了日` is not expired

Rows outside those conditions are not deleted. They remain in
`store_faq.normalized.jsonl` and are counted with exclusion reason codes:

- `not_answer_allowed`
- `missing_faq_category`
- `missing_answer_material`
- `expired_valid_until`

Duplicate public FAQ keys inside the same category are kept and reported as
`store.public_duplicate_faq` warnings.

### GitHub Actions Check

Run the `Notion Knowledge Sync Validation` workflow manually with `target=all`.
After it finishes, download the `notion-sync-report` artifact and inspect:

- `report.json` for total counts, public counts, and validation issues
- `public_knowledge_report.json` for included/excluded counts, exclusion
  reasons, and duplicate warnings
- `menu.public.jsonl` for future direct-answer menu candidates
- `store_faq.public.jsonl` for future direct-answer FAQ candidates

The workflow remains dry-run only. It does not deploy and does not write to
Notion.

### Safe Menu Selection Procedure

For the current 983 menu rows:

1. Keep every row and do not delete duplicates, `コピー`, `ー`, or old drafts.
2. Leave `AI公開` off by default.
3. Set `提供状態` for confirmed current items only.
4. Turn `AI公開` on only for items AI may directly answer from.
5. Add common search terms to `別名検索語` when helpful.
6. Run the GitHub Actions dry-run and confirm the public menu count, exclusion
   reasons, and public duplicate warnings before using the public JSONL files.

If the new Notion properties are missing, the sync safely falls back to zero
public direct-answer rows by treating `AI公開` and `回答可否` as false.
