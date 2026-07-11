# Requirements

## Business Goal

Build a sales operating model where the chatbot and AI manager work together to
increase gross profit without harming the customer experience.

## Functional Requirements

- AI manager can provide today's priority products.
- Priority products can include reason, priority score, inventory priority,
  sales goal, and suggested conversation triggers.
- Chatbot can receive sales strategy without changing normal FAQ behavior.
- Chatbot can decide whether a suggestion is appropriate for the current
  conversation.
- Chatbot can record suggested, ordered, and declined results.
- AI manager can later analyze those results.

## Conversation Requirements

- Answer the customer's question before any sales suggestion.
- Do not suggest products for pure FAQ questions.
- Do not suggest products immediately after a simple order confirmation.
- Do not repeat a product that the customer declined.
- Keep suggestions to one item by default.
- Do not show LINE or phone guidance unless human confirmation is needed.
- Do not let sales policy override allergy, reservation, or safety flows.

## Initial Fields

- `priority_products`
- `sales_strategy`
- `recommendation_rules`
- `suggestion_allowed`
- `suggestion_count`
- `suggestion_result`
- `ordered_items`
- `declined_products`
- `sales_goal`
- `inventory_priority`

