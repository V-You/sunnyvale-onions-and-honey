# Sunnyvale PayRam pivot notes (2026-06-09)

## Why this file exists

This file is a short, resume-friendly record of the Sunnyvale pivot from Evervault-first checkout to a PayRam Operator showcase. Use it as the current source of truth when resuming work.

## What we verified about the current codebase

- Stack: Next.js 15 + React 19 + TypeScript, deployed to Cloudflare Pages (`@cloudflare/next-on-pages`).
- Checkout UI entry point: `src/app/checkout/page.tsx` renders `CheckoutForm`.
- Current checkout implementation: `src/components/CheckoutForm.tsx` uses `@evervault/react` (`EvervaultProvider` + `Card`) and posts to ACP checkout session APIs.
- Current backend payment execution: `src/app/api/checkout_sessions/[id]/complete/route.ts` calls `routeToPSP` from `src/lib/psp-router.ts`.
- Current PSP switch: `ACTIVE_PSP` supports `aci`, `stripe`, and `braintree` (plus related env bindings in `src/lib/types.ts` and `src/lib/kv.ts`).

## External PayRam context used for this pivot

- Operator mode is multi-merchant and reference-driven (`reference_id`, `merchant_id`) with webhook-based reconciliation (`payment.confirmed`).
- PayRam provides hosted/embedded and headless integration paths, and promotes operator-owned infrastructure under your own domain.
- Testing docs confirm payment link and confirmation workflows, including operational troubleshooting when deposit addresses are not generated.

## Decision summary

We will pivot Sunnyvale checkout to showcase PayRam, while preserving existing Evervault/Braintree code so we can switch back quickly.

### Decision 1 - frontend SDK loading

Add the PayRam browser SDK script on the checkout page:

```html
<script src="https://cdn.payram.com/sdk/v3/payram.min.js"></script>
```

Scope: checkout page only.

### Decision 2 - headless create-payment flow

Add a server route that calls the PayRam Operator endpoint (as in the blueprint):

- Operator base example: `https://payram.laetzer.com`
- Create payment example: `/api/v3/payments/create_payment`
- Auth: bearer key from server-side env
- Include structured `reference_id` and `metadata` for telemetry and reconciliation

### Decision 3 - submit-time card-to-crypto execution

On checkout submit, call PayRam headless/onramp execution with the payment token returned by the backend, then transition UI to processing/pending state until confirmation.

## planned implementation sequence

1. Add PayRam SDK script to checkout route.
2. Introduce a backend PayRam create-payment API adapter in Next.js.
3. Add a PayRam checkout mode in `CheckoutForm` guarded by feature flags/env.
4. Keep Evervault/Braintree paths available as fallback during migration.
5. Add webhook handling for `payment.confirmed` to complete order and inventory actions.

## open items to confirm before coding deeper

- Exact PayRam JS SDK browser API shape in v3 (`PayRam(...)`, method names, and event lifecycle) - verify against current SDK docs/changelog.
- Final naming for env vars in this repo (proposed examples below).
- Whether this demo settles to Base or Sepolia by default during pivot phase.

## proposed environment variables

- `PAYRAM_OPERATOR_BASE_URL`
- `PAYRAM_MERCHANT_ID`
- `PAYRAM_MERCHANT_KEY`
- `PAYRAM_DEFAULT_CHAIN`
- `PAYRAM_DEFAULT_CURRENCY`

## evidence

- `src/app/checkout/page.tsx`
- `src/components/CheckoutForm.tsx`
- `src/app/api/checkout_sessions/route.ts`
- `src/app/api/checkout_sessions/[id]/complete/route.ts`
- `src/lib/psp-router.ts`
- `src/lib/kv.ts`
- `src/lib/types.ts`
- `README.md`
- https://www.payram.com/operator
- https://docs.payram.com/onboarding-guide/testing-payment-links
- https://mcp.payram.com/
