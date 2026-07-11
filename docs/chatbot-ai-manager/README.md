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

## Manual Strategy MVP

The first management MVP stores manually configured sales strategies through a
repository/service boundary. The current storage is JSON file backed and can be
replaced with a database later.

API routes:

- `POST /admin/ai-manager/sales-strategies`
- `GET /admin/ai-manager/sales-strategies`
- `GET /admin/ai-manager/sales-strategies/current`
- `GET /admin/ai-manager/sales-strategies/{strategy_id}`
- `PUT /admin/ai-manager/sales-strategies/{strategy_id}`
- `POST /admin/ai-manager/sales-strategies/{strategy_id}/activate`
- `POST /admin/ai-manager/sales-strategies/{strategy_id}/deactivate`

Default storage:

- `outputs/ai_manager_sales_strategies.json`

## Limited Chatbot Connection

Manual sales strategies are now connected only for explicit recommendation
requests. The chatbot checks the existing intent and conversation route first,
then calls the sales strategy connector only when the user is clearly asking
for a recommendation.

Blocked cases include product existence checks, FAQ, business hours,
reservation, order confirmation, natural chat, and order follow-ups. If the
strategy service fails, the chatbot falls back to the existing response path.

## Existing Project Boundary

The repository already contains `ai-maneger`. That directory is treated as the
existing AI manager application and is not renamed here. Chatbot-side integration
code lives under `core/integrations/chatbot_ai_manager`.
