# Security: public demo hardening

This is an **applied sandbox** -- a public demo storefront on Cloudflare Pages
with UAT-only processors and Evervault. There are no live customers, no live
settlement, and no file upload surface. Raw UAT responses are intentionally
public because they are the educational point of the demo.

The main risks are abuse, noise, scraping, and accidental real-card input --
not live financial loss.

## What may be public

Acceptable to expose as long as everything stays UAT-only and contains no
plaintext secrets:

- raw PSP JSON/XML responses
- expiry dates in demo records
- transaction and merchant transaction ids
- encrypted Evervault PAN tokens and token previews
- metrics, timings, and processor step summaries

## What must never be public

- plaintext PAN or CVV -- anywhere: UI, logs, debug pages
- secret keys, PATs, or processor credentials

## Abuse scenarios

### 1. Scraping

The app reads from KV and renders vault records, transaction ids, ciphertext
payloads, and raw processor responses publicly. That is acceptable within
limits, but must be bounded so scraping cannot build a large archive of demo
activity.

### 2. PSP query proxy

The processor lookup endpoints let anyone query UAT transaction status through
the merchant's credentials without standing up their own integration.

### 3. Checkout spam

The browser ships a public ACP bearer key. A third party can script session
creation, completion attempts, and repeated UAT authorisations -- burning
quotas and cluttering the test environment.

### 4. Accidental real-card input and XSS

Without a CSP, an XSS path gives full browser-side access: localStorage,
saved Evervault payloads, the public ACP key, and the ability to modify the UI
or fire requests as the visitor.

Separately, if someone mistakenly enters a live card, the site must not echo
that PAN or CVV back into any public surface.

## Risk calibration

| Item | Prod | Demo | Why it matters here |
|---|---|---|---|
| Public vault and debug surfaces | critical | medium | Bounded scraping is fine; unbounded archiving is not |
| Missing rate limiting | high | high | Most realistic abuse path: noise, compute cost, UAT pollution |
| Missing CSP / browser headers | high | medium | Raises the blast radius of any injection |
| Browser-shipped ACP bearer key | high | medium | Easy automation, but impact is UAT noise |
| CVV in localStorage | high | low-medium | Encrypted, but poor hygiene |
| <span style="text-decoration:line-through">Public</span> Tina admin + vulnerable deps | medium | low-medium | Unnecessary attack surface |

## Objectives

Reduce the abuse surface enough for wider public sharing without enabling
route spam, unbounded scraping, or avoidable browser compromise.

Preserve the demo value:

- Evervault-encrypted checkout
- merchant-owned reusable ciphertext
- switchable PSP routing
- ACP and agent shopping
- public educational UAT responses

## Non-goals

- production-grade checkout architecture
- customer identity system
- compliance claims beyond technical hardening
- eliminating all automated abuse on a public domain

## Priority

### Must-fix

1. request throttling for checkout and query routes
2. cap vault and metrics entry count and age
3. no plaintext PAN or CVV rendered or logged anywhere
4. CSP and browser hardening headers
5. lock down `/admin`

### Should-fix next

1. stop persisting CVV in browser-saved payment payloads
2. tighten CORS failure behaviour
3. upgrade Tina and Next dependency chains

### Deferred

1. deeper auth redesign for the browser-to-ACP path
2. broader dependency cleanup
3. advanced bot detection beyond rate limits
