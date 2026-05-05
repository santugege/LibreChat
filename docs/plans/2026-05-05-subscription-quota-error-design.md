# Subscription Quota Error Design

## Goal

When a user reaches the daily subscription quota, the chat error should be a Chinese, action-oriented notice instead of the current English sentence. The notice should guide the user directly to subscription plans without showing the full settings page.

## Design

The backend already emits structured `subscription_quota` JSON. Keep that contract unchanged and improve the React renderer in `client/src/components/Messages/Content/Error.tsx`.

For `subscription_quota`, render a compact notice with:

- a Chinese title for text or image quota exhaustion
- a usage line with used, limit, plan, and reset time
- a short explanation that subscription plans provide higher quota
- a button that opens a purchase-only subscription plans dialog

Create a reusable `SubscriptionPlansDialog` near the existing subscription settings tab. It should reuse the same plan query, order creation, and payment QR flow as the settings tab, but the dialog must only show available paid plans, payment state, and payment instructions. It should not show general settings, usage meters, or admin plan management.

## Testing

Add tests that:

- render the quota error in Chinese without the old English wording
- click the CTA and verify a purchase-only plans dialog opens
- verify the plans dialog shows paid plans and can start checkout without rendering admin/settings content
