# Architecture

## Data Flow

```text
Menu / sales / inventory data
  -> AI manager
  -> SalesStrategy
  -> Chatbot AI manager bridge
  -> QR-linked customer memory, when consented
  -> Chatbot conversation state
  -> Natural suggestion when allowed
  -> SuggestionEvent
  -> AI manager analytics
```

## Manual Strategy Management Flow

```text
Trusted admin client
  -> X-Admin-API-Key
  -> Admin API
  -> SalesStrategyManagementService
  -> SalesStrategyRepository
  -> JSON storage for MVP
```

The manual strategy management layer is intentionally separate from the
customer-facing chatbot runtime. The chatbot does not call this strategy service
until a later limited-connection phase.

The management API is protected by `ADMIN_API_KEY`. Missing or incorrect keys
return `401`. Missing server configuration returns `503`. The customer-facing
`/chat` and `/health` routes do not require this key.

## Explicit Recommendation Connection Flow

```text
Existing intent router
  -> IntentType.PROPOSAL only
  -> Existing direct answer guards
  -> ExplicitSalesRecommendationConnector
  -> Current SalesStrategy
  -> Consented CustomerMemoryContext, when available
  -> ChatbotAIManagerBridge.decide_suggestion
  -> One customer-facing recommendation or existing fallback
```

The connector is used only after product existence checks and order-confirmation
guards have already had a chance to respond. It records `suggestion_shown` and
`suggestion_skipped` events in the bridge event buffer.

Customer memory enters this flow only as a bounded runtime context. It can
adjust ranking and exclusions, but it does not allow automatic upsell and it
does not expose internal scoring, gross margin, sales goals, or memory
adjustments to the customer.

## Responsibilities

### Chatbot

- Natural conversation
- FAQ, menu, RAG, reservation, and order intent handling
- Conversation state
- QR login session and pseudonymous customer profile lookup
- Customer-facing reply generation
- Final decision on whether a suggestion fits the conversation

### AI Manager

- Gross profit and sales analysis
- Priority product selection
- Sales goals
- Inventory-driven product priority
- Customer preference and order tendency analysis
- Post-conversation improvement analysis

### Integration Layer

Location: `core/integrations/chatbot_ai_manager`

- Receives sales strategy from AI manager.
- Receives only the customer memory fields needed for the current conversation.
- Evaluates chatbot conversation context against safe recommendation rules.
- Returns at most one suggestion decision.
- Emits suggestion result events for later analytics.
- Manages manually configured sales strategies through repository/service
  boundaries.

## Safety Boundary

AI manager policy is advisory. The chatbot must not blindly push priority
products. The chatbot can ignore the policy when the customer intent, safety
state, or conversation tone makes a suggestion inappropriate.

Admin credentials must stay on the server side. Do not place the admin API key
in public browser bundles, query parameters, logs, or documentation examples
with real values. Rotate the key by updating Railway `ADMIN_API_KEY`, deploying
or restarting if needed, then updating trusted admin clients.

## Customer Memory Boundary

QR login is used to connect the current session to a pseudonymous customer
profile. The profile should focus on hospitality data such as preferences,
ordered items, avoided items, visit patterns, and suggestion reactions.

Direct personal information such as real name and phone number is outside the
initial customer memory scope unless a later reservation or explicit consent
flow requires it.

The current implementation separates three records:

- profile summary: bounded hospitality memory for the anonymous customer
- session link: `session_id` to `anonymous_customer_id`
- event log: structured `order_confirmed`, `recommendation_shown`,
  `recommendation_declined`, and `order_cancelled` events

If customer memory persistence fails, the chatbot still returns the normal
reply.

Customer memory may alter production replies only through an explicit
past-reference path:

```text
explicit customer memory intent
  -> anonymous_customer_id exists
  -> profile exists
  -> consent_status == granted
  -> bounded history exists
  -> short customer-facing reply
```

This path is intentionally blocked for FAQ, business hours, parking, payment,
reservation, product existence, order confirmation, and general chat. The
chatbot must not proactively mention previous orders or use customer memory for
automatic upsell.

Customer memory may also adjust explicit recommendation candidate ranking when
all of the following are true:

- the current intent is an explicit recommendation request
- `anonymous_customer_id` exists
- a customer profile exists
- `consent_status == granted`
- the memory context can be loaded safely

When these conditions are not met, the chatbot uses the normal sales strategy
or short recommendation fallback. `recommendation_declined` is a hard exclusion;
`order_cancelled` is recorded but is not treated as dislike.
## Recommendation Feedback Flow

The chatbot records recommendation outcomes without changing the customer-facing
reply flow.

```text
explicit recommendation request
  -> recommendation_shown
  -> order_confirmed for the same product in the same session
  -> recommendation_converted
  -> admin performance API
  -> AI manager review
```

The performance API is admin-only:

```text
GET /admin/ai-manager/recommendation-performance
```

Supported filters:

- `from`
- `to`
- `strategy_id`
- `product_id`
- `used_customer_memory`

The first MVP measures performance only. It does not automatically change
recommendation weights.

Recommendation event product names are normalized at the repository boundary.
Existing mojibake event names are restored at admin API display time when a safe
UTF-8 recovery is possible. Counts, filters, conversion matching, and product
identity continue to use the existing event fields and `product_id` grouping.
