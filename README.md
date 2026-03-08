# Sunnyvale Onions & Honey

**Sunnyvale Onions & Honey** is a full-stack ecommerce shop for a farmer selling boutique onions and specialty honey online:

- Modern storefront for human shoppers
- **Ag**entic commerce via ACP discovery and checkout APIs
- PSP portability through one routing switch
- Evervault relay-based payment routing patterns
- Cloudflare Pages deployment using `@cloudflare/next-on-pages`

## implementation summary

- Next.js app with App Router pages: `/`, `/products`, `/products/[sku]`, `/cart`, `/checkout`, `/confirmation`, `/metrics`, `/admin`
- Product catalog with 24 items in Tina-managed `content/products/*.json`
- Generated shared catalog module at `src/content/products.generated.ts`
- JSON-LD product metadata on product detail pages
- ACP manifest at `/.well-known/acp.json`
- API endpoints: `GET /api/products`, `POST /api/checkout_sessions`, `GET /api/checkout_sessions/:id`, `PATCH /api/checkout_sessions/:id`, `POST /api/checkout_sessions/:id/complete`
- PSP router for ACI and Stripe, controlled by `ACTIVE_PSP`
- Delegated Stripe token path via confirmation token or PaymentMethod ID when Stripe is active
- Saved Evervault-encrypted payment payload reuse on the checkout page
- Filterable product explorer and cart-side processor query history
- Metrics dashboard with real checkout timings plus repeatable product/session probe runs
- Tina static admin build served through `/admin`
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
- Deployment target: Cloudflare Pages with `@cloudflare/next-on-pages`
- Infra tooling: Cloudflare Pages Git integration
- Security integration surface: Evervault (relay pattern)
- CMS: Tina-managed local content plus generated static admin assets

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

Build or refresh the Tina admin assets only:

```bash
npm run admin:build
```

Cloudflare Pages local validation:

```bash
npm run pages:build
```

Production deployments are handled by Cloudflare Pages through the connected GitHub repository.

## Environment setup 

Use the provided env template and set real values for:
- EV_API_KEY
- EV_APP_ID
- ACTIVE_PSP
- ACI_RELAY_DOMAIN
- ACI_ENTITY_ID
- ACI_TOKEN
- STRIPE_RELAY_DOMAIN
- STRIPE_SECRET_KEY
- NEXT_PUBLIC_TINA_CLIENT_ID
- ALLOWED_ORIGINS
- ACP_API_KEYS
- NEXT_PUBLIC_ACP_API_KEY

Cloudflare notes:
- Set build variables, secrets, and KV bindings in the Cloudflare Pages project settings
- Bind `SESSIONS` to a KV namespace in Pages settings
- Dynamic routes and API handlers that use server-side Pages bindings must export `runtime = "edge"`

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

- Checkout form supports new encrypted card entry, saved Evervault payload reuse, and delegated Stripe tokens.
- Configure `NEXT_PUBLIC_EVERVAULT_TEAM_ID` and `NEXT_PUBLIC_EVERVAULT_APP_ID`.
- Tina content lives in `content/products/*.json`, and `npm run catalog:generate` refreshes the generated catalog module used by the storefront and ACP feed.
- `/metrics` provides a lightweight demo instrumentation dashboard for checkout timings and API probe throughput.
- Future: move PSP calls into Evervault Enclave, to remove PSP secrets from the Pages edge runtime.
- Current order response uses PSP IDs. Future: separate merchant order model, see below.
- Checkout session persistence uses KV. Future hardening: see below.


## Future

- **Merchant order model** -- introduce a proper order object with its own `order_id`, keeping PSP transaction IDs separate. Needed for reconciliation, refunds, and webhook-driven flows.
- **Durable Objects for checkout sessions** -- move checkout session state from KV (eventually consistent) to a Durable Object or single-coordinator pattern with strict idempotency. KV is a poor fit for mutable transaction records with create/update/complete lifecycle.
- **Product feed enrichment** -- add checkout-eligibility flags, seller policy links, return-policy data, shipping metadata, and absolute media URLs to the `/api/products` feed to align with current commerce feed specs.
- **Order webhooks** -- add `order.created` and `order.updated` webhook delivery for downstream systems and agent confirmation.
- **Stored-credential compliance** -- document card-network stored-credential programme requirements for reusing Evervault-encrypted card data across sessions.
- **Enclave payment broker** -- move PSP credentials from Pages secrets into an Evervault Enclave, leaving only an Evervault-scoped invoke secret in edge runtime.
