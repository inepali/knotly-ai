# Human input inbox — ui-agent
Statuses: [OPEN] · [ANSWERED] · [DONE]. Secrets go in .env.local, never here.

### [OPEN] UI-000 · <short title>
- **Needed for:** <requirement ID / task>
- **What exactly:** <value, account, or decision>
- **Where to put it:** <.env.local → VAR_NAME | reply here>
- **Blocking?** no — continuing with <mock/stub> | yes — <what>
- **Answer:**

---
## Requests

### [OPEN] UI-PC1 · Cloudflare Turnstile for the public-page chat contact card
- **Needed for:** vendor-public-agent-chat-spec.md (lead capture: "Honeypot field plus Cloudflare Turnstile on submit")
- **What exactly:** a Turnstile site key + secret for knotly.net, and a yes/no on adding it. Leads now cost vendors $1, so bot submits cost real money.
- **Where to put it:** .env.local → NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
- **Blocking?** no — shipping with a honeypot, per-IP/per-vendor caps, a disposable-email block, and "flagged" (free, unverified) leads when one address hits 5+ vendors a day.
- **Answer:**

### [OPEN] UI-PC2 · Phone verification on public-page leads
- **Needed for:** vendor-public-agent-chat-spec.md, open question 3 (TBD)
- **What exactly:** decide whether the contact card's phone number must be verified (NumID) before the lead is charged.
- **Where to put it:** reply here
- **Blocking?** no — phone is optional and unverified for v1.
- **Answer:**
