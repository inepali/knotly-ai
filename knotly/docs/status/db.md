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

## Form-first reconciliation (2026-11-25, branch agent/db-form-first)
- Merged onto form-first `main`. Phase 0 migration files keep their 20261005 names (already
  applied on knotly-dev).
- `20261125130000_needs_into_project_needs.sql`: `project_needs` gains priority, must_haves,
  notes, status, booking_id, created_at; `needs` rows copied in; `bookings.need_id` and
  `checklist_items.need_id` dropped; `needs` dropped. Also drops the unused Phase 0
  `help_usage` + `take_help_message()` (form-first `help_quota_usage` + `take_help_quota()` is live).
- Tests, seed, types and `src/contracts/db.ts` (CONTRACT_VERSION 2) updated to match.
- To do on knotly-dev: `pnpm migrate`, `pnpm types`, `bash supabase/tests/run.sh`.
  On a database that never had Phase 0 (e.g. prod), the 20261005 files are older than the
  applied Nov ones, so the first push needs `supabase db push --include-all`.

## In progress
- PR for agent/db-form-first open; waiting for review.

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

## 2026-11-26: Reconciled with the couple add-ons (CONTRACT_VERSION 3)
- The couple add-ons on `main` (Guest List, Website, RSVP, Registry, …) own guests, the website,
  RSVP and the registry. Phase 0's versions are removed:
  - `20261005130400_guests_website.sql` now only creates `help_usage`/`take_help_message`
    (dropped again in 20261125) and `shared_timeline()`.
  - New `20261126155000_reconcile_phase0.sql` drops the old `guests` (only if it has Phase 0's
    `household` column), `wedding_websites`, `registry_links` (only if it has `kind`), and
    `public_website` / `find_rsvp` / `submit_rsvp` / `set_website_password` on databases that ran
    the old file (knotly-dev). It also drops Phase 0's duplicate `set_vendor_slug` trigger.
  - `20261126160000_guest_list.sql` uses `create or replace function owns_project(p uuid)`
    (same signature and body as Phase 0's).
- pgTAP: couple-owned table list now uses `guest_households`, `wedding_events`, `wedding_sites`;
  new checks that paid add-on writes need the add-on and that anon can't read the add-on tables.
  The Phase 0 public_website / RSVP function tests are replaced.
- `types.ts`: removed the Phase 0 `guests`, `registry_links`, `wedding_websites` and the four
  functions. Run `pnpm types` after migrating to pick up the add-on tables.

## 2026-11-28: Vendor wallet, step 1 (CONTRACT_VERSION 4)
Spec: `docs/specs/pricing-vendor-wallet-spec.md`. Migration `20261128120000_vendor_wallet.sql`
extends the Phase 0 billing tables instead of adding a second ledger:
- **Ledger stays `wallet_transactions`**, balance stays `wallet_balance()`. New kinds `promo`
  (signup credit, note `signup`) and `lead_credit` (spam credit); new columns `quote_id`, `note`,
  `created_by`. The `$10 minimum top-up` check is dropped: `credit_wallet()` checks $20 steps
  up to $100 from `pricing_config`. New `adjust` rows need a note (`not valid`, so old rows stay).
- **`pricing_config`**: default row (`metro_slug` null) + optional per-metro rows; read with
  `vendor_pricing(vendor)`. Defaults: lead $1, reload below $10 in $20 steps (max 5), signup $10,
  50 free texts then $0.20. `plan_pricing` still drives Basic/Pro (paused, unchanged behaviour).
- **`wallet_holds`** (one per quote): `place_estimate_hold()` sets the fee aside (false = not
  enough available), `charge_estimate_view()` captures it on the couple's first open,
  `release_estimate_hold()` / nightly `release_stale_holds()` give it back.
  `wallet_available() = balance − held`. Every money move takes `lock_wallet(vendor)`.
- **`charge_estimate_view()` behaviour change:** an estimate with no active hold is charged only
  if the available balance covers it; otherwise the lead is free. Balances never go negative.
- **`record_sms_usage()` behaviour change:** Pay as you go gets 50 free texts a month, then
  $0.20 from the wallet; returns **-1** (nothing recorded) when the wallet can't cover it. Call it
  **before** sending. Basic/Pro unchanged. Nothing in `src/` calls it yet.
- New: `grant_signup_credit()` (after phone verification; one per vendor / phone / business),
  `credit_wallet()` (webhook), `can_reload()`, `admin_adjust_wallet()`, `lead_spam_reports` +
  `report_spam_lead()` (vendor, 14 days, paused after >5 rejections in 30 days),
  `resolve_spam_report()`, `credit_spam_couple()`. Admin functions take `p_admin` and check
  `profiles.role = 'admin'`.
- **Not wired yet** (steps 2–11): nothing calls `place_estimate_hold()` (quotes trigger + skip
  unfunded vendors in matching is step 3), webhook branch for `metadata.type = wallet_reload`,
  Account page, cron for `release_stale_holds()`.
- pgTAP: new `060_wallet.test.sql` (84 assertions); `050` SMS test updated for the 50 free texts.
  Verified on a local Postgres 16 stand-in (billing + wallet migrations, pgTAP shim); still
  needs `bash supabase/tests/run.sh` against knotly-dev. Run `pnpm types` after migrating.

## 2026-11-28: Vendor wallet, step 2 (signup credit)
- `20261128130000_signup_credit_email.sql`: the $10 credit now also unlocks with a **confirmed
  email** (`auth.users.email_confirmed_at`), since phone codes (Twilio) aren't set up yet. Claims
  keep one per vendor / verified phone / business and add one per inbox (`email_key`, via
  `normalize_email()`: lower-case, `+tag` dropped, Gmail dots ignored). `phone_key` is now nullable.
- App: `src/lib/signup-credit.ts` (`grantSignupCredit`, never throws). Called from
  `/api/auth/verify` for vendors and from `saveBusinessProfile()` on the save that creates the
  business row (the usual moment, since the credit needs that row). The Business form shows
  "Saved. You have $10 in free credit, about 10 leads." `/api/auth/verify` now also sets
  `profiles.phone_verified` after a phone code.
- Vendors who signed up before this have no credit; no backfill.
- pgTAP: `test_wallet_signup_credit_email` added to 060. Vitest: `signup-credit.test.ts`,
  new `api/auth/verify/route.test.ts`, two cases in `vendor-profile.test.ts`. Not run here
  (no `node_modules`); run `pnpm test` and `bash supabase/tests/run.sh`.

## 2026-11-28: Vendor wallet, step 3 (holds on send, unfunded vendors skipped)
- `20261128140000_estimate_holds.sql`:
  - `vendor_can_take_lead(v)`: Pay as you go needs `wallet_available >= lead fee`; Basic/Pro true.
  - `quotes` AFTER INSERT trigger places the hold; when it can't, the insert fails with
    **SQLSTATE `KN402`** (`act.ts` → `INSUFFICIENT_BALANCE`). Every way of creating an estimate
    is covered, including tests and seeds: **fund a Pay-as-you-go vendor before inserting quotes**
    (`_setup.sql` now tops up V1 first).
  - `quotes` status → `declined` / `expired` releases the hold (trigger).
  - `match_project_vendors()` also requires `vendor_can_take_lead()`.
- App:
  - The agent's funds check moved from the frozen `vendor_credit_balance()` to
    `vendor_can_take_lead()` (same holding reply + vendor nudge).
  - `act()` returns `"sent" | "insufficient_balance"`. When the balance dropped since that check, the
    responder escalates with reason `insufficient_balance`; approving it without funds returns
    402 and reopens the escalation; `EscalationCard` shows the message.
  - `advanceWaves()` marks queued threads of vendors who can't pay `skipped` (new thread
    status) and asks the next in line.
- `vendor_credit_balance()` / `lead_credit_ledger` are no longer read by the app.
- pgTAP: 060 now 100 assertions (auto-hold, KN402, status release). Vitest: wave skip case in
  `posting.test.ts`. Not run here; run `pnpm test` and `bash supabase/tests/run.sh`.

## 2026-11-28: Vendor wallet, step 4 (opening an estimate unlocks contact + messages)
- `20261128150000_estimate_unlock.sql`: `thread_estimate_opened(t)`, `thread_messaging_open(t)`
  (posted-project threads need an opened estimate; couple-started inquiries are always open; false
  for non-participants), `thread_vendor_contact(t)` (phone / email / website / Instagram: the
  couple after opening an estimate, the vendor always).
- App: `/api/threads/[id]/reply` returns 403 when messaging is locked (both sides), and
  `/api/inquiries/[id]/send` refuses a couple's own draft there (vendor-agent drafts still go:
  that's how estimates arrive). The thread page shows "Contact {vendor}" to the couple after an
  open, and a notice instead of the reply box while locked. `loadThreadUnlock()` in
  `src/lib/estimates.ts`. Website links render only for http(s) URLs.
- pgTAP: 060 now 112 assertions. Vitest: `estimates.test.ts` (unlock loader), new
  `api/threads/[id]/reply/route.test.ts`. Not run here; run `pnpm test`.

## 2026-11-28: Vendor wallet, step 5 (Stripe reloads)
- `20261128160000_wallet_reload.sql`: `wallet_transactions.stripe_intent`; `credit_wallet()` gains
  `p_intent` (signature changed: dropped + recreated); `refund_wallet_payment(intent, amount,
  refunded)` takes back the refunded share of the pre-tax credit, cumulative (repeat / partial
  events never double-debit), never below $0 available; returns null when the intent isn't a reload.
- App: `src/lib/actions/wallet.ts` `startWalletReload()` (steps 1–max, `can_reload()` required,
  prices from `vendor_pricing()`), `startWalletReloadAction` in vendor dashboard actions.
  `src/lib/stripe.ts` `walletReloadSessionBody()` / `createWalletReloadSession()` (quantity × $20,
  Stripe Tax exclusive, `metadata.type = wallet_reload`, no-refund notice on the pay button).
  Webhook: paid `wallet_reload` → `credit_wallet(amount_subtotal)` ("credited"); `charge.refunded`
  tries `refund_wallet_payment` first ("debited"), then the add-ons as before.
- Success/cancel URLs go to `/vendor/dashboard/account`, which arrives in step 6.
- pgTAP: 060 now 121 assertions. Vitest: `wallet.test.ts`, reload body in `stripe.test.ts`,
  two webhook cases. Not run here; run `pnpm test`.

## 2026-11-28: Vendor wallet, step 6 (Account page + low-balance alerts)
- `20261128170000_wallet_account.sql`: `wallet_summary()` (signed-in vendor: balance, held,
  available, fee, reload rules, texts this month), `wallet_activity(kind, limit, offset)` (their
  ledger with the couple's first name + wedding month on lead rows, `total_count` for paging),
  `wallet_alerts` + `take_wallet_alert(v)` ('low' under $10, 'empty' under the $1 fee, once per
  kind per 24h; Pay as you go only; server-only).
- App: `/vendor/dashboard/account` (balance card, Reload form → `startWalletReloadAction`,
  `?reloaded` / `?canceled` notices, texts this month, filtered + paged activity with links to the
  conversation and Stripe receipts via `/api/wallet/receipt/[id]`). Sidebar "Account" with an
  amber dot when under the threshold (`NavLink.dot`).
- Alerts email right after the balance drops (no outbox sender or cron needed):
  `sendWalletAlert()` after an estimate's hold (`act.ts`), after a couple opens an estimate (new
  `openEstimateAction` server action; `EstimateCard` no longer calls `view_quote` from the
  browser), and when a wave skips the vendor. No push yet (the app has no web push).
- pgTAP: 060 now 142 assertions. Vitest: `wallet-alerts.test.ts`, `wallet-view.test.ts`, alert
  case in `posting.test.ts`. Not run here; run `pnpm test`.

## 2026-11-28: Vendor wallet, step 7 (spam reports)
- `20261128180000_spam_report_activity.sql`: `wallet_activity()` gains `can_report` (charged,
  within 14 days, not reported or credited) and `report_status` (dropped + recreated: return type).
- App: `src/lib/actions/spam.ts` (`reportSpamLead`, `resolveSpamReport`, `banSpamCouple`,
  `loadSpamQueue`). Vendor: "Report as spam" on eligible lead rows in Account activity
  (`ReportSpamButton`, `reportSpamLeadAction`), with the report's status shown after.
  Admin: `/admin/spam-reports` (pending queue; Approve credits $1 and emails the vendor; Reject;
  Ban couple as spam = Supabase Auth ban (~100 years) + `credit_spam_couple()` + an email to each
  credited vendor). `src/lib/admin-session.ts` guards it (`profiles.role = 'admin'`, set by hand).
- No admin navigation yet: go to `/admin/spam-reports` directly.
- pgTAP: 060 now 149 assertions. Vitest: `spam.test.ts`. Not run here; run `pnpm test`.

## 2026-11-28: Vendor wallet, step 8 (admin pricing)
- `20261128190000_pricing_admin.sql`: `pricing_config.updated_by`. **`credit_wallet()` no longer
  checks the paid amount against the current step/max** (only > 0 and ≤ $1,000): an admin may
  change them while a vendor is in Checkout, and a paid reload must still credit. Steps are
  checked when the session is created (`startWalletReload`).
- App: `/admin/pricing` (default row + per-metro overrides; add a metro, edit, "Use default
  prices" removes the override), `/admin` index. `src/lib/actions/pricing.ts` validates like the
  table checks and caps the largest reload at $1,000.
- pgTAP: 060 now 150 assertions (reload case updated). Vitest: `pricing.test.ts`. Not run here.
