# Sunnyvale Onions & Honey

**[Sunnyvale Onions & Honey](https://sunnyvale-onions-and-honey.pages.dev/)** is a full-stack ecommerce shop for a farmer selling boutique onions and specialty honey online:

- Modern storefront for human shoppers
- **Ag**entic commerce via ACP discovery and checkout APIs
- PSP portability through one routing switch
- Evervault relay-based payment routing patterns
- Cloudflare Pages deployment using `@cloudflare/next-on-pages`

## Implementation summary

- Next.js app with App Router pages: `/`, `/products`, `/products/[sku]`, `/cart`, `/checkout`, `/confirmation`, `/metrics`, `/admin`
- Product catalog with 24 items in Tina-managed `content/products/*.json`
- Generated shared catalog module at `src/content/products.generated.ts`
- JSON-LD product metadata on product detail pages
- ACP manifest at `/.well-known/acp.json`
- API endpoints: `GET /api/products`, `POST /api/checkout_sessions`, `GET /api/checkout_sessions/:id`, `PATCH /api/checkout_sessions/:id`, `POST /api/checkout_sessions/:id/complete`
- PSP router for ACI and Stripe, controlled by `ACTIVE_PSP`
- Delegated Stripe token path via confirmation token or PaymentMethod ID when Stripe is active
- Merchant-side demo saved payment method exposed in checkout session responses for ACP clients
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

## ACP status

The demo now implements a meaningful ACP surface across discovery, checkout,
delegated payment, seller-backed saved cards, customer-linked handler scoping,
and a first authentication hook for 3DS-style flows.

Current ACP capability state by implementation phase:

1. **Phase 1 - discovery and versioning**: `/.well-known/acp.json` is served by
  the app router, ACP endpoints require `API-Version`, and the ACP routes are
  CORS-aware.
  Limitation: discovery is REST-only, does not expose MCP transport, and does
  not yet advertise signing keys, request-signature requirements, or richer
  extension metadata.
2. **Phase 2 - capability negotiation and handler declarations**: checkout
  session create, retrieve, and update return ACP-shaped cart state with
  `capabilities.payment_methods`, negotiated intervention support, and
  `capabilities.payment.handlers`.
  Limitation: the response is still a hybrid compatibility shape because legacy
  fields remain present for the human storefront and older internal callers.
3. **Phase 3 - delegated payment and handler-based completion**: the demo now
  supports `POST /api/agentic_commerce/delegate_payment`, delegated token
  storage, and ACP-native completion with `payment_data.handler_id` plus SPT
  credentials.
  Limitation: delegated tokens are demo-scoped records in KV rather than real
  PSP-issued shared payment tokens or a hardened long-lived vault service.
4. **Phase 4 - customer-linked seller-backed saved cards**: seller-backed saved
  card handlers are now filtered by resolved merchant customer and only expose
  active, non-disabled, non-expired records for that session.
  Limitation: merchant customer identity is still a demo mapping from
  `buyer.email`, not a real merchant account/login or identity-linking flow.
5. **Phase 5 - authentication and 3DS hardening**: handlers can now advertise
  `supports_3ds`, discovery exposes `3ds` as an intervention type, delegated
  completions can transition into `authentication_required`, session responses
  include `authentication_metadata`, and completion accepts
  `authentication_result` on the second call.
  Limitation: this is a protocol-shaped demo hook, not a full
  `delegate_authentication` implementation. There is no real issuer/browser
  challenge lifecycle yet, and 3DS requirement is simulated from delegated
  payment metadata and risk signals rather than a live directory server.

Additional ACP caveats that still apply:

- The human checkout UI still uses the legacy completion payload, so the ACP
  handler flow and the storefront flow intentionally coexist for now.
- Policy links, fulfillment detail richness, and post-purchase webhooks are not
  yet fully fleshed out in the ACP response model.
- The demo is best viewed as an ACP alignment and architecture prototype, not a
  claim of full conformance with every current ACP and delegate-authentication
  RFC.

## Stack

- Evervault for widget and PCI data (dual-custody encryption)
- Works around vendor lock-in (see also https://www.linkedin.com/feed/update/urn:li:activity:7434222367046000640)
- TinaCMS with GraphQL API and ACP support, manages local content plus generated static admin assets
- Custom cart (using localStorage)
- Evervault SDK for streamlining and making switching PSPs even easier
- "Evervault Architect MCP" (not affiliated with Evervault), during development:
  - Allows dev to prompt in their IDE "Add ACI Worldwide to my payment flow," the Architect MCP tells the LLM exactly which Evervault Relay configurations are needed.
  - Streamlines setup and configuration of the online shopping workflow.
  - Helps building an Evervault-secured shop. An AI coding agent uses it to build a shop for other AIs to buy from.
- Frontend and API: Next.js 15, React 19, TypeScript
- Styling: Tailwind CSS v4
- Deployment target: Cloudflare Pages with `@cloudflare/next-on-pages`
- Infra tooling: Cloudflare Pages Git integration
- Custom: PSP adapters (needed per Relay)

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
- **Customer-linked merchant vault** -- evolve the demo merchant-side saved payment method into a real customer-linked saved payment catalog so agents can request stored cards by merchant customer ID instead of relying on browser localStorage.
- **Durable Objects for checkout sessions** -- move checkout session state from KV (eventually consistent) to a Durable Object or single-coordinator pattern with strict idempotency. KV is a poor fit for mutable transaction records with create/update/complete lifecycle.
- **Product feed enrichment** -- add checkout-eligibility flags, seller policy links, return-policy data, shipping metadata, and absolute media URLs to the `/api/products` feed to align with current commerce feed specs.
- **Order webhooks** -- add `order.created` and `order.updated` webhook delivery for downstream systems and agent confirmation.
- **Stored-credential compliance** -- document card-network stored-credential programme requirements for reusing Evervault-encrypted card data across sessions.
- **Enclave payment broker** -- move PSP credentials from Pages secrets into an Evervault Enclave, leaving only an Evervault-scoped invoke secret in edge runtime.
- **Add UCP / AP2 support**, alongside ACP.
- **Actual Agentic Shopping** -- since that part does not work at all from shopper point of view, despite widely publicized E2E payments that were allegedly done, or blog postings describing API behavior and outlooks. The actual clients that a regular shopper has access to today refuse to go further than selecting items and filling the cart. Most go via the web page which is painfully slow. Revisit some time later.
  - https://www.agenticcommerce.dev/docs/reference/checkout
  - https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
  - https://opascope.com/insights/ai-shopping-assistant-guide-2026-agentic-commerce-protocols/#acp-vs-ucp-comparing-ai-commerce-protocols
  - https://www.griddynamics.com/blog/agentic-payments