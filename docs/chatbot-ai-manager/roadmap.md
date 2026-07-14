# Roadmap

## Phase 0: Integration Foundation

Status: complete.

## Phase 1: Natural Chatbot

Keep improving product intent, store information, order continuation, and
short customer-friendly replies.

Status: in progress.

## Phase 2: Manual Priority Products

Let an operator specify today's priority products from an admin screen or a
simple configuration source.

Status: MVP implemented through admin API, service, repository, validation, and
JSON storage. A richer admin UI can be added later.

## Phase 2.5: QR Customer Memory

Connect QR login sessions to pseudonymous customer profiles. Store preferences,
ordered items, avoided items, and suggestion reactions without requiring direct
personal information.

Status: anonymous customer identification and browser localStorage retention are
complete.

## Phase 2.6: Session Link and Interaction History

Link `session_id` to `anonymous_customer_id`, record bounded structured events
for confirmed orders, shown recommendations, recommendation declines, and order
cancellations. Keep event logs separate from stronger preference memory and do
not use the memory to alter replies yet.

Status: implemented in this phase.

## Phase 2.7: Consented Explicit Customer Memory Replies

Use customer memory only when the customer has granted consent and explicitly
asks about previous orders, previous recommendations, usual items, or something
different from the previous visit. Do not use customer memory for normal FAQ,
product-existence, reservation, order-confirmation, or general chat replies.

Status: implemented in this phase.

## Phase 2.8: Consented Customer Memory Recommendation Ranking

Use consented customer memory to adjust explicit recommendation candidate
ranking. Keep the scope narrow: no automatic upsell, no post-order sales push,
no direct personal information, and no customer-facing exposure of internal
scores or sales goals.

Status: implemented in this phase.

## Phase 3: Explicit Recommendation Connection

Use conversation state to suggest one priority product only when the customer
explicitly asks for a recommendation.

Status: connected.

## Phase 3.1: Short Fallback Without Active Strategy

When no active sales strategy exists, explicit recommendation requests should
still receive a short, natural fallback from safe menu knowledge. The fallback
must not add LINE or phone guidance and must not list many products.

Status: implemented in this phase.

## Phase 3.2: Sales Strategy Admin API Authentication

Protect sales strategy management routes with a server-side admin API key before
allowing production strategy registration.

Status: admin authentication implemented in this phase.

## Phase 3.3: Production Strategy Registration

Set `ADMIN_API_KEY` in Railway, register one temporary sales strategy through a
trusted admin client, verify the recommendation behavior, then deactivate the
strategy.

Status: initial production trigger verified.

## Phase 3.4: Repeated Recommendation Limit and Compact Reservation Replies

When the explicit recommendation session limit is reached, keep the response
short instead of falling back to the old long recommendation handler. Keep
initial reservation replies short and avoid contact/menu guidance until it is
actually needed.

Status: implemented in this phase.

## Phase 4: Natural Context Suggestions

Use broader conversation flow to suggest one product naturally when appropriate.

Status: not started.

## Phase 5: Result Tracking

Record suggested, ordered, and declined results. Use those events to understand
which suggestions help and which feel pushy.

## Phase 6: AI Manager Automation

Let the AI manager choose products from sales, gross profit, inventory, time
slot, and goals.

## Phase 7: Continuous Improvement

Connect suggestion results to conversation quality review and AI manager
analytics so that both sales performance and customer experience improve.
## Current Roadmap Update

```text
顧客記憶を使ったおすすめ順位調整
完了

推薦表示・注文成果の計測
今回実装

実績を見た重み付け調整
次フェーズ
```

The current phase records `recommendation_shown` and
`recommendation_converted` metrics, then exposes aggregated performance through
an admin-only API. Automatic score updates from conversion data are intentionally
out of scope.

## Phase 5.1: Product Name Normalization for Recommendation Metrics

Normalize recommendation event `product_name` values before storage and restore
legacy mojibake names at admin API display time where possible. Keep numeric
aggregation and product identity unchanged.

Status: implemented in this phase.
