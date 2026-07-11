# Architecture

## Data Flow

```text
Menu / sales / inventory data
  -> AI manager
  -> SalesStrategy
  -> Chatbot AI manager bridge
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
- Customer-facing reply generation
- Final decision on whether a suggestion fits the conversation

### AI Manager

- Gross profit and sales analysis
- Priority product selection
- Sales goals
- Inventory-driven product priority
- Post-conversation improvement analysis

### Integration Layer

Location: `core/integrations/chatbot_ai_manager`

- Receives sales strategy from AI manager.
- Evaluates chatbot conversation context against safe recommendation rules.
- Returns at most one suggestion decision.
- Emits suggestion result events for later analytics.

## Safety Boundary

AI manager policy is advisory. The chatbot must not blindly push priority
products. The chatbot can ignore the policy when the customer intent, safety
state, or conversation tone makes a suggestion inappropriate.

