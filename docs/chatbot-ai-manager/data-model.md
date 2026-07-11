# Data Model

## SalesStrategy

Represents sales policy from the AI manager.

- `strategy_id`
- `priority_products`
- `sales_goal`
- `active`
- `max_suggestions_per_session`
- `allowed_topics`
- `blocked_intents`
- `generated_by`

## PriorityProduct

Represents one product that the AI manager wants to prioritize.

- `product_id`
- `name`
- `priority_score`
- `reason`
- `suggest_when`
- `max_suggestions`
- `inventory_priority`
- `gross_margin_rank`

## ConversationSalesContext

Chatbot-side state used to decide whether a sales suggestion is natural.

- `session_id`
- `conversation_id`
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
- `recommendation_requested`
- `list_requested`
- `question_only`
- `time_slot`

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

