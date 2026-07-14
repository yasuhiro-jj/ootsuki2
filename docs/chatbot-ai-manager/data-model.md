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
- `last_recommended_items`
- `recommendation_history`
- `customer_memory_declined_products`
- `order_cancelled_items`
- `order_counts_by_product`
- `customer_memory_available`
- `customer_memory_consent_status`
- `different_from_previous_requested`
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
- `last_recommended_items`
- `recommendation_history`
- `declined_products`
- `visit_count`
- `last_visit_at`
- `last_ordered_at`
- `last_recommended_at`
- `memory_updated_at`
- `communication_notes`

`consent_status` values:

- `unknown`
- `granted`
- `denied`

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
- `final_score`
- `memory_adjustments`
- `used_customer_memory`

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

## RecommendationSettings

Manual scoring controls for explicit recommendation selection.

- `strategy_id`
- `strategy_priority`
- `product_priorities`
- `weights.topic_relevance`
- `weights.repeat_order_affinity`
- `weights.repeat_count_unit`
- `weights.repeat_count_max`
- `weights.different_from_previous`
- `weights.recently_recommended_penalty`
- `weights.recommendation_history_penalty`
- `rules.exclude_declined_products`
- `rules.exclude_already_suggested_in_session`
- `updated_at`
- `updated_by`

Settings are advisory scoring controls. Safety exclusions for declined products
and same-session repeat suggestions remain required.

## RecommendationSettingsAuditEntry

Minimal audit trail for manual scoring changes.

- `strategy_id`
- `before`
- `after`
- `updated_at`
- `updated_by`

## Customer Session Links

Session links connect a browser/chat session to a pseudonymous customer profile.

- `session_id`
- `anonymous_customer_id`
- `created_at`
- `updated_at`
- `last_seen_at`

One `session_id` is kept with its first valid `anonymous_customer_id`. The same
customer may have multiple sessions.

## Customer Memory Events

Customer memory events update bounded summaries without storing full
conversation text.

- `order_confirmed`
- `recommendation_shown`
- `recommendation_declined`
- `order_cancelled`

`order_cancelled` is not copied into `avoided_items`; it only records that a
pending order was cancelled.

## CustomerMemoryContext

Runtime-safe view used for explicit past-reference replies.

- `anonymous_customer_id`
- `consent_status`
- `recent_ordered_items`
- `recent_recommended_items`
- `declined_product_ids`
- `declined_product_names`
- `order_cancelled_product_ids`
- `order_cancelled_product_names`
- `order_counts`
- `visit_count`
- `memory_available`

This context is used only for explicit memory intents such as
`previous_order_query`, `previous_recommendation_query`, `usual_item_query`, and
`different_from_previous_request`.

For explicit recommendation requests, the same context can provide bounded
ranking signals to `ConversationSalesContext` when consent is granted. The
runtime passes only summary fields, not full conversation text.
## Recommendation Performance Events

The recommendation feedback MVP stores structured events only. It does not store
full conversation text, names, phone numbers, addresses, or admin API keys.

Event types:

- `recommendation_shown`
- `recommendation_accepted`
- `recommendation_converted`
- `recommendation_declined`
- `recommendation_expired`
- `order_confirmed`
- `order_cancelled`

`recommendation_converted` is created when an `order_confirmed` event matches a
previous `recommendation_shown` event in the same `session_id`, for the same
`product_id` or product name, within `RECOMMENDATION_CONVERSION_WINDOW_SECONDS`.

Conversion metadata:

- `source_recommendation_event_id`
- `order_event_id`
- `conversion_type`
- `conversion_delay_seconds`
- `used_customer_memory`
- `recommendation_source`

Duplicate conversion records are prevented per source recommendation event.

Product names in recommendation events are treated as UTF-8 Python `str` values.
New events normalize `product_name` before storage, and the admin performance
API normalizes legacy mojibake names at display time where possible. Aggregation
identity remains based on `product_id` first; display names are not used as a
replacement for stable product identifiers.
