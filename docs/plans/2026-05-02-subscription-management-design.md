# Subscription Management Design

Date: 2026-05-02

## Goal

Add subscription management to this LibreChat fork so free users have fixed daily text
and image quotas, paid subscribers have higher daily quotas, and ZPay can be used as
the first payment provider through the EasyPay protocol.

The design prioritizes fork compatibility. New business logic should live in new
modules and collections, with only thin hooks in upstream-heavy files.

## Confirmed Scope

- Free users get a built-in free plan with daily text and image limits.
- Paid users can buy subscription plans with higher daily text and image limits.
- Text quota is consumed once per user message that starts an assistant/model
  response.
- Image quota is consumed only for image generation or image editing.
- Image uploads, image understanding, OCR, and file processing do not consume image
  quota.
- Payment starts with ZPay, implemented through the EasyPay signing and callback
  protocol.

## Non-Goals

- Do not replace LibreChat's existing token balance feature.
- Do not add a full multi-provider payment administration system in the first pass.
- Do not modify the `User` document for subscription state.
- Do not add new top-level keys to `librechat.yaml` in the first pass, because the
  config schema is strict and upstream changes there are frequent.

## Current Project Constraints

LibreChat already has a token credit model:

- `packages/data-schemas/src/schema/balance.ts`
- `packages/data-schemas/src/schema/transaction.ts`
- `packages/api/src/middleware/checkBalance.ts`

That model tracks priced token credits. It is not a good fit for daily text and
image counts, so subscriptions should be modeled separately.

New backend logic should follow the project boundary in `CLAUDE.md`:

- TypeScript logic in `packages/api`.
- Mongoose schemas and database methods in `packages/data-schemas`.
- Shared API endpoints and frontend types in `packages/data-provider`.
- Minimal CommonJS wrappers in `api`.

## Recommended Architecture

Create a new subscription subsystem with these layers:

- `packages/data-schemas/src/schema/subscription.ts`: Mongoose schemas.
- `packages/data-schemas/src/models/subscription.ts`: model factories.
- `packages/data-schemas/src/types/subscription.ts`: shared database types.
- `packages/data-schemas/src/methods/subscription.ts`: focused data methods.
- `packages/api/src/subscriptions/*`: service, quota, payment, config, and route
  handler logic.
- `packages/data-provider/src/subscriptions/*`: shared request and response types.
- `client/src/data-provider/Subscriptions/*`: React Query hooks.
- `client/src/components/Nav/SettingsTabs/Subscription/*`: user-facing plan and
  usage UI.
- `api/server/routes/subscriptions.js`: thin route mounting wrapper.

The subsystem should expose clear service boundaries:

- `plan` service: loads enabled plans and resolves the current effective plan.
- `quota` service: atomically reserves or consumes daily quota.
- `payment` service: creates orders, verifies ZPay callbacks, and fulfills paid
  subscriptions idempotently.

## Data Model

Use separate MongoDB collections.

### SubscriptionPlan

Purpose: Admin-configured or file-seeded sellable plans.

Fields:

- `key`: stable plan key, unique.
- `name`: display name.
- `description`: optional description.
- `price`: numeric amount in CNY.
- `durationDays`: subscription duration.
- `textDailyLimit`: daily text quota.
- `imageDailyLimit`: daily image quota.
- `enabled`: whether users can buy the plan.
- `sortOrder`: display order.
- `tenantId`: optional tenant isolation key.

### UserSubscription

Purpose: Active or historical subscription state for a user.

Fields:

- `user`: user ObjectId.
- `planKey`: copied plan key.
- `status`: `active`, `expired`, or `cancelled`.
- `startsAt`: subscription start time.
- `expiresAt`: subscription end time.
- `sourceOrderId`: payment order id that created or extended it.
- `tenantId`: optional tenant isolation key.

### UsageBucket

Purpose: Atomic per-day counters.

Unique key:

- `user + windowKey + tenantId`

Fields:

- `user`: user ObjectId.
- `windowKey`: date key in the configured quota timezone, for example
  `2026-05-02`.
- `windowStart`: start of quota window.
- `windowEnd`: end of quota window.
- `textUsed`: consumed text count.
- `imageUsed`: consumed image count.
- `tenantId`: optional tenant isolation key.

### UsageEvent

Purpose: Audit and idempotency for quota consumption.

Fields:

- `user`: user ObjectId.
- `kind`: `text` or `image`.
- `amount`: positive integer.
- `requestId`: idempotency key.
- `bucketKey`: daily bucket key.
- `status`: `reserved`, `committed`, or `released`.
- `reason`: optional diagnostic reason.
- `metadata`: small object for endpoint, model, tool, conversation, or order ids.
- `tenantId`: optional tenant isolation key.

### PaymentOrder

Purpose: Local payment lifecycle and webhook idempotency.

Fields:

- `user`: user ObjectId.
- `outTradeNo`: local order number sent to ZPay.
- `tradeNo`: upstream trade number.
- `planKey`: purchased plan.
- `amount`: expected amount.
- `paymentType`: `alipay` or `wxpay`.
- `status`: `pending`, `paid`, `fulfilling`, `completed`, `expired`, `cancelled`,
  or `failed`.
- `payUrl`: payment URL returned by ZPay.
- `qrCode`: QR code content returned by ZPay.
- `rawNotify`: last verified notify payload.
- `expiresAt`, `paidAt`, `completedAt`, `failedAt`.
- `tenantId`: optional tenant isolation key.

## Quota Flow

For text requests:

1. The request passes normal auth, ban, moderation, and resource checks.
2. A subscription quota middleware resolves the user's effective plan.
3. The quota service increments `textUsed` atomically if the daily limit allows it.
4. If the user is over limit, the request fails with a structured quota error.
5. The frontend shows the error and links to the subscription tab.

For image generation or editing:

1. The tool wrapper determines the requested image count.
2. The quota service increments `imageUsed` before the provider call.
3. Upload, OCR, and image understanding flows do not call this guard.
4. If the provider call fails before a generated image is returned, the usage event
   can be released in the first implementation where the call boundary is reliable.

## Payment Flow

ZPay is handled as an EasyPay-compatible provider.

Create order:

1. User selects a plan and payment type.
2. Backend validates the plan, amount, and existing pending order count.
3. Backend creates a local `pending` `PaymentOrder` with `outTradeNo`.
4. Backend signs EasyPay parameters with MD5:
   - sort parameter keys.
   - omit `sign`, `sign_type`, and empty values.
   - join as `k=v&...`.
   - append the merchant `pkey`.
   - MD5 hex digest.
5. Backend calls ZPay `/mapi.php` or creates a `/submit.php` redirect URL.
6. Frontend renders QR code or opens `payUrl`.

Webhook:

1. ZPay calls `/api/subscriptions/payment/webhook/zpay`.
2. Backend parses form data and verifies the EasyPay signature.
3. Backend checks `out_trade_no`, amount, and trade status.
4. Backend marks the order `paid`.
5. Backend idempotently creates or extends the user's subscription.
6. Backend marks the order `completed`.
7. Backend returns plain `success` to ZPay.

The EasyPay reference implementation lives in:

- `D:/protect/sub2api/backend/internal/payment/provider/easypay.go`
- `D:/protect/sub2api/backend/internal/handler/payment_webhook_handler.go`
- `D:/protect/sub2api/backend/internal/service/payment_fulfillment.go`

## Frontend Design

Add a subscription tab in account settings, separate from the existing balance tab.

User view:

- Current plan.
- Expiration date.
- Today's text usage and limit.
- Today's image usage and limit.
- Available plans.
- Pay buttons for Alipay and WeChat through ZPay.
- Current order status with polling.

The existing balance UI stays unchanged. This prevents confusing token credits with
daily usage counts.

## Configuration

First pass should use environment variables and a small optional local config file.

Suggested environment variables:

- `SUBSCRIPTIONS_ENABLED`
- `SUBSCRIPTION_QUOTA_TIMEZONE`
- `SUBSCRIPTION_FREE_TEXT_DAILY_LIMIT`
- `SUBSCRIPTION_FREE_IMAGE_DAILY_LIMIT`
- `ZPAY_PID`
- `ZPAY_PKEY`
- `ZPAY_API_BASE`
- `ZPAY_PAYMENT_MODE`
- `ZPAY_NOTIFY_URL`
- `ZPAY_RETURN_URL`

Suggested local file:

- `config/subscriptions.yaml`

The local file can define paid plans without modifying `librechat.yaml`.

## Error Handling

Quota errors should be structured JSON embedded in the same error path LibreChat
already uses for message errors.

Example:

```json
{
  "type": "subscription_quota",
  "kind": "text",
  "used": 20,
  "limit": 20,
  "planKey": "free",
  "resetAt": "2026-05-03T00:00:00+08:00"
}
```

Payment errors should never grant a subscription unless both signature and amount
verification pass. Fulfillment must be idempotent so repeated callbacks do not extend
the subscription twice.

## Fork Compatibility

This design keeps upstream conflicts low by:

- Adding new files for most logic.
- Avoiding `User` schema changes.
- Avoiding `Balance` and `Transaction` semantics changes.
- Avoiding new `librechat.yaml` schema keys in the first pass.
- Mounting one new route tree in `api/server/index.js`.
- Hooking existing chat and tool paths with small middlewares/wrappers.

## Testing Strategy

Database tests:

- Plan resolution.
- Active subscription selection.
- Daily bucket reset by timezone.
- Atomic quota increments under concurrency.
- Payment order idempotency.

Backend route tests:

- Free user text quota allowed and rejected.
- Paid user higher quota allowed.
- ZPay order creation signs parameters correctly.
- ZPay webhook rejects invalid signatures.
- ZPay webhook completes subscription exactly once on duplicate callbacks.

Frontend tests:

- Subscription tab renders free and paid states.
- Usage bars handle zero limits and exhausted limits.
- Checkout flow creates order and polls status.

## Rollout Plan

Phase 1:

- Data model, services, quota guard, ZPay order creation, webhook fulfillment.
- Subscription settings tab.
- File or environment configured plans.

Phase 2:

- Admin plan management UI.
- Order history UI.
- Refund and cancellation controls.

Phase 3:

- More payment providers.
- Optional integration with LibreChat's existing balance view if desired.
