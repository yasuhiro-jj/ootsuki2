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

## Phase 3: Explicit Recommendation Connection

Use conversation state to suggest one priority product only when the customer
explicitly asks for a recommendation.

Status: connected.

## Phase 3.1: Short Fallback Without Active Strategy

When no active sales strategy exists, explicit recommendation requests should
still receive a short, natural fallback from safe menu knowledge. The fallback
must not add LINE or phone guidance and must not list many products.

Status: implemented in this phase.

## Phase 3.2: Production Strategy Smoke Test

Register one temporary production sales strategy, verify that explicit
recommendation requests use it, then deactivate it.

Status: next.

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
