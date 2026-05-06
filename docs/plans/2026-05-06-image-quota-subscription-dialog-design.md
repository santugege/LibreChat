# Image Quota Subscription Dialog Design

## Goal

When image quota is exhausted, users should see the same subscription purchase prompt used for text quota exhaustion.

## Context

Text quota errors are rendered by `client/src/components/Messages/Content/Error.tsx`. That renderer already understands the structured `subscription_quota` payload and opens `SubscriptionPlansDialog`.

Image quota errors are different because they occur inside image tool execution. The backend wraps image tools with `createImageQuotaGuard`, and exhausted quota can reach the client inside tool output text such as `Error processing tool image_gen_oai: {"type":"subscription_quota",...}`. `client/src/components/Chat/Messages/Content/ToolOutput/OutputRenderer.tsx` currently treats that as a generic tool error.

## Design

Extract the existing subscription quota notice into a small shared component under `client/src/components/Messages/Content/`. Both the message-level error renderer and the tool-output renderer will render that component for `subscription_quota`.

The tool-output renderer will inspect cleaned tool error text and direct JSON text for a `subscription_quota` object. When found, it will render the shared subscription notice instead of generic red text. This covers both known shapes:

- `{"type":"subscription_quota","kind":"image",...}`
- `Error processing tool image_gen_oai: {"type":"subscription_quota","kind":"image",...}`

## Error Handling

Only valid JSON objects with `type: "subscription_quota"` render the subscription notice. Other tool errors remain unchanged.

## Testing

Add focused React tests for `OutputRenderer`:

- renders the image quota title and subscription CTA when a tool error embeds subscription quota JSON
- opens `SubscriptionPlansDialog` from that CTA
- still renders generic tool errors as ordinary tool errors

Keep the existing message `Error.tsx` subscription quota test passing to prove text quota behavior is unchanged.
