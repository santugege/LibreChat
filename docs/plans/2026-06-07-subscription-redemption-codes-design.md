# Subscription Redemption Codes Design

Date: 2026-06-07

## Goal

Add administrator-generated redemption codes for Taobao promotion. A buyer receives a code,
redeems it in LibreChat, and gets a time-limited subscription with fixed daily text and
image quotas.

The feature should reuse the existing subscription quota system. It should not add credits
to the token balance system, because the Taobao product is "days plus daily quota", not a
cash-like token credit top-up.

## Confirmed Scope

- Administrators can generate a batch of redemption codes.
- Each batch defines quantity, duration days, text daily limit, image daily limit, optional
  code expiration, and an operator note.
- Generated code plaintext is returned once for CSV download or copy. The database stores
  only hashes and short prefixes.
- Users can redeem one code from the subscription settings tab.
- Redeeming a code creates or extends the user's subscription using a plan snapshot.
- Administrators can list batches and codes, filter by status, export codes, and disable
  unused codes.
- The feature is designed for Taobao manual or automated fulfillment, with optional fields
  for campaign/SKU/order notes.

## Non-Goals

- Do not create a new token balance top-up path.
- Do not couple redemption codes to a live `SubscriptionPlan` at redeem time.
- Do not store plaintext codes after generation.
- Do not add refunds or partial revocation of already redeemed subscriptions in this pass.
- Do not build a Taobao API integration in the first pass.

## Current Project Fit

LibreChat already has a subscription subsystem:

- `packages/data-schemas/src/schema/subscription/*`
- `packages/data-schemas/src/methods/subscription.ts`
- `packages/api/src/subscriptions/*`
- `packages/data-provider/src/api-endpoints.ts`
- `client/src/components/Nav/SettingsTabs/Subscription/*`
- `client/src/components/Admin/*`

The existing subscription flow already supports:

- plan definitions
- active user subscription snapshots
- daily text and image quota
- payment order fulfillment
- admin plan and order pages

Redemption codes should be modeled as a second fulfillment source next to payment orders.
The redeem path should use the same subscription extension semantics so a user who redeems
multiple valid codes gets predictable extension behavior.

## Recommended Architecture

Create a new redemption area inside the subscription subsystem:

- `packages/data-schemas/src/schema/subscription/redemptionBatch.ts`
- `packages/data-schemas/src/schema/subscription/redemptionCode.ts`
- `packages/data-schemas/src/methods/subscription.ts`
- `packages/api/src/subscriptions/redemption.ts`
- `packages/api/src/subscriptions/routes.ts`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`
- `client/src/data-provider/Subscriptions/*`
- `client/src/components/Nav/SettingsTabs/Subscription/RedemptionCodeForm.tsx`
- `client/src/components/Admin/RedemptionCodesPage.tsx`

Keep the existing CommonJS wrapper at `api/server/routes/subscriptions.js`. It already injects
database methods, auth, admin access, and payment service into the route factory.

## Data Model

### SubscriptionRedemptionBatch

Purpose: one admin generation action.

Fields:

- `name`: display name for the batch.
- `quantity`: number of codes generated.
- `durationDays`: days granted when a code is redeemed.
- `textDailyLimit`: daily text quota granted by the code.
- `imageDailyLimit`: daily image quota granted by the code.
- `planKey`: snapshot key, default generated from batch settings.
- `planName`: user-facing snapshot name.
- `planDescription`: optional snapshot description.
- `planAmount`: optional price snapshot for reporting, default `0`.
- `expiresAt`: optional code expiration.
- `note`: optional admin note.
- `campaign`: optional Taobao campaign/SKU marker.
- `createdBy`: admin user id.
- `tenantId`: tenant isolation key.
- timestamps.

Indexes:

- `{ tenantId: 1, createdAt: -1 }`
- `{ tenantId: 1, campaign: 1, createdAt: -1 }`

### SubscriptionRedemptionCode

Purpose: one redeemable code.

Fields:

- `batch`: batch id.
- `codeHash`: hash of normalized code plus server secret.
- `codePrefix`: non-sensitive display prefix, for support lookup.
- `status`: `active`, `redeemed`, `disabled`, or `expired`.
- `durationDays`, `textDailyLimit`, `imageDailyLimit`: copied snapshot.
- `planKey`, `planName`, `planDescription`, `planAmount`: copied snapshot.
- `expiresAt`: optional code expiration.
- `redeemedBy`: user id that redeemed it.
- `redeemedAt`: redeem time.
- `sourceSubscriptionId`: resulting user subscription id.
- `disableReason`: admin reason for disabled codes.
- `note`: optional per-code support note.
- `tenantId`: tenant isolation key.
- timestamps.

Indexes:

- unique `{ codeHash: 1, tenantId: 1 }`
- `{ batch: 1, createdAt: 1 }`
- `{ tenantId: 1, status: 1, createdAt: -1 }`
- `{ redeemedBy: 1, redeemedAt: -1 }`

Plaintext code is never persisted. The first response after generation returns:

- code plaintext
- prefix
- batch id
- snapshot metadata

## Code Format And Hashing

Use a format like:

`LC-ABCD-EFGH-JKLM-NPQR`

Generation:

- use `crypto.randomBytes(16)` or equivalent CSPRNG.
- encode with a human-friendly uppercase alphabet that omits ambiguous characters.
- group with hyphens.
- normalize by trimming, uppercasing, and removing whitespace.

Hashing:

- `sha256(normalizedCode + ":" + REDEMPTION_CODE_SECRET)`
- secret comes from `REDEMPTION_CODE_SECRET`, with a safe fallback to `JWT_SECRET`.
- reject startup or route use if neither secret is configured.

## User Redeem Flow

Endpoint:

`POST /api/subscriptions/redeem`

Request:

```json
{ "code": "LC-ABCD-EFGH-JKLM-NPQR" }
```

Flow:

1. Authenticated user submits the code.
2. Backend normalizes and hashes the code.
3. Backend atomically finds an `active` code by hash and tenant.
4. Backend rejects disabled, expired, redeemed, or missing codes with a generic invalid response.
5. Backend marks the code as `redeemed` with `redeemedBy` and `redeemedAt`.
6. Backend creates or extends the user's subscription using the code's snapshot.
7. Backend stores the resulting subscription id on the redemption code.
8. Frontend invalidates subscription status and shows the new expiration.

Response:

```json
{
  "subscription": {
    "planKey": "redeem-30d-1000t-20i",
    "status": "active",
    "startsAt": "2026-06-07T00:00:00.000Z",
    "expiresAt": "2026-07-07T00:00:00.000Z"
  },
  "plan": {
    "key": "redeem-30d-1000t-20i",
    "name": "Taobao 30 Day Pack",
    "price": 0,
    "durationDays": 30,
    "textDailyLimit": 1000,
    "imageDailyLimit": 20,
    "enabled": true,
    "sortOrder": 0
  }
}
```

## Admin Flow

Admin page:

`/d/admin/redemptions`

Actions:

- generate batch
- list batches
- inspect batch codes
- filter by status
- export generated plaintext immediately after creation
- export existing non-sensitive list for audit
- disable unused codes

Batch generation request:

```json
{
  "name": "Taobao June 30 Day Pack",
  "quantity": 100,
  "durationDays": 30,
  "textDailyLimit": 1000,
  "imageDailyLimit": 20,
  "expiresAt": "2026-12-31T15:59:59.000Z",
  "campaign": "taobao-2026-06",
  "note": "June promotion"
}
```

Batch generation response includes plaintext codes only once:

```json
{
  "batch": { "id": "batch-id", "name": "Taobao June 30 Day Pack", "quantity": 100 },
  "codes": [
    {
      "code": "LC-ABCD-EFGH-JKLM-NPQR",
      "prefix": "LC-ABCD",
      "expiresAt": "2026-12-31T15:59:59.000Z"
    }
  ]
}
```

## Error Handling

User-facing redeem errors should be intentionally vague:

- `400`: invalid request body
- `404` or `400`: invalid or unavailable code
- `409`: code was already redeemed during a concurrent attempt
- `429`: too many redeem attempts

Admin errors can be more specific:

- invalid quantity
- invalid duration
- invalid quota values
- batch not found
- code not found or already redeemed

Do not expose code hashes, full code values, or tenant leakage in errors.

## Security

- Store only hashes, never plaintext.
- Use constant-time compare only if comparing raw digests in process; normal indexed MongoDB
  lookup by hash is acceptable for the main path.
- Add rate limiting to user redeem attempts using the existing `express-rate-limit` pattern.
- Cap batch size, recommended first pass maximum: 500 codes per request.
- Cap code length after normalization, recommended maximum: 64 characters.
- Prevent admin export of plaintext after the original generation response.
- Tenant scope every admin and redeem query.
- Keep redeemed rows immutable except for non-sensitive support notes in a later pass.

## Frontend UX

User subscription tab:

- Add a compact "Redeem code" section near the current plan.
- Input supports pasted codes with spaces or hyphens.
- Submit button shows loading state.
- Success message shows the new expiration and refreshes quota meters.
- Failure message says the code is invalid, expired, or already used.

Admin center:

- Add "Redemptions" navigation beside Accounts and Payments.
- Use dense tables matching existing admin pages.
- Batch table columns: created, name, campaign, quantity, duration, text/day, image/day,
  expires, created by.
- Code table columns: prefix, status, redeemed user, redeemed time, expires, note.
- After creating a batch, show a download CSV button immediately.

## Testing Strategy

Data schema tests:

- unique hash per tenant
- validation for positive integer quantity/duration/quotas
- expired and disabled code handling
- atomic single-use redemption under duplicate attempts

API tests:

- user can redeem a valid code
- user cannot redeem missing, disabled, expired, or already redeemed code
- duplicate concurrent redemption only grants once
- admin can generate, list, and disable codes
- non-admin cannot call admin endpoints
- tenant-scoped admin cannot see other tenant codes

Data-provider tests:

- endpoint URL builders
- request/response contracts
- query and mutation keys

Frontend tests:

- redeem form success invalidates subscription status
- redeem form shows error state
- admin shell shows redemptions nav
- admin redemptions page renders loading, empty, success, and error states
- CSV download contains plaintext only from the create response

## Rollout

Phase 1:

- Backend models, methods, routes, and user redeem UI.
- Admin batch generation and one-time CSV download.

Phase 2:

- Admin list filters, disable action, and audit exports.
- Optional Taobao order/campaign fields in more detail.

Phase 3:

- Taobao API integration or automated delivery callbacks if needed.
