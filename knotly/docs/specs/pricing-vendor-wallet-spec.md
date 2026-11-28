# Pricing Model & Vendor Wallet

## Overview

Knotly's launch pricing in one line: **everyone signs up free; couples pay for add-ons, and vendors pay $1 when a couple opens their estimate.**

| Side | Free | Paid |
|---|---|---|
| Couple | Signup, My Wedding, posting, estimates, messaging, budget, Guest List | Add-ons (see `client-add-ons-spec.md`) |
| Vendor | Signup, business profile, **public profile page**, portfolio, packages, submitting estimates, **$10 signup credit**, **50 SMS per month** | **Lead connect fee: $1** per estimate opened by a couple; **SMS over 50/month**. Both paid from a prepaid wallet |

This spec covers the vendor side: the lead fee, the wallet, SMS overage and the Account page. The couple side is already specified in `client-add-ons-spec.md` and doesn't change.

## Decisions (Nov 2026)
- **Vendor signup and public page are free for every vendor.** Every vendor gets an indexable page at `/vendors/[slug]` once their profile is complete.
- **Lead connect fee = $1**, charged **once per estimate**, at the moment the couple opens it.
- Charges come from a **prepaid wallet balance**. Knotly never charges a vendor's card per lead.
- **Reload in $20 increments**, allowed **only when the balance is under $10**. No seasonal windows.
- **$10 signup credit** for every new vendor.
- **No refunds of unused balance**, including on account closure.
- **Sales tax handled by Stripe Tax** on reloads.
- **Spam leads are credited back** to the vendor.
- **SMS: 50 free per month**, then charged to the wallet.
- **Subscriptions paused for launch.** Every vendor is pay-per-lead.

### What this supersedes (confirmed)
- **Basic ($19) / Pro ($49) subscriptions.** **Paused for launch.** The schema keeps a `plan` column so they can come back.
- **Public page gate.** `vendor_has_public_profile()` no longer checks a plan. Set `PUBLIC_PAGES_REQUIRE_PLAN=false` (from `seo-listing-pages-spec.md`). It still requires a published, complete profile with a city.
- **Top-up minimum $10 / "$10, $20 or more".** Replaced by $20 increments.
- **Pro weighting in wave order.** With no subscribers, the wave becomes a plain random rotation. The weight setting stays (set to 1.0).
- **SMS allowances tied to Basic (200) / Pro (500).** Replaced by 50 free per month for all vendors.

## Requirements

### Lead connect fee
- **Trigger:** the couple taps **View estimate** (Review estimate) on an estimate card and the full estimate opens. That's the "opened and reviewed" moment: it reveals the price and vendor contact details and unlocks messaging, as in the MVP loop.
- **Not charged:** the estimate list card (teaser) being shown, a vendor submitting an estimate, a couple re-opening an estimate already charged, admin views, or the vendor viewing their own estimate.
- **Once per estimate, ever.** Enforced by `vendor_usage unique (kind, ref_id)`.
- **Fee config:** `lead_fee_cents` per metro (admin-set), default `100`. The fee is copied onto the estimate when the hold is placed (`quotes.lead_fee_cents`), so a later price change never alters a pending estimate.

### Holds (so a couple never opens an unpaid estimate)
- When a vendor sends an estimate, a **$1 hold** is placed on the wallet. Sending needs **available balance ≥ fee**, where `available = balance − held`.
- **On open:** the hold is captured and becomes the charge; the balance drops by $1.
- **Released** when the estimate can no longer be opened: the vendor withdraws it, the couple declines it or closes the category, the project is archived, or **30 days pass unopened** (nightly job).
- An estimate with no active hold (sent before holds existed, or released) is charged on open only if the available balance covers it; otherwise that lead is free. **Balances never go negative.**
- Vendors with available < fee are **skipped by matching** for the next wave, so couples aren't left waiting on vendors who can't respond. They get a "Reload to keep receiving leads" notice.

### Signup credit ($10)
- Granted once per vendor as `kind = 'promo'` (`signup_credit_cents` config, default `1000`), **after the vendor verifies the code sent at sign-up**: their **email** for now; their **phone** once Twilio is set up. This keeps throwaway accounts from farming it.
- **One per verified email (Gmail dots and `+tags` ignored), per verified phone number, and per business** (normalized business name + metro). A repeat is still allowed to sign up, just without the credit.
- Granted on the first business save (it needs the business row), or right at code verification if the row already exists.
- Promo credit is spent like any other balance (no separate bucket). It's never refundable, same as all balance.
- Shown at signup and on the Account page: "You have $10 in free credit, about 10 leads."
- A new vendor starts at exactly $10, which is not under $10, so they can reload after their first lead.

### Spam lead credit
- **Vendor reports** a lead from the estimate or thread: **Report as spam** with a reason (fake couple, fake details, solicitation, other). Allowed within **14 days of the charge**.
- Reports go to the **admin queue**. On approval, `lead_credit` returns that lead's fee to the wallet, and the couple project is flagged.
- **Automatic credit:** when an admin **bans a couple account as spam**, every charged lead on that couple's projects is credited back to each vendor, with a notice ("A lead was confirmed as spam. $1 has been returned"). Pending reports on them are approved.
- Each charge can be credited only once.
- Abuse guard: a vendor with more than **5 rejected reports in 30 days** can't report for 30 days.

### SMS overage
- Every vendor gets **50 texts free each calendar month** (`sms_free_monthly`, admin-configurable). Counted from `vendor_usage`, reset on the 1st.
- Past 50, each text costs **`sms_overage_cents`** (default `20`), debited from the wallet as `kind = 'sms'`.
- **Before sending** a text, the sender calls `record_sms_usage()`. If the wallet can't cover it (returns `-1`), the text **isn't sent**, the Vendor Agent falls back to **email / in-app message**, and the vendor gets a reload notice. Leads and SMS share the same balance.
- Account page shows "SMS this month: 42 of 50 free" and overage spend.
- Charges are written per message, not batched, so the balance is always exact.

### Wallet
- The balance is the sum of the vendor's `wallet_transactions`; the signup credit is the first entry after phone verification.
- Balance never goes negative. All money movement goes through SECURITY DEFINER functions that take a per-vendor lock (`lock_wallet`). Clients can't write wallet tables directly.
- **No refunds of unused balance.** Not on request, not on account closure. Shown in Terms and at reload checkout: "Wallet credit is non-refundable and has no cash value."

### Reload rules
- The **Reload** button is enabled only when **balance < $10** (`reload_below_cents`, default `1000`, admin-configurable per metro; `can_reload()`). Above that, the page shows "You can reload when your balance drops below $10."
- Amounts: **$20, $40, $60, $80, $100** (multiples of $20, max $100 per reload). Default selection $20.
- Payment through **Stripe Checkout** (`mode: payment`), priced on the server from config. The client sends only the multiple (1–5), never an amount.
- **Stripe Tax on** (`automatic_tax: { enabled: true }`), billing address collected. The wallet is credited the **pre-tax amount** ($20), and tax is shown on the receipt.
- The threshold is checked again in the server action. The crediting function always credits a paid session (the vendor already paid); a balance that rose in another tab just blocks starting a new one.

### Account page (`/vendor/dashboard/account`)
- **Balance card:** balance, on hold, available, and "≈ N leads" (`available ÷ fee`).
- **Reload** (rules above) with Stripe Checkout; on return, `?reloaded=1` shows a success notice once the webhook has credited.
- **SMS:** free texts used this month (of 50), overage spend this month.
- **Activity:** the ledger, newest first, paginated, filterable (leads, reloads, credits, SMS). Each lead charge links to the estimate and couple project (first name + wedding month only), with **Report as spam** while eligible.
- **Receipts:** Stripe receipt link per reload (includes tax).
- **Low-balance alerts:** email and push when available drops below **$10** ("You can reload now") and below **$1** ("New leads and over-limit texts are paused"). At most one of each per 24 hours.
- Nav: **Account** item in the vendor sidebar, with a dot when available < $10.

### Admin
- Pricing page per metro: lead fee, signup credit, SMS free/overage, reload threshold.
- Spam report queue (approve/reject), wallet adjustments with a required note.

## Data (as built, `20261128120000_vendor_wallet.sql`)

Built on the Phase 0 billing tables (`20261005130200_billing.sql`) rather than a second ledger:

| Spec idea | As built |
|---|---|
| Ledger | **`wallet_transactions`** (existing). New kinds `promo` (signup credit, `note = 'signup'`) and `lead_credit`; new columns `quote_id`, `note`, `created_by`. Lead charges stay `estimate_view`. |
| Balance | **`wallet_balance(v)`** (existing, sum of the ledger). No cached wallet table, so nothing to reconcile. |
| Holds | **`wallet_holds`** (`quote_id` pk, `vendor_id`, `amount_cents`, `status` held/captured/released, `release_reason`). `wallet_held(v)`, `wallet_available(v)`. |
| One charge per estimate | **`vendor_usage unique (kind, ref_id)`** (existing) |
| One credit per estimate / one signup credit | Partial unique indexes on `wallet_transactions` |
| Fee snapshot | `quotes.lead_fee_cents` |
| Pricing | **`pricing_config`**: default row (`metro_slug` null) + per-metro overrides; `vendor_pricing(v)`. `plan_pricing` still drives Basic/Pro. |
| Signup claims | `signup_credit_claims` (`vendor_id` pk, `phone_key` unique, `business_key` unique) |
| Spam reports | `lead_spam_reports` (`quote_id` unique, `reason`, `details`, `status`, `reviewed_by/at`) |

The old `$10 minimum top-up` check is removed; reload amounts are checked in `credit_wallet()`.

## Functions (SECURITY DEFINER, as built)

| Function | Caller | Does |
|---|---|---|
| `grant_signup_credit(vendor)` | server, after code verification and on the first business save | Writes `promo` once per vendor / email / phone / business. Returns cents granted (0 if not eligible) |
| `place_estimate_hold(quote)` | server, when an estimate is sent | Sets the fee aside. `false` = not enough available. Pay-as-you-go only |
| `view_quote(quote)` → `charge_estimate_view(quote)` | couple (existing) | First open captures the hold and charges once |
| `release_estimate_hold(quote, reason)` | server | Gives a held fee back |
| `release_stale_holds()` | nightly cron | Releases declined/expired/30-day-old holds |
| `record_sms_usage(vendor, outbox_id)` | SMS sender, before sending | 50 free a month, then $0.20 from the wallet; `-1` = can't cover it |
| `credit_wallet(vendor, cents, session)` | Stripe webhook | $20 steps up to $100, idempotent on session |
| `can_reload(vendor)` | server action | Balance under the threshold |
| `admin_adjust_wallet(vendor, cents, note, admin)` | admin | Credit or debit with a note; never below 0 available |
| `report_spam_lead(quote, reason, details)` | vendor | Own charged lead, within 14 days, not paused |
| `resolve_spam_report(report, approve, admin)` | admin | Approve credits the lead |
| `credit_spam_couple(couple, admin)` | admin ban flow | Credits every charged lead of that couple |

## Stripe
- Webhook `checkout.session.completed` → verify signature → de-dupe via `stripe_events` → branch on `metadata.type`: `wallet_reload` → `credit_wallet` with `amount_subtotal` (pre-tax); otherwise add-ons.
- **Stripe Tax** on for reloads (same setup as add-ons).
- `charge.refunded` (admin-only, e.g. a duplicate payment): debits the refunded amount as `adjust`, never below $0. Vendors can't request balance refunds.

## Build order
1. ✅ Tables, `pricing_config`, core functions + pgTAP tests.
2. ✅ Signup credit after email verification (phone once Twilio is set up).
3. ✅ Hold on submit (quotes trigger, KN402 when unfunded); skip unfunded vendors in matching and waves.
4. ✅ Couple's **View estimate** charges (via `view_quote`) and unlocks the vendor's contact card and, on posted projects, messages.
5. ✅ Stripe reload + webhook (Stripe Tax on; refunds take back the pre-tax share).
6. Account page, nav dot, low-balance alerts.
7. Spam reports: vendor button, admin queue, auto-credit on ban.
8. Admin pricing page.
9. SMS overage in the SMS sender (when SMS ships).
10. Nightly jobs: 30-day hold release.
11. Flip `PUBLIC_PAGES_REQUIRE_PLAN=false`; update pay-per-use banners in the portfolio dashboard; retire subscription UI.

## Tests
- Signup credit: granted once after email (or phone) verification; same inbox, phone or business gets none; not granted before verification.
- Hold refused when available < fee; written when allowed; Basic/Pro need none.
- Open: charges once; a second open, a different couple, or the vendor themself never charges.
- Concurrency: two holds can't overspend (per-vendor lock); lead + SMS share the lock.
- Release on withdraw, decline and 30-day expiry; no release after a charge.
- Spam: report only within 14 days and only on own charged leads; approve credits once; ban credits all charges once.
- SMS: first 50 free, 51st charged; refused (-1) and nothing recorded when unfunded.
- Reload: disabled at exactly $10, enabled at $9.99; refuses amounts not in $20 steps or above max; webhook idempotent.
- Balance and held never negative.
- Fee change in `pricing_config` doesn't affect estimates already held.

## Open questions
None right now.

### Resolved (Nov 2026)
- ~~Subscriptions~~ **Basic/Pro paused for launch.**
- ~~SMS free threshold~~ **50 per month.**
- ~~Reload limit~~ **Reload allowed when balance is under $10. No seasonal windows.**
- ~~Refund of unused balance~~ **No refunds**, including on account closure.
- ~~Sales tax on reloads~~ **Stripe Tax** handles it.
- ~~Bad leads~~ **Spam leads are credited** (vendor report + admin approval, or automatically when the couple is banned as spam).
- ~~SMS charging~~ **Charged to the wallet only past the monthly free threshold.**
- ~~Signup promo credit~~ **$10 at signup**, after email verification for now (phone via Twilio later).

## References
- `client-add-ons-spec.md`: couple pricing, Stripe Checkout + webhook pattern, `stripe_events`
- `form-first-migration-spec.md`: estimates, waves, matching, weighted rotation
- `vendor-portfolio-spec.md`: `vendor_has_public_profile()`, pay-per-use banners
- `seo-listing-pages-spec.md`: `PUBLIC_PAGES_REQUIRE_PLAN`, `listed_until`
- Repo: `supabase/migrations/20261005130200_billing.sql`, `20261128120000_vendor_wallet.sql`, `supabase/tests/060_wallet.test.sql`
