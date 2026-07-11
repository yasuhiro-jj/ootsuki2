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
- Declined products: do not suggest again in the same session.
- Avoided products: do not suggest.

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

- Use favorite items to personalize only when it feels natural.
- Use avoided items to prevent bad recommendations.
- Use last ordered items to understand phrases such as "same as last time".
- Do not say "your database says" or expose internal profile details.
- Do not use customer memory to repeatedly push high-margin items.
