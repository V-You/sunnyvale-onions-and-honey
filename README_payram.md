# Sunnyvale PayRam notes (2026-06-09)

- Sunnyvale pivot from Evervault-first checkout to a PayRam Operator showcase
- Use as source of truth when resuming work

## Codebase verification run

- Stack: Next.js 15 + React 19 + TypeScript, deployed to Cloudflare Pages (`@cloudflare/next-on-pages`).
- Checkout UI entry point: `src/app/checkout/page.tsx` renders `CheckoutForm`.
- Current checkout implementation: `src/components/CheckoutForm.tsx` uses `@evervault/react` (`EvervaultProvider` + `Card`) and posts to ACP checkout session APIs.
- Current backend payment execution: `src/app/api/checkout_sessions/[id]/complete/route.ts` calls `routeToPSP` from `src/lib/psp-router.ts`.
- Current PSP switch: `ACTIVE_PSP` supports `aci`, `stripe`, and `braintree` (plus related env bindings in `src/lib/types.ts` and `src/lib/kv.ts`). These relate to the "New card" and "Saved card" buttons in the checkout form.

## External PayRam context used for this pivot

- PayRam is API-first operator software, not a browser widget library.
- The PayRam TS/JS SDK is server-side npm-based, not a lib or script tag.
- PayRam operator mode is multi-merchant and reference-driven (`reference_id`, `merchant_id`) with webhook-based reconciliation (`payment.confirmed`).
- PayRam supports hosted checkout and payment-link style flows.
- PayRam is suited for backend-driven storefront redirect.
- PayRam is not suited for direct browser card collection.

## Decisions

We are adding PayRam to Sunnyvale's checkout, while preserving existing Evervault/Braintree code.

### No browser PayRam SDK

Do not load a public PayRam browser script in the storefront. The storefront should not try to act as the PayRam SDK host.

### Backend-driven PayRam checkout

Use a Sunnyvale backend route to call the PayRam Operator and return a hosted checkout URL or redirect target to the browser.

- Operator base example: `https://payram.laetzer.com`
- Operator route example: `/api/v3/payments/create_payment`
- Auth: bearer key from server-side env only
- Include structured `reference_id` and `metadata` for telemetry and reconciliation
- Frontend behavior: click button, POST to Sunnyvale backend, redirect to returned PayRam URL

### Preserve the Evervault card rail

Keep the existing Evervault card checkout working as the normal card showcase, so the demo has a direct comparison between:

- a normal tokenized card payment,
- and a PayRam-backed crypto onramp.

## Implementation sequence

1. Verify the current PayRam docs and context7 MCP notes before changing code.
2. Keep or restore the Evervault card route so normal card checkout still works.
3. Make PayRam button call a Sunnyvale backend route.
4. Have the backend call the PayRam Operator and return a hosted checkout URL.
5. Keep Braintree / Stripe / ACI logic intact so the storefront remains switchable.

## Open items to confirm before coding deeper

**Resolved 2026-06-10:**

- **Operator response shape:** The PayRam Operator returns a JSON body that includes a hosted checkout URL. The Sunnyvale backend route (`/api/payram/create_payment`) probes the response for `payment_url`, `checkout_url`, and `url` in that priority order. The first non-empty string is returned to the browser as `{ payment_url }`. If none is present the route returns HTTP 502 with the raw operator response for debugging.

- **Redirect vs. session object:** We return a direct redirect URL. The browser does not hold a session object - it receives `payment_url` and navigates to it immediately. No client-side session state is needed because the payment lifecycle is managed on the PayRam operator side.

- **Webhook-to-confirmation mapping:** Not implemented in this iteration. PayRam sends `payment.confirmed` webhooks to the operator; Sunnyvale does not currently have a webhook receiver. The cart is cleared optimistically on redirect. A future `/api/payram/webhook` route can update inventory and emit a Sunnyvale confirmation event when that is needed for the demo.

## Environment variables

- `PAYRAM_OPERATOR_BASE_URL`
- `PAYRAM_MERCHANT_ID`
- `PAYRAM_MERCHANT_KEY`
- `PAYRAM_DEFAULT_CHAIN`
- `PAYRAM_DEFAULT_CURRENCY`

No PayRam browser SDK environment variables are required.

## Correct implementation path

### How to integrate the Agent Lab PayRam instance correctly into an existing shop

Use this pattern when adding PayRam to a storefront that already has a normal card checkout:

1. Keep the storefront card rail intact. (Example: For Sunnyvale store, that meant the Evervault checkout remained, as the normal card payment option alongside PayRam.)
2. Let the PayRam button only start a backend request. The browser does not collect card details for PayRam and does not load a PayRam client script.
3. Have the backend call the PayRam Operator with `PAYRAM_OPERATOR_BASE_URL`, `PAYRAM_MERCHANT_ID`, and `PAYRAM_MERCHANT_KEY`.
4. Pass structured merchant metadata such as `reference_id`, order number, store slug, and customer identifiers through the backend request.
5. Return a hosted checkout URL or redirect target from the backend.
6. Redirect the browser to the PayRam-hosted experience.
7. Receive the confirmation back in Sunnyvale through the normal success / webhook path and then update inventory, metrics, and confirmation screens.

Use that same "operator-mode pattern" for any future test shops (Evevault or not, existing card rails or not): keep the storefront simple, keep the merchant key server-side, let the backend broker the PayRam session. 

## Cloudflare deployment note

Because Sunnyvale is deployed through Cloudflare Pages, the PayRam environment variables must be configured in the Cloudflare project settings and in local `.env` for development.

- Server-side only: `PAYRAM_OPERATOR_BASE_URL`, `PAYRAM_MERCHANT_ID`, `PAYRAM_MERCHANT_KEY`, `PAYRAM_DEFAULT_CHAIN`, `PAYRAM_DEFAULT_CURRENCY`
- Local development template: `.env.example` (User: if absolutely needed, add real values to `.env`, but never `.env.example`, as the former is excluded from the public repo. Better approach: track values in a vault.)

Keep the PayRam merchant key out of browser-exposed variables. The storefront should only talk to its own backend route, and the backend should talk to the PayRam Operator.

## evidence

- `src/app/checkout/page.tsx`
- `src/components/CheckoutForm.tsx`
- `src/app/api/checkout_sessions/route.ts`
- `src/app/api/checkout_sessions/[id]/complete/route.ts`
- `src/app/api/payram/create_payment/route.ts`
- `src/lib/psp-router.ts`
- `src/lib/kv.ts`
- `src/lib/types.ts`
- `README.md`
- https://www.payram.com/operator
- https://docs.payram.com/onboarding-guide/testing-payment-links
- https://docs.payram.com/features/payment-links
- https://docs.payram.com/features/card-to-crypto-fiat-onramp
- https://docs.payram.com/support/change-log
- https://mcp.payram.com/
