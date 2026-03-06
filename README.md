# Sunnyvale Onions & Honey online shop

Sunnyvale Onions & Honey is a full-stack ecommerce demo for a farmer selling boutique onions and specialty honey online.

The project demonstrates:
- Modern storefront for human shoppers
- Agent-friendly commerce via ACP discovery and checkout APIs
- PSP portability between ACI and Stripe through one routing switch
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

- frontend and api: Next.js 15, React 19, TypeScript
- styling: Tailwind CSS v4
- deployment target: Cloudflare Workers via OpenNext
- infra tooling: Wrangler
- security integration surface: Evervault (relay pattern)
- cms direction: TinaCMS config is present

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

## Implementation notes

- Checkout form is currently demo-mode card input.
- Production intent is browser-side tokenization/encryption with Evervault UI components.
- Current order response uses PSP IDs directly. Future separate merchant order model: see below.
- Checkout session persistence uses KV. Future hardening: see below.

---

# Future

- **Merchant order model** -- introduce a proper order object with its own `order_id`, keeping PSP transaction IDs separate. Needed for reconciliation, refunds, and webhook-driven flows.
- **Durable Objects for checkout sessions** -- move checkout session state from KV (eventually consistent) to a Durable Object or single-coordinator pattern with strict idempotency. KV is a poor fit for mutable transaction records with create/update/complete lifecycle.
- **Product feed enrichment** -- add checkout-eligibility flags, seller policy links, return-policy data, shipping metadata, and absolute media URLs to the `/api/products` feed to align with current commerce feed specs.
- **Order webhooks** -- add `order.created` and `order.updated` webhook delivery for downstream systems and agent confirmation.
- **Blog/cross-doc alignment** -- the blog post still references Netlify Functions; update to match the Cloudflare Workers deployment model in the PRD.
- **Stored-credential compliance** -- document card-network stored-credential programme requirements for reusing Evervault-encrypted card data across sessions.
