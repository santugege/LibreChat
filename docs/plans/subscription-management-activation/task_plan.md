# Subscription Management Activation Task Plan

## Goal
Enable the existing subscription management feature end to end for local LibreChat: visible settings tab, query/mutation hooks, startup config flag, default plan seeding, and local environment values.

## Phases
- [x] Phase 1: Add failing tests for startup config, settings tab registration, data hooks, and plan seeding.
- [x] Phase 2: Implement the minimal backend/config pieces.
- [x] Phase 3: Implement the frontend settings tab and hooks.
- [x] Phase 4: Build packages, seed local plans, restart backend, and smoke test.

## Decisions
- Use the existing subscription backend and database models.
- Keep subscription management separate from token balance.
- Gate the UI from `/api/config` with `subscriptions.enabled`.
- Seed local plans with a small config script instead of adding a long-lived startup side effect.
