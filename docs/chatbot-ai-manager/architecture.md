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

## Safety Boundary

AI manager policy is advisory. The chatbot must not blindly push priority
products. The chatbot can ignore the policy when the customer intent, safety
state, or conversation tone makes a suggestion inappropriate.

## Customer Memory Boundary

QR login is used to connect the current session to a pseudonymous customer
profile. The profile should focus on hospitality data such as preferences,
ordered items, avoided items, visit patterns, and suggestion reactions.

Direct personal information such as real name and phone number is outside the
initial customer memory scope unless a later reservation or explicit consent
flow requires it.
