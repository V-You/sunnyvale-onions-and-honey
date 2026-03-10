# PRD: public demo abuse and security hardening

> Date: 2026-03-10
> Status: draft
> Type: security hardening plan for a public UAT demo
> Base repo: `sunnyvale-onions-and-honey`

## Purpose

Practical implementation plan for **Sunnyvale Onions & Honey**. Not a production security standard. Specific deployment:

- public website on Cloudflare Pages
- demo-only storefront
- UAT processors and UAT Evervault setup
- no live customer accounts and no live settlement flows

Key framing:

- this is an **applied sandbox**, not a disguised production store
- public raw UAT responses are part of the educational value of the demo
- the main risk is abuse, noise, scraping, and accidental real-card input