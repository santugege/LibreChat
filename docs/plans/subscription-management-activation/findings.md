# Subscription Management Activation Findings

- `SUBSCRIPTIONS_ENABLED` is absent from `.env`; `getSubscriptionConfig()` currently returns `enabled:false`.
- `ZPAY_*` values are absent, so paid order creation would fail on required payment env variables.
- MongoDB has subscription collections but no plans, subscriptions, orders, or usage documents.
- `/api/subscriptions` is mounted and protected by JWT auth.
- Text quota middleware is wired for agents, assistants, OpenAI-compatible remote agents, and Responses remote agents.
- No frontend settings tab or React Query hooks currently call the subscription data-service methods.
- `CONFIG_PATH=/app/librechat.yaml` points to a Docker path and produces a missing-file warning during local Node startup.
- `.env` now enables subscription management locally and points `CONFIG_PATH` to `./librechat.yaml`.
- Payment remains intentionally unconfigured until real `ZPAY_API_BASE`, `ZPAY_PID`, and `ZPAY_PKEY` values are provided; the UI disables paid checkout in that state.
- MongoDB now has two enabled default plans: `free` and `pro_monthly`.
