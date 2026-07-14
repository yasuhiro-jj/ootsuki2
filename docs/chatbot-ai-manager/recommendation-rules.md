# Recommendation Rules

## Default Rule

Suggest nothing unless the customer context makes a suggestion natural.
Customer memory can make a suggestion more relevant, but it does not override
the customer's current intent.

## Current Connection Scope

The production chatbot only checks sales strategy for explicit recommendation
requests. The current implementation does not perform automatic upsell.

If no active sales strategy exists, the chatbot returns a short menu fallback
instead of passing the turn to an open-ended recommendation response. This keeps
the answer to one safe item, avoids long lists, and does not add LINE or phone
guidance.

## Allowed Examples

- Customer asks for a recommendation.
- Customer asks what goes well with beer.
- Customer is choosing food and asks for guidance.
- Customer has ordered an item and then asks what else is good.
- Returning customer asks for something similar to a previously liked item.

## Blocked Examples

- Customer only asks business hours.
- Customer only asks whether an item exists.
- Customer just confirmed a simple order.
- Customer is in a FAQ, reservation, or facility-information turn.
- Customer declined the same product earlier in the session.
- Customer memory says the customer avoids that item or category.
- Customer is discussing allergy details.
- Customer is in a reservation or banquet confirmation flow.
- Customer asks for facility information such as parking.

## Suggestion Limits

- Default: at most one suggestion per session.
- Candidate list: at most one item unless the customer asks for choices.
- No-strategy fallback: one item and two short sentences.
- Session limit reached: repeat the previous recommendation briefly, do not
  call the old long recommendation handler, and do not record another
  `suggestion_shown` event.
- Declined products: do not suggest again in the same session.
- Avoided products: do not suggest.
- Consented customer-memory declines: do not suggest again.
- `order_cancelled` is not treated as dislike or permanent exclusion.

## Production Smoke Test Strategy

Use a temporary manual strategy for production verification. Create it through
`POST /admin/ai-manager/sales-strategies`, verify it with
`GET /admin/ai-manager/sales-strategies/current`, then disable it with
`POST /admin/ai-manager/sales-strategies/{strategy_id}/deactivate`.

Recommended temporary product:

```json
{
  "product_id": "262e9a7e-e5b7-81d6-980b-eca518b63e27",
  "product_name": "刺身定食"
}
```

Use a short JST validity window such as the current test hour only. Do not leave
the smoke-test strategy active after verification.

## Example Mappings

| Conversation | Possible AI manager suggestion |
| --- | --- |
| Sashimi order, customer asks what drink is good | Local sake |
| Beer pairing question | One snack item |
| Set meal order, customer asks for one more dish | Mini sashimi |
| Banquet consultation | Drinking plan or sashimi boat, only after basic details are gathered |

## Customer Memory Usage

- Use customer memory only when `consent_status` is `granted`.
- Do not use customer memory when consent is `unknown` or `denied`.
- Use recent ordered items as a small affinity boost for explicit recommendation
  requests.
- Use recommendation declines as hard exclusions.
- Use already suggested items as session-level exclusions.
- Use "different from previous" requests to exclude recent ordered and recent
  recommended items.
- Do not exclude `order_cancelled` items by itself.
- Do not say "your database says" or expose internal profile details.
- Do not use customer memory to repeatedly push high-margin items.

## Scoring

The scoring model is internal and must not be shown to customers.

Tracked adjustment labels include:

- `base_strategy_priority`
- `repeat_order_affinity`
- `repeat_count_affinity`
- `recent_recommendation_penalty`
- `recommendation_history_penalty`
- `topic_relevance`
- `different_from_previous_bonus`

Customer-facing replies should still mention only the selected product in one
or two short sentences.
## Performance Measurement Rules

Recommendation performance is measured only for structured recommendation
events.

Conversion rule:

- same `session_id`
- same `product_id`, or same normalized product name when `product_id` is absent
- `order_confirmed` happens after `recommendation_shown`
- conversion happens within `RECOMMENDATION_CONVERSION_WINDOW_SECONDS`

Not counted as conversion:

- order happened before the recommendation
- different product ordered
- product existence check only
- price check only
- order cancelled after confirmation
- order in a different session

`order_cancelled` is tracked separately and is not treated as
`recommendation_declined`.

The current phase does not automatically feed conversion rate back into the
recommendation score. Humans should inspect the admin performance API first.
