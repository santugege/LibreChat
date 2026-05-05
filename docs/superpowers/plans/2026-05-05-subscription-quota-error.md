# Subscription Quota Error Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the English daily quota error with a Chinese subscription CTA that opens a purchase-only subscription plans dialog.

**Architecture:** Keep the existing backend `subscription_quota` JSON contract. Render a dedicated React quota notice in the message error renderer, and open a focused `SubscriptionPlansDialog` that reuses the existing plan list and payment flow without showing the full settings dialog.

**Tech Stack:** React, TypeScript, Radix Tabs, Jest, Testing Library, LibreChat localization.

---

### Task 1: Purchase-Only Plans Dialog

**Files:**
- Create: `client/src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.tsx`
- Create: `client/src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.spec.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Write the failing test**

Add tests that render `SubscriptionPlansDialog`, assert it shows paid plans, omits admin management copy, and creates an order when the user clicks the payment button.

- [ ] **Step 2: Run the dialog test**

Run: `cd client && npx jest src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.spec.tsx --runInBand`
Expected: FAIL because the dialog component does not exist yet.

- [ ] **Step 3: Implement the dialog**

Implement a modal with a localized title, a concise quota-upgrade description, `PlanList`, payment unconfigured state, order creation, QR payment dialog, and close controls.

- [ ] **Step 4: Run the dialog test**

Run: `cd client && npx jest src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.spec.tsx --runInBand`
Expected: PASS.

### Task 2: Quota Error CTA

**Files:**
- Modify: `client/src/components/Messages/Content/Error.tsx`
- Modify: `client/src/components/Messages/Content/__tests__/Error.test.tsx`
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Write the failing test**

Update the Error test so a `subscription_quota` payload renders Chinese copy, does not render the old English sentence, opens `SubscriptionPlansDialog`, and does not import or render `Settings`.

- [ ] **Step 2: Run the Error test**

Run: `cd client && npx jest src/components/Messages/Content/__tests__/Error.test.tsx --runInBand`
Expected: FAIL because the current CTA opens the full Settings dialog.

- [ ] **Step 3: Implement the quota notice**

Render a small React notice for `subscription_quota`, add localized Chinese strings, format the reset time for display, and open `SubscriptionPlansDialog` from the CTA.

- [ ] **Step 4: Run the Error test**

Run: `cd client && npx jest src/components/Messages/Content/__tests__/Error.test.tsx --runInBand`
Expected: PASS.

### Task 3: Verification

**Files:**
- Verify: `client/src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.spec.tsx`
- Verify: `client/src/components/Messages/Content/__tests__/Error.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `cd client && npx jest src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.spec.tsx src/components/Messages/Content/__tests__/Error.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 2: Inspect diff**

Run: `git diff -- client/src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.tsx client/src/components/Nav/SettingsTabs/Subscription/SubscriptionPlansDialog.spec.tsx client/src/components/Messages/Content/Error.tsx client/src/components/Messages/Content/__tests__/Error.test.tsx client/src/locales/en/translation.json`
Expected: only the quota notice, purchase dialog, tests, and localization are changed.
