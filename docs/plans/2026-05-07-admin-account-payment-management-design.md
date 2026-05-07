# Admin Account and Payment Management Design

## Context

LibreChat already has administrator capability gates on backend routes. Admin APIs use
`requireJwtAuth` plus `SystemCapabilities.ACCESS_ADMIN`, with narrower capabilities such as
`READ_USERS` for user data. The account-management backend has a read-only foundation at
`/api/admin/users`: list users with pagination and search users by name, username, or email.

The subscription payment subsystem already persists ZPay subscription orders in
`SubscriptionPaymentOrder`. Normal users can create and inspect their own orders through
`/api/subscriptions/orders`, while admin-only subscription plan and quota-exemption endpoints live
under `/api/subscriptions/admin/*`.

## Goals

- Add an administrator-only account management area.
- Add an administrator-only payment list.
- Keep payment management read-only for this pass.
- Keep the UI separate from the account settings dialog so tables, filters, and pagination have
  enough space.
- Preserve backend authorization as the source of truth.

## Non-Goals

- Do not add payment refunds, manual fulfillment, order editing, or provider configuration.
- Do not add user deletion, banning, disabling, or password reset in this pass.
- Do not move or redesign the existing subscription plan editor.
- Do not expose administrator data through client-side checks alone.

## Recommended Approach

Create a dedicated admin center under the dashboard route, with two pages:

- `/d/admin/accounts`
- `/d/admin/payments`

The left navigation or user menu should render the admin entry only for `SystemRoles.ADMIN`.
The frontend visibility check is only for usability; every API used by the page must still enforce
administrator access on the server.

## Account Management

The first account-management version should be read-only:

- list users
- search by name, username, or email
- paginate with `limit` and `offset`
- show avatar, name, email, username, role, provider, created time, and updated time

Use the existing admin user handlers instead of introducing a parallel user API. The current
`/api/admin/users` list endpoint and `/api/admin/users/search` endpoint already cover this version.
The existing commented delete route should remain disabled until a later design consolidates the
full user deletion cascade and last-admin safety rules.

## Payment List

Add a read-only admin order endpoint:

`GET /api/subscriptions/admin/orders`

The endpoint should support:

- `limit`
- `offset`
- optional `status`

The response should include:

- `orders`
- `total`
- `limit`
- `offset`

Each order row should include:

- order id
- local order number, `outTradeNo`
- provider trade number, `tradeNo`, if present
- user id and display fields when available
- plan key
- amount
- payment type
- status
- created time
- expiry time
- paid time
- completed time
- failed reason, if present

Sort by newest created order first. Filter by tenant when the authenticated admin has a tenant id.
Do not include raw provider notification payloads or signed callback fields in the response.

## Backend Design

Extend the subscription route factory with an admin payment-list endpoint. Keep the existing
dependency-injection style in `packages/api/src/subscriptions/routes.ts` so route tests can provide
fake data methods without a live database.

Add data-schema methods for listing and counting payment orders. The list method should project only
the fields needed by the admin table and should populate or join minimal user display fields where
the existing Mongoose model pattern allows it. Keep the query cursor-friendly by using indexed
fields: `tenantId`, `status`, and `createdAt`.

The CommonJS wrapper at `api/server/routes/subscriptions.js` can keep passing
`requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN)`. No new middleware is
needed for this read-only payment view.

## Frontend Design

Add an admin center route under the existing dashboard route tree. Use a utilitarian dashboard style:
dense but readable tables, compact filters, predictable pagination controls, and responsive layout.

Accounts page:

- search box
- paginated user table
- empty, loading, and error states

Payments page:

- status filter
- paginated payment table
- status badges
- formatted amount and dates
- empty, loading, and error states

All user-facing strings must use `useLocalize()`, with English keys added to
`client/src/locales/en/translation.json`.

## Data Provider Design

Add shared endpoint helpers and request methods in `packages/data-provider`:

- `adminUsers(limit, offset)`
- `adminUserSearch(query, limit)`
- `subscriptionAdminOrders(limit, offset, status?)`
- `getSubscriptionAdminOrders(...)`

Add shared response types for the account list and payment list so frontend hooks and backend route
tests use the same contracts.

Add React Query hooks under `client/src/data-provider/Admin` or similarly scoped folders:

- `useGetAdminUsers`
- `useSearchAdminUsers`
- `useGetSubscriptionAdminOrders`

Use stable query keys that include pagination and filter arguments.

## Authorization

Server-side authorization:

- Account list/search: `requireJwtAuth`, `ACCESS_ADMIN`, and `READ_USERS`
- Payment list: `requireJwtAuth` and `ACCESS_ADMIN`

Client-side visibility:

- Render the admin navigation entry for `user?.role === SystemRoles.ADMIN`, matching current
  frontend conventions.
- If a non-admin reaches the route directly, render a redirect or access-denied state; the API still
  returns the authoritative denial.

## Error Handling

Return `400` for invalid pagination or invalid status filters. Return `401` or `403` through the
existing authentication and capability middleware. Return `500` only for unexpected data-layer
errors, with server logs including enough context to diagnose the failing admin query.

On the frontend, show concise localized error messages and keep the table controls visible so the
admin can retry or change filters.

## Testing

Backend tests should cover:

- non-admin payment-list access is denied by middleware
- payment list returns paginated orders sorted newest first
- payment list filters by status
- payment list scopes by tenant id
- invalid status or pagination returns `400`
- account-management hooks consume the existing admin user contracts

Frontend tests should cover:

- non-admin users do not see the admin entry
- admin users can see the account and payment tabs/routes
- account table renders loading, empty, success, and error states
- payment table renders loading, empty, success, error, and filtered states
- pagination arguments are passed into React Query keys and data-service calls

## Rollout

Implement this in read-only slices:

1. shared API contracts and backend payment-list route
2. frontend data hooks
3. admin route shell and navigation
4. account table
5. payment table

This keeps the first release low-risk while leaving room for later admin actions such as disabling
accounts or inspecting individual order details.
