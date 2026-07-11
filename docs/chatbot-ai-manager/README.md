# Chatbot x AI Manager

This directory defines the integration project between the Ootsuki chatbot and
the existing AI manager.

The goal is not to make the chatbot push products aggressively. The goal is to
let the AI manager provide sales policy, while the chatbot keeps a natural
customer-service conversation and uses that policy only when it fits the
conversation.

## Principle

- The chatbot answers the customer's question first.
- The AI manager decides priority products, reasons, and sales goals.
- The integration layer converts that policy into chatbot-safe suggestions.
- The chatbot suggests at most one item when the conversation allows it.
- Declined products are not suggested again in the same session.
- Suggestions and results are recorded for later improvement.

## Current Scope

This project starts with documentation and a passive integration scaffold.
Customer-facing chatbot behavior is not changed by this directory alone.

## Existing Project Boundary

The repository already contains `ai-maneger`. That directory is treated as the
existing AI manager application and is not renamed here. Chatbot-side integration
code lives under `core/integrations/chatbot_ai_manager`.

