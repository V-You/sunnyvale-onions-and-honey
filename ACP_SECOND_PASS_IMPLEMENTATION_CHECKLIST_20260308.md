# ACP second-pass implementation checklist

> Date: 2026-03-08
> Scope: exact API shape changes for the ACP-focused second pass
> Companion planning doc: `md/Sunnyvale-OH_PRD_ACP_second-pass_20260308.md`

## purpose

This document turns the ACP second-pass PRD into an implementation checklist
with concrete endpoint contracts and repo-level work items.

This is intentionally ACP-only. UCP is out of scope for this checklist.

## checked references

- `https://www.agenticcommerce.dev/docs`
- `agentic-commerce-protocol/agentic-commerce-protocol`
- `rfcs/rfc.discovery.md`
- `rfcs/rfc.capability_negotiation.md`
- `rfcs/rfc.agentic_checkout.md`
- `rfcs/rfc.payment_handlers.md`
- `rfcs/rfc.delegate_payment.md`
- `rfcs/rfc.seller_backed_payment_handler.md`

## target protocol posture

The repo should move from a custom ACP-lite checkout shape to a more ACP-native
surface with these properties:

1. Discovery is platform-level and served from `/.well-known/acp.json`.
2. Checkout session creation accepts agent `capabilities`.
3. Checkout session responses always return seller `capabilities`.
4. Session responses include `capabilities.payment_methods` and
   `capabilities.payment.handlers`.
5. Saved merchant-side cards are expressed as
   `dev.acp.seller_backed.saved_card` handlers, not custom session fields.
6. Delegation happens through `/agentic_commerce/delegate_payment`.
7. Checkout completion uses `payment_data.handler_id` plus an instrument with a
   delegated token.

## versioning stance

Use additive compatibility at first.

- Discovery should advertise the latest supported ACP version and all supported
  versions.
- Server should require `API-Version` on ACP requests.
- Recommended initial support set for this repo:
  - `2026-01-16`
  - `2026-01-30`
- Recommended latest advertised version:
  - `2026-01-30`

## endpoint changes

## 1. discovery document

### current problem

The current `/.well-known/acp.json` is a minimal manifest and does not expose:

- `protocol`
- `api_base_url`
- `transports`
- platform-level `capabilities.services`

### target route

- existing path remains: `GET /.well-known/acp.json`

### target response shape

```json
{
  "protocol": {
    "name": "acp",
    "version": "2026-01-30",
    "supported_versions": ["2026-01-16", "2026-01-30"],
    "documentation_url": "https://www.agenticcommerce.dev/docs"
  },
  "api_base_url": "https://sunnyvale-onions-and-honey.pages.dev/api",
  "transports": ["rest"],
  "capabilities": {
    "services": ["checkout", "delegate_payment"],
    "intervention_types": ["3ds", "address_verification"]
  }
}
```

### required behavior

- no authentication required
- include `Cache-Control: public, max-age=3600`
- do not include merchant-specific payment methods or handlers

### repo work

- [ ] replace the current static discovery document shape in `public/.well-known/acp.json`
- [ ] if static generation becomes too limiting, move to a route-backed response
      that still stays unauthenticated and cacheable

## 2. create checkout session

### current problem

The current route accepts a custom body and returns a custom session object with
ad hoc payment fields.

### target route

- existing path remains: `POST /api/checkout_sessions`

### target request shape

Canonical ACP-aligned request for this repo:

```json
{
  "items": [
    { "id": "honey_04", "quantity": 1 },
    { "id": "onion_04", "quantity": 1 }
  ],
  "buyer": {
    "email": "buyer@example.com"
  },
  "capabilities": {
    "interventions": {
      "supported": [],
      "display_context": "webview",
      "redirect_context": "in_app",
      "max_interaction_depth": 1
    }
  }
}
```

### migration rules

- `items[].id` becomes canonical
- temporarily accept the current legacy shape using `sku` during migration
- `capabilities` is required for ACP-native callers
- if `API-Version` is missing or unsupported, return `400` with
  `supported_versions`

### target response shape

```json
{
  "id": "checkout_session_123",
  "status": "ready_for_payment",
  "currency": "usd",
  "capabilities": {
    "payment_methods": [
      {
        "method": "card",
        "brands": ["visa", "mastercard", "amex"],
        "funding_types": ["credit", "debit"]
      }
    ],
    "interventions": {
      "supported": [],
      "required": [],
      "enforcement": "conditional"
    },
    "payment": {
      "handlers": [
        {
          "id": "card_primary",
          "name": "dev.acp.tokenized.card",
          "version": "2026-01-22",
          "spec": "https://acp.dev/specs/handlers/card",
          "requires_delegate_payment": true,
          "requires_pci_compliance": false,
          "psp": "stripe",
          "config_schema": "https://acp.dev/schemas/handlers/card/config.json",
          "instrument_schemas": [
            "https://acp.dev/schemas/handlers/card/instrument.json"
          ],
          "config": {
            "merchant_id": "sunnyvale-oh",
            "psp": "stripe",
            "accepted_brands": ["visa", "mastercard", "amex"],
            "accepted_funding_types": ["credit", "debit"],
            "supports_3ds": true,
            "environment": "production"
          },
          "display_order": 0
        },
        {
          "id": "seller_pm_demo_4242",
          "name": "dev.acp.seller_backed.saved_card",
          "version": "2026-02-05",
          "spec": "https://acp.dev/handlers/seller_backed/saved_card",
          "requires_delegate_payment": true,
          "requires_pci_compliance": false,
          "psp": "seller_managed",
          "config_schema": "https://acp.dev/schemas/handlers/seller_backed/saved_card/config.json",
          "instrument_schemas": [
            "https://acp.dev/schemas/handlers/seller_backed/saved_card/instrument.json"
          ],
          "config": {
            "merchant_id": "sunnyvale-oh",
            "psp": "seller_managed",
            "payment_method_id": "merchant_demo_saved_card_stripe_primary",
            "display_name": "Visa ending in 4242",
            "display_metadata": {
              "brand": "visa",
              "last4": "4242"
            },
            "supports_3ds": false
          },
          "display_order": 1
        }
      ]
    }
  },
  "line_items": [
    {
      "id": "line_item_honey_04",
      "item": { "id": "honey_04", "quantity": 1 },
      "base_amount": 4500,
      "discount": 0,
      "subtotal": 4500,
      "tax": 0,
      "total": 4500,
      "name": "The Hive's Secret"
    }
  ],
  "totals": [
    { "type": "items_base_amount", "display_text": "Item(s) total", "amount": 4500 },
    { "type": "subtotal", "display_text": "Subtotal", "amount": 4500 },
    { "type": "tax", "display_text": "Tax", "amount": 0 },
    { "type": "total", "display_text": "Total", "amount": 4500 }
  ],
  "messages": [],
  "links": [
    {
      "type": "terms_of_use",
      "url": "https://sunnyvale-onions-and-honey.pages.dev/terms"
    }
  ]
}
```

### required behavior

- return authoritative cart state, not a thin session stub
- include `capabilities.payment_methods`
- include `capabilities.payment.handlers`
- compute `capabilities.interventions.supported` as intersection with agent
  capabilities
- only include seller-backed saved card handlers for the active customer/session
- keep legacy fields only as transitional aliases

### fields to deprecate

- `allowed_payment_methods`
- `merchant_saved_payment_methods`

### repo work

- [ ] update `src/lib/types.ts` to add ACP-native request and response models
- [ ] update `src/app/api/checkout_sessions/route.ts` to parse ACP-native create
      requests
- [ ] add a response-shaping helper for line items, totals, messages, and
      handler declarations
- [ ] add a capability-negotiation helper that computes intervention
      intersection

## 3. delegate payment

### current problem

No `delegate_payment` endpoint exists yet, so the repo cannot follow the
handler-driven delegation flow expected by ACP.

### target route

- new route: `POST /api/agentic_commerce/delegate_payment`

### target request shape for seller-backed saved card

```json
{
  "handler_id": "seller_pm_demo_4242",
  "payment_method": {
    "type": "seller_backed_saved_card"
  },
  "allowance": {
    "reason": "one_time",
    "max_amount": 4500,
    "currency": "usd",
    "checkout_session_id": "checkout_session_123",
    "merchant_id": "sunnyvale-oh",
    "expires_at": "2026-03-08T21:00:00Z"
  },
  "risk_signals": [
    { "type": "card_testing", "score": 10, "action": "authorized" }
  ],
  "metadata": {
    "handler_id": "seller_pm_demo_4242",
    "checkout_session_id": "checkout_session_123"
  }
}
```

### target success response shape

```json
{
  "id": "vt_01J8Z3WXYZ9ABC",
  "created": "2026-03-08T20:55:00Z",
  "metadata": {
    "source": "agent_checkout",
    "merchant_id": "sunnyvale-oh",
    "handler_id": "seller_pm_demo_4242",
    "checkout_session_id": "checkout_session_123"
  }
}
```

### required behavior

- require ACP auth
- require `API-Version`
- validate `handler_id` against the session-advertised handlers
- validate allowance bounds against the session total and currency
- mint a short-lived delegated token scoped to session, handler, merchant, and
  amount
- store audit metadata for later completion validation
- do not expose raw card data or browser-local saved payloads

### storage requirements

- token id
- checkout session id
- handler id
- merchant id
- max amount
- currency
- expiry
- source metadata

### repo work

- [ ] add `src/app/api/agentic_commerce/delegate_payment/route.ts`
- [ ] add a token store helper, initially KV-backed with short TTL
- [ ] add handler-resolution helpers for seller-backed saved card selection
- [ ] add request validation helpers for allowance and risk signals

## 4. complete checkout session

### current problem

Completion currently accepts a custom `payment_method` object instead of the
ACP-native `payment_data` shape.

### target route

- existing path remains: `POST /api/checkout_sessions/{id}/complete`

### target request shape for tokenized card

```json
{
  "buyer": {
    "email": "buyer@example.com"
  },
  "payment_data": {
    "handler_id": "card_primary",
    "instrument": {
      "id": "inst_card_primary_001",
      "handler_id": "card_primary",
      "type": "card",
      "credential": {
        "type": "spt",
        "token": "vt_01J8Z3WXYZ9ABC"
      }
    }
  }
}
```

### target request shape for seller-backed saved card

```json
{
  "payment_data": {
    "handler_id": "seller_pm_demo_4242",
    "instrument": {
      "id": "inst_saved_card_001",
      "handler_id": "seller_pm_demo_4242",
      "type": "seller_backed_saved_card",
      "credential": {
        "type": "spt",
        "token": "vt_01J8Z3WXYZ9ABC"
      }
    }
  }
}
```

### target success response shape

```json
{
  "id": "checkout_session_123",
  "status": "completed",
  "currency": "usd",
  "line_items": [
    {
      "id": "line_item_honey_04",
      "item": { "id": "honey_04", "quantity": 1 },
      "base_amount": 4500,
      "discount": 0,
      "subtotal": 4500,
      "tax": 0,
      "total": 4500,
      "name": "The Hive's Secret"
    }
  ],
  "totals": [
    { "type": "items_base_amount", "display_text": "Item(s) total", "amount": 4500 },
    { "type": "subtotal", "display_text": "Subtotal", "amount": 4500 },
    { "type": "tax", "display_text": "Tax", "amount": 0 },
    { "type": "total", "display_text": "Total", "amount": 4500 }
  ],
  "messages": [],
  "links": [
    {
      "type": "terms_of_use",
      "url": "https://sunnyvale-onions-and-honey.pages.dev/terms"
    }
  ],
  "order": {
    "id": "ord_abc123",
    "checkout_session_id": "checkout_session_123",
    "permalink_url": "https://sunnyvale-onions-and-honey.pages.dev/confirmation?order_id=ord_abc123"
  }
}
```

### required behavior

- require ACP auth
- require `API-Version`
- require `payment_data.handler_id`
- require delegated token credential for handlers with
  `requires_delegate_payment: true`
- validate delegated token against session id, handler id, amount, currency, and
  expiry
- for seller-backed saved card, resolve `handler_id` to the underlying merchant
  payment method id and charge on seller rails
- when authentication is needed, return the appropriate non-completed state and
  required authentication metadata instead of forcing a blind failure
- return an `order` object, not only PSP transaction identifiers

### migration rules

- continue accepting the current legacy `payment_method` payload during a
  transition period
- internally map legacy payloads into handler-based completion paths where
  possible
- mark legacy completion types as deprecated in comments and docs

### repo work

- [ ] update `src/app/api/checkout_sessions/[id]/complete/route.ts` to parse
      `payment_data`
- [ ] add handler-to-processor resolution logic
- [ ] add delegated token verification
- [ ] shape ACP-native completion responses with `order` metadata
- [ ] preserve existing confirmation-page compatibility while the frontend is
      still query-string based

## 5. shared implementation tasks

- [ ] add ACP version negotiation helper
- [ ] add ACP error response helper for invalid request / unsupported version /
      missing authentication result
- [ ] add `messages[]` and `links[]` response shaping helpers
- [ ] add order-shaping helper so completion returns merchant order metadata
- [ ] add comments marking custom stopgap fields as deprecated

## 6. file-level plan

- [ ] `public/.well-known/acp.json`
      upgrade to discovery RFC shape
- [ ] `src/lib/types.ts`
      add ACP-native discovery, session, handler, payment data, and delegate
      token types
- [ ] `src/app/api/checkout_sessions/route.ts`
      parse ACP create request and emit ACP session response
- [ ] `src/app/api/checkout_sessions/[id]/complete/route.ts`
      parse ACP completion request and emit ACP completion response
- [ ] `src/app/api/agentic_commerce/delegate_payment/route.ts`
      add delegate payment endpoint
- [ ] `src/lib/merchant-saved-payment-methods.ts`
      evolve from stopgap custom helper into handler-instance source data
- [ ] `src/lib/kv.ts`
      optionally extend storage helpers for delegated token persistence
- [ ] `README.md`
      update API examples after the ACP-native surface is implemented

## 7. backward compatibility gates

Do not remove these until the ACP-native flow is proven:

- legacy thin checkout session response fields
- legacy custom merchant-side saved payment session fields
- legacy `payment_method` completion payloads
- current human checkout form behavior

## 8. validation checklist

- [ ] discovery document validates against the intended ACP discovery shape
- [ ] create session works with `API-Version: 2026-01-30`
- [ ] create session rejects missing `API-Version` cleanly
- [ ] capability intersection is correct when agent supports no interventions
- [ ] capability intersection is correct when agent supports `3ds`
- [ ] card tokenized handler is emitted correctly
- [ ] seller-backed saved card handler is emitted only for the relevant customer
- [ ] delegate payment mints a token bound to session, handler, amount, and
      currency
- [ ] completion succeeds for tokenized card using delegated token
- [ ] completion succeeds for seller-backed saved card using delegated token
- [ ] completion rejects mismatched handler id / token combinations
- [ ] completion returns `order.id`, `order.checkout_session_id`, and
      `order.permalink_url`
- [ ] existing human checkout still works during migration

## 9. explicit stopgap items to remove later

- custom `merchant_saved_payment_methods` session field
- custom `merchant_saved_payment` completion payload type
- ACP-lite reliance on only `allowed_payment_methods`

## 10. implementation order

1. discovery upgrade
2. create session capability negotiation
3. tokenized card handler declarations
4. seller-backed saved card handler declarations
5. delegate payment endpoint
6. completion with `payment_data`
7. legacy compatibility bridge cleanup
