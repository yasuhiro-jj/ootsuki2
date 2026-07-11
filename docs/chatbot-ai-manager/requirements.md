# Requirements

## Business Goal

Build a sales operating model where the chatbot and AI manager work together to
increase gross profit without harming the customer experience.

## Functional Requirements

- AI manager can provide today's priority products.
- Priority products can include reason, priority score, inventory priority,
  sales goal, and suggested conversation triggers.
- QR login can connect a returning customer to a pseudonymous customer profile.
- Customer profiles store preferences and behavior, not direct personal
  information such as real name or phone number.
- Customer profiles can include favorite items, avoided items, ordered dishes,
  declined suggestions, visit signals, and communication notes.
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
- Use customer memory to make the conversation warmer, not more pushy.
- Do not expose internal customer tags to the customer.
- Do not infer sensitive attributes from order history.

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
- `customer_profile_id`
- `anonymous_customer_id`
- `preference_tags`
- `favorite_items`
- `avoided_items`
- `last_ordered_items`
- `visit_count`
- `last_suggestion_result`

## Privacy Requirements

- Prefer pseudonymous identifiers over direct personal information.
- Do not require name, phone number, address, or birthday for the first MVP.
- Keep consent and opt-out behavior explicit before long-term memory is used.
- Mask or exclude sensitive data from logs and AI analysis.
- Store only information useful for hospitality, such as preferences, order
  tendencies, and prior suggestion reactions.
