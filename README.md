# Sunnyvale Onions & Honey

**Sunnyvale Onions & Honey** is a full-stack ecommerce shop for a farmer selling boutique onions and specialty honey online:

- Modern storefront for human shoppers
- **Ag**entic commerce via ACP discovery and checkout APIs
- PSP portability through one routing switch
- Evervault relay-based payment routing patterns
- Cloudflare-first deployment using OpenNext on Workers

## Implemention summary

- Next.js app with App Router pages: `/`, `/products`, `/products/[sku]`, `/cart`, `/checkout`, `/confirmation`
- Product catalog with 24 items (12 onions, 12 honey)
- JSON-LD product metadata on product detail pages
- ACP manifest at `/.well-known/acp.json`
- API endpoints: `GET /api/products`, `POST /api/checkout_sessions`, `GET /api/checkout_sessions/:id`, `PATCH /api/checkout_sessions/:id`, `POST /api/checkout_sessions/:id/complete`
- PSP router for ACI and Stripe, controlled by `ACTIVE_PSP`
- Cloudflare KV session flow with local in-memory fallback for development
- `Idempotency-Key` required for checkout completion calls

## Architecture summary

- Frontend pages and API are served by Next.js.
- Checkout sessions are persisted in KV when available.
- Completion calls are routed to the active PSP through Evervault relay domains.
- Agent flows discover capabilities through ACP and use JSON APIs.

## Stack

- Frontend and api: Next.js 15, React 19, TypeScript
- Styling: Tailwind CSS v4
- Deployment target: Cloudflare Workers via OpenNext
- Infra tooling: Wrangler
- Security integration surface: Evervault (relay pattern)
- CMS direction: TinaCMS config is present

## Quick start

Prerequisites:
- Node.js 20+
- npm

Install and run locally:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run start
```

Cloudflare build and deploy:

```bash
npm run cf:build
npm run cf:deploy
```

## Environment setup

Use the provided env template and set real values for:
- EV_API_KEY
- EV_APP_ID
- ACTIVE_PSP
- ACI_RELAY_DOMAIN
- STRIPE_RELAY_DOMAIN
- ACI_ENTITY_ID
- ACI_TOKEN
- STRIPE_SECRET_KEY
- ALLOWED_ORIGINS

Cloudflare notes:
- Set secrets with `wrangler secret put` for sensitive values
- Update `wrangler.toml` with a real KV namespace id for `SESSIONS`
- Cloudflare Pages: add compatibility flag `nodejs_compat`

## Local testing flow

- Open the storefront and add products to cart
- Complete checkout with test card data in demo mode
- Verify API payloads through `/api/products` and checkout session endpoints
- Switch `ACTIVE_PSP` between `aci` and `stripe` to validate routing behavior

Example API checks:

```bash
curl -s http://localhost:3000/api/products
curl -s http://localhost:3000/.well-known/acp.json
```
---

## Notes

- Checkout form uses Evervault UI Components for browser-side card encryption.
- Configure `NEXT_PUBLIC_EVERVAULT_TEAM_ID` and `NEXT_PUBLIC_EVERVAULT_APP_ID`.
- Future: move PSP calls into Evervault Enclave, to remove PSP secrets from CF Worker.
- Current order response uses PSP IDs. Future: separate merchant order model, see below.
- Checkout session persistence uses KV. Future hardening: see below.


## Future

- **Merchant order model** -- introduce a proper order object with its own `order_id`, keeping PSP transaction IDs separate. Needed for reconciliation, refunds, and webhook-driven flows.
- **Durable Objects for checkout sessions** -- move checkout session state from KV (eventually consistent) to a Durable Object or single-coordinator pattern with strict idempotency. KV is a poor fit for mutable transaction records with create/update/complete lifecycle.
- **Product feed enrichment** -- add checkout-eligibility flags, seller policy links, return-policy data, shipping metadata, and absolute media URLs to the `/api/products` feed to align with current commerce feed specs.
- **Order webhooks** -- add `order.created` and `order.updated` webhook delivery for downstream systems and agent confirmation.
- **Stored-credential compliance** -- document card-network stored-credential programme requirements for reusing Evervault-encrypted card data across sessions.
- **Enclave payment broker** -- move PSP credentials from Worker secrets into an Evervault Enclave, leaving only an Evervault-scoped invoke secret in edge runtime.
