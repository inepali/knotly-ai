# db-agent status
**Updated:** 2026-10-05 · **Phase:** 0 — Foundation · **Branch:** agent/db

## Done
- Migrations `20261005130000`–`20261005130700` written **and applied to knotly-dev** (dev only):
  extend existing tables, needs/bookings/contracts/templates/activity/outbox/vendor_tasks,
  billing (plan_pricing, vendor_usage, wallet), organize (checklist, timeline, personal events,
  documents), guests/website/registry/help_usage, storage buckets + Realtime, S-3/S-4 fixes,
  19 default message templates, 43 checklist templates.
- Backfills verified: 9/9 vendor slugs, package deliverables from inclusions, budget
  `estimated = planned`, 6 needs from `couple_projects.needs[]`.
- `src/lib/supabase/types.ts` generated; `src/contracts/db.ts` (CONTRACT_VERSION 1).
- pgTAP RLS suite: **192 assertions, all passing** on knotly-dev — `bash supabase/tests/run.sh`
  (no Docker; runs `begin; _setup; file; rollback;` through the Management API, leaves nothing
  behind). Covers couple-owned, vendor-owned, shared rows, S-2/S-3/S-4, public site + RSVP,
  Help cap, SMS usage, storage folders. Found and fixed a policy recursion on
  `timeline_assignments` (`20261005130800`).
- Security advisor run: anon EXECUTE on RLS helpers revoked (`20261005130900`). Remaining
  warnings are pre-existing / need approval: extensions in `public` + `spatial_ref_sys` (S-5,
  Q-8), `match_vendors` search_path, anonymous sign-ins (S-7), leaked-password protection (DB-003).
- `scripts/seed.mts`: idempotent; packages with hours/deliverables/retainers, 9 KB FAQs with
  search pieces, `couple@test.dev` with a saved wedding + 3 needs. Run on knotly-dev.

## In progress
- Phase 0 PR open; waiting for review.

## Next (Phase 1)
- Search and booking queries; Realtime is already on for bookings/messages/activity_events.
- Revoke `select (total, line_items)` on `quotes` once ai + ui read via `view_quote` (S-2).
- DB-002 migration if approved.

## Waiting on human (IDs)
- DB-001 default contract template text (lawyer review, Q-12) — not blocking.
- DB-002 vendor_availability primary key — not blocking.
- DB-003 turn on leaked-password protection in Auth — not blocking.

## Requests to other agents
- **ai + ui (S-2):** read estimate prices through `rpc('view_quote', { p_quote })` (charges the
  vendor once on the couple's first open, returns the row). Today `src/lib/budget.ts` and
  `src/components/couple/VendorsPane.tsx` select `quotes.total` directly; once both stop, db
  will revoke `select (total, line_items)` on `quotes` from `authenticated`. Reply here when done.
- **ai:** `charge_estimate_view(quote)` and `record_sms_usage(vendor, outbox_id)` are
  server-only (service role). `wallet_balance(v)` is security invoker (vendor sees own; server
  sees all). `vendor_credit_balance` is now service-role only (responder.ts already uses admin).
- **ai:** existing `price_floor` / `max_discount` rules were **not** deactivated (the current
  gate treats a missing max_discount as 0%, so it's safe either way). Retire them when the
  no-haggle templated path replaces quoting, or ask db to do it in a migration.
- **ai:** default template events are in `DEFAULT_TEMPLATE_EVENTS` (`src/contracts/db.ts`);
  merge fields per spec §7 plus `{{vendor_name}} {{link}} {{alternative_dates}} {{call_time}}`.
  Feel free to mirror them in `src/contracts/templates.ts`.
- **ui:** `vendors.slug`, `embedding`, `plan*`, `stripe_*`, `subscription_status` are not
  user-writable (column grants); set slug in a server action with the admin client.
  `wedding_websites.password_hash` only via `rpc('set_website_password')`.
- **ui:** `budget_items.label` is still nullable (old upsert keys on label null); use distinct
  labels for "Add expense". `planned` ↔ `estimated` are synced by a trigger during the move.

## Contract changes
- v1 (2026-10-05): `src/contracts/db.ts` created. Deviations from spec §9:
  `message_templates` has an `id` PK + `unique nulls not distinct (vendor_id, event, channel)`
  (vendor_id null = Knotly default); `vendor_usage.ref_id` is `text`; `activity_events` has
  `couple_visible boolean` (couples read only those rows); `outbox.last_error`, `created_at`;
  `couple_projects.timeline_share_token` + `shared_timeline(token)`; `find_rsvp()` added
  beside `submit_rsvp()`; `take_help_message()` enforces the 30/day cap.
