# Data Model

## SalesStrategy

Represents sales policy from the AI manager.

- `strategy_id`
- `name`
- `priority_products`
- `sales_goal`
- `active`
- `valid_from`
- `valid_until`
- `max_suggestions_per_session`
- `allowed_topics`
- `blocked_intents`
- `generated_by`
- `created_at`
- `updated_at`

## PriorityProduct

Represents one product that the AI manager wants to prioritize.

- `product_id`
- `name`
- `priority_score`
- `reason`
- `suggest_when`
- `trigger_item_ids`
- `excluded_intents`
- `max_suggestions`
- `inventory_priority`
- `gross_margin_rank`

## Manual Storage

The MVP stores strategies in `outputs/ai_manager_sales_strategies.json`.
Repository methods return `SalesStrategy` objects so the storage can later move
to SQLite, Postgres, Supabase, or another backend without changing chatbot
business rules.

## ConversationSalesContext

Chatbot-side state used to decide whether a sales suggestion is natural.

- `session_id`
- `conversation_id`
- `customer_profile_id`
- `message`
- `detected_intent`
- `active_topic`
- `current_entity`
- `pending_flow`
- `order_intent_level`
- `last_assistant_action`
- `suggestion_count`
- `proposed_items`
- `declined_products`
- `ordered_items`
- `preference_tags`
- `favorite_items`
- `avoided_items`
- `last_ordered_items`
- `recommendation_requested`
- `list_requested`
- `question_only`
- `time_slot`

## CustomerMemoryProfile

Pseudonymous customer memory connected through QR login. This is not intended
to store direct personal information.

- `customer_profile_id`
- `anonymous_customer_id`
- `consent_status`
- `preference_tags`
- `favorite_items`
- `avoided_items`
- `last_ordered_items`
- `declined_products`
- `visit_count`
- `last_visit_at`
- `communication_notes`

Examples:

- Likes sashimi and local sake.
- Often orders medium draft beer first.
- Declined dessert recommendation last time.
- Prefers short replies.
- Avoid recommending spicy dishes.

## SuggestionDecision

Result returned to the chatbot.

- `allowed`
- `product`
- `reason`
- `rule`
- `strategy_id`

## SuggestionEvent

Analytics event sent back toward the AI manager.

- `event_id`
- `session_id`
- `conversation_id`
- `strategy_id`
- `product_id`
- `result`
- `occurred_at`
- `metadata`

## Customer Memory Events

Future event types should update customer memory without storing unnecessary
identity data.

- `ordered_item`
- `declined_suggestion`
- `accepted_suggestion`
- `preference_observed`
- `avoidance_observed`
- `visit_detected`
