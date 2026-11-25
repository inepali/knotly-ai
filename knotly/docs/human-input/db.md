# Human input inbox — db-agent
Statuses: [OPEN] · [ANSWERED] · [DONE]. Secrets go in .env.local, never here.

### [OPEN] DB-000 · <short title>
- **Needed for:** <requirement ID / task>
- **What exactly:** <value, account, or decision>
- **Where to put it:** <.env.local → VAR_NAME | reply here>
- **Blocking?** no — continuing with <mock/stub> | yes — <what>
- **Answer:**

---
## Requests

### [OPEN] DB-001 · Default contract template text
- **Needed for:** VW-6 (contract_templates); GAP Q-12
- **What exactly:** Lawyer-reviewed default contract body (markdown with the spec §7 placeholders), or a decision that vendors must always write/paste their own. I won't draft legal text.
- **Where to put it:** reply here (or add the file at `docs/legal/default-contract.md`)
- **Blocking?** no — `contract_templates` has no default row; a vendor without a template can't send contracts (the agent escalates)
- **Answer:**

### [OPEN] DB-002 · Fix vendor_availability primary key
- **Needed for:** VW-4 (vendor calendar: block dates), booking holds
- **What exactly:** Approval to replace the primary key `(vendor_id, date, status, thread_id)`. Postgres makes every PK column NOT NULL, so a vendor can't block a date without a thread. Plan: add `id uuid` PK, keep a unique index on `(vendor_id, date, status, coalesce(booking_id, thread_id))`, make `thread_id` nullable. Existing rows are kept unchanged. This changes a constraint on a table holding data, so it needs your OK.
- **Where to put it:** reply here ("approved" / "no")
- **Blocking?** no — holds can still be written with a thread id; blocking dates waits for this
- **Answer:**

### [OPEN] DB-003 · Turn on leaked-password protection
- **Needed for:** Auth hardening (Supabase security advisor `auth_leaked_password_protection`)
- **What exactly:** In the Supabase dashboard (dev, and later prod): Authentication → Policies/Passwords → enable "Leaked password protection" (checks HaveIBeenPwned). Dashboard setting, not a migration.
- **Where to put it:** reply here when done
- **Blocking?** no
- **Answer:**
