# Recommendation Rules

## Default Rule

Suggest nothing unless the customer context makes a suggestion natural.

## Allowed Examples

- Customer asks for a recommendation.
- Customer asks what goes well with beer.
- Customer is choosing food and asks for guidance.
- Customer has ordered an item and then asks what else is good.

## Blocked Examples

- Customer only asks business hours.
- Customer only asks whether an item exists.
- Customer just confirmed a simple order.
- Customer declined the same product earlier in the session.
- Customer is discussing allergy details.
- Customer is in a reservation or banquet confirmation flow.
- Customer asks for facility information such as parking.

## Suggestion Limits

- Default: at most one suggestion per session.
- Candidate list: at most one item unless the customer asks for choices.
- Declined products: do not suggest again in the same session.

## Example Mappings

| Conversation | Possible AI manager suggestion |
| --- | --- |
| Sashimi order, customer asks what drink is good | Local sake |
| Beer pairing question | One snack item |
| Set meal order, customer asks for one more dish | Mini sashimi |
| Banquet consultation | Drinking plan or sashimi boat, only after basic details are gathered |

