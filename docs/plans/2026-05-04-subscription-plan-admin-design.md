# Subscription Plan Admin Design

## Problem

The current subscription feature still treats plans as bootstrap configuration.
`config/seed-subscription-plans.js` hardcodes `free` and `pro_monthly`, while
`packages/api/src/subscriptions/quota.ts` falls back to environment-based free
limits when no database plan exists. This makes subscription behavior difficult
for administrators to control from the product UI.

Administrators should manage every plan, including `free`, from the subscription
settings page. `free` should not receive special protection: it can be edited,
disabled, or deleted like any other plan.

## Decisions

- Add plan management to the existing subscription settings tab.
- Show management controls only to users with the admin role.
- Treat `free` as ordinary database data, not as a code or environment fallback.
- Keep the ordinary user view focused on current usage and paid plan purchase.
- Keep backend business logic in `packages/api`, database methods in
  `packages/data-schemas`, shared types and endpoints in
  `packages/data-provider`, and only thin route wiring in `api`.

## Backend Design

Extend the subscription route factory with administrator-only plan endpoints:

- `GET /api/subscriptions/admin/plans`
- `POST /api/subscriptions/admin/plans`
- `PATCH /api/subscriptions/admin/plans/:key`
- `DELETE /api/subscriptions/admin/plans/:key`

The route wrapper in `api/server/routes/subscriptions.js` should pass the same
admin capability middleware pattern used by other admin routes. The TypeScript
route factory in `packages/api/src/subscriptions/routes.ts` should remain
dependency-injected so tests can exercise handlers without a live server.

Plan writes should validate:

- `key`, `name`, positive integer `durationDays`
- nonnegative numeric `price`
- nonnegative integer `textDailyLimit` and `imageDailyLimit`
- boolean `enabled`
- integer `sortOrder`

The public `GET /api/subscriptions/plans` endpoint should continue returning
enabled plans for the current tenant. The admin endpoint should return all plans,
including disabled ones.

## Data Model

Keep the existing `SubscriptionPlan` schema. Add focused methods in
`packages/data-schemas/src/methods/subscription.ts`:

- list all plans for admin management
- get a plan by key
- create or update a plan
- patch an existing plan
- delete a plan by key

All methods should preserve the existing tenant filter behavior.

## Quota Behavior

Remove the environment-configured free-plan fallback from quota resolution.

When a user has an active subscription, resolve that subscription's enabled plan.
If the plan no longer exists or is disabled, quota should fail with a clear
subscription plan error instead of silently granting free quota.

When a user has no active subscription, resolve the enabled `free` plan. If it is
missing or disabled, quota should fail with the same clear plan error.

This makes admin plan changes authoritative.

## Payment Behavior

Order creation should allow only enabled paid plans. Plans with `price === 0`,
including `free`, should not be purchasable through payment checkout.

## Frontend Design

Use the existing subscription settings tab:

- Normal users see current plan, usage, payment warning, and paid plan purchase.
- Admin users additionally see a plan management section on the same tab.

The admin section should support:

- list all plans, including disabled plans
- create a new plan
- edit all plan fields
- toggle enabled state
- delete a plan

The form should use compact controls suited to a settings dialog: text inputs for
key/name/description, number inputs for price/duration/limits/sort order, and a
toggle or checkbox for enabled state. Keep labels localized with `useLocalize()`
and add English translation keys only.

## Data Provider

Add shared endpoint builders, types, data-service functions, React Query query
hooks, and mutations for admin plan management. Mutations should invalidate both
admin plan queries and public subscription plan/status queries so user-facing
state updates after administrator changes.

## Testing

Use test-first implementation.

Backend tests should cover:

- quota no longer returns config fallback when `free` is missing
- quota denies when the active subscription's plan is missing or disabled
- admin routes list all plans and enforce admin access
- admin routes create, update, toggle, and delete plans
- order creation rejects free or disabled plans

Data-provider and frontend tests should cover:

- endpoint and hook wiring for admin plan CRUD
- admin users see the management section
- normal users do not see management controls
- create, update, toggle, and delete actions call the correct mutations

## Migration Notes

Existing deployments can still use the seed script as a convenience bootstrap,
but runtime behavior must not depend on seed data or environment free limits.
Administrators can later edit or remove seeded plans from the UI.
