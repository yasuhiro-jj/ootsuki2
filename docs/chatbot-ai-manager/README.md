# Chatbot x AI Manager

This directory defines the integration project between the Ootsuki chatbot and
the existing AI manager.

The goal is not to make the chatbot push products aggressively. The goal is to
let the AI manager provide sales policy, while the chatbot keeps a natural
customer-service conversation and uses that policy only when it fits the
conversation.

## Principle

- The chatbot answers the customer's question first.
- The AI manager decides priority products, reasons, and sales goals.
- The integration layer converts that policy into chatbot-safe suggestions.
- The chatbot suggests at most one item when the conversation allows it.
- Declined products are not suggested again in the same session.
- Suggestions and results are recorded for later improvement.

## Current Scope

This project now includes a passive integration scaffold and a manual sales
strategy management MVP. Customer-facing chatbot behavior is still not changed
by this directory alone.

## Customer Memory and QR Login MVP

The chatbot now has a pseudonymous customer memory entry point:

- `POST /customer-memory/identify`
- `POST /customer-memory/consent`
- frontend localStorage restore for `anonymous_customer_id`
- `/session` and `/chat` link that id through `customer_id`
- default profile storage at `outputs/customer_memory_profiles.json`

This does not collect real names, phone numbers, LINE ids, or full permanent
conversation transcripts. Customer memory is not used for automatic sales
recommendations.

If `consent_status` is `granted`, the chatbot can use bounded history only when
the customer explicitly asks about previous orders, previous recommendations,
usual items, or a different item from last time. FAQ, product existence,
reservation, order confirmation, and normal chat do not use customer memory.

See `docs/customer-memory-qr-login.md` for the current privacy boundary and
next-phase plan.

## Manual Strategy MVP

The first management MVP stores manually configured sales strategies through a
repository/service boundary. The current storage is JSON file backed and can be
replaced with a database later.

All sales strategy management API routes require an admin API key. Send it in
the `X-Admin-API-Key` header. The expected value is read from the server-side
`ADMIN_API_KEY` environment variable. If `ADMIN_API_KEY` is not configured, the
management API returns `503` instead of opening without authentication.

Do not expose this key through browser public environment variables such as
`NEXT_PUBLIC_ADMIN_API_KEY`. Use a server-side route, CLI, or trusted admin
script.

API routes:

- `POST /admin/ai-manager/sales-strategies`
- `GET /admin/ai-manager/sales-strategies`
- `GET /admin/ai-manager/sales-strategies/current`
- `GET /admin/ai-manager/sales-strategies/{strategy_id}`
- `PUT /admin/ai-manager/sales-strategies/{strategy_id}`
- `POST /admin/ai-manager/sales-strategies/{strategy_id}/activate`
- `POST /admin/ai-manager/sales-strategies/{strategy_id}/deactivate`
- `GET /admin/ai-manager/recommendation-settings`
- `PUT /admin/ai-manager/recommendation-settings`
- `POST /admin/ai-manager/recommendation-settings/reset`
- `GET /admin/ai-manager/sales-strategies/{strategy_id}/recommendation-settings`
- `PUT /admin/ai-manager/sales-strategies/{strategy_id}/recommendation-settings`
- `POST /admin/ai-manager/sales-strategies/{strategy_id}/recommendation-settings/reset`

Default storage:

- `outputs/ai_manager_sales_strategies.json`
- `outputs/ai_manager_recommendation_settings.json`

CLI helper:

```powershell
$env:OOTSUKI_API_URL="https://web-production-b22a1.up.railway.app"
$env:ADMIN_API_KEY="<admin-api-key>"
python scripts/manage_sales_strategy.py current
python scripts/manage_sales_strategy.py create --file .\strategy.json
python scripts/manage_sales_strategy.py deactivate production_smoke_test_001
```

Recommendation settings CLI:

```powershell
$env:OOTSUKI_API_URL="https://web-production-b22a1.up.railway.app"
$env:ADMIN_API_KEY="<admin-api-key>"
python scripts/manage_recommendation_settings.py show
python scripts/manage_recommendation_settings.py --strategy-id dinner_strategy update --file .\recommendation-settings.json
python scripts/manage_recommendation_settings.py --strategy-id dinner_strategy performance
python scripts/manage_recommendation_settings.py --strategy-id dinner_strategy reset
```

Recommendation settings let an admin adjust scoring weights manually while
reviewing `shown`, `converted`, `declined`, `cancelled`, `conversion_rate`, and
`sample_size`. The system does not automatically change weights from conversion
data.

Generate a local key with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Limited Chatbot Connection

Manual sales strategies are now connected only for explicit recommendation
requests. The chatbot checks the existing intent and conversation route first,
then calls the sales strategy connector only when the user is clearly asking
for a recommendation.

Blocked cases include product existence checks, FAQ, business hours,
reservation, order confirmation, natural chat, and order follow-ups. If the
strategy service fails, the chatbot falls back to the existing response path.

## Production Chat Smoke Test

Use `scripts/prod_chat_smoke.py` to verify the production chatbot with the core
customer conversations after each deploy. It creates a fresh chatbot session per
case and sends only normal customer chat messages.

Run all cases:

```powershell
$env:OOTSUKI_API_URL="https://web-production-b22a1.up.railway.app"
python scripts/prod_chat_smoke.py
```

Run one case:

```powershell
python scripts/prod_chat_smoke.py --case recommendation_repeat
```

Save a JSON report:

```powershell
python scripts/prod_chat_smoke.py --json-out outputs/prod_chat_smoke_latest.json
```

Covered cases:

- `recommendation_repeat`
- `beer_order_followup`
- `business_hours`
- `reservation_start`
- `parking`
- `snack_recommendation`

## Existing Project Boundary

The repository already contains `ai-maneger`. That directory is treated as the
existing AI manager application and is not renamed here. Chatbot-side integration
code lives under `core/integrations/chatbot_ai_manager`.
