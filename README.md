# Sunnyvale Onions & Honey online shop






# Future

- **Merchant order model** -- introduce a proper order object with its own `order_id`, keeping PSP transaction IDs separate. Needed for reconciliation, refunds, and webhook-driven flows.
- **Durable Objects for checkout sessions** -- move checkout session state from KV (eventually consistent) to a Durable Object or single-coordinator pattern with strict idempotency. KV is a poor fit for mutable transaction records with create/update/complete lifecycle.
- **Product feed enrichment** -- add checkout-eligibility flags, seller policy links, return-policy data, shipping metadata, and absolute media URLs to the `/api/products` feed to align with current commerce feed specs.
- **Order webhooks** -- add `order.created` and `order.updated` webhook delivery for downstream systems and agent confirmation.
- **Blog/cross-doc alignment** -- the blog post still references Netlify Functions; update to match the Cloudflare Workers deployment model in the PRD.
- **Stored-credential compliance** -- document card-network stored-credential programme requirements for reusing Evervault-encrypted card data across sessions.
