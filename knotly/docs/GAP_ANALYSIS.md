# Knotly — Gap analysis: existing app vs MVP spec

Generated Oct 4, 2026 from the code on `main` and the live **dev** Supabase project (`knotly-dev`,
ref `fzwsrsihofffzhkjymut`). Source of truth for scope: `docs/spec.md`. Rules: `CLAUDE.md`.
No application code was changed to produce this document.

**Headline:** the app is already Next.js 16 App Router + Supabase, so no framework migration is
needed. The vendor-agent backend (gate, pricing, escalations, knowledge base, inbox) is largely in
place; the couple side is still chat-first and most spec screens, the booking lifecycle, contracts,
outbox/SMS, billing, and the Organize/Guests features are missing.

---

## 1. Inventory

### 1.1 Framework and routing

| Item | Current state |
| --- | --- |
| Framework | **Next.js 16.3.6, App Router** (`src/app`), React 19.2, TypeScript, Tailwind v4, pnpm |
| Session refresh / route guards | **None.** No `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Pages check the session themselves. |
| Server actions | **Not used.** All mutations are route handlers under `src/app/api/**` or agent tools. |
| `after()` | Used: `api/inquiries/[id]/send`, `api/threads/[id]/reply`, `api/escalations/[id]`, `api/knowledge/**`, `agent/tools/vendor.ts` |
| Cron | Route exists (`api/cron/escalations`, `CRON_SECRET`), **no schedule** (no `vercel.json`) |
| AI | Vercel AI SDK v7 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) **direct to Anthropic** (`claude-sonnet-5`, `src/agent/models.ts`), not AI Gateway. Embeddings: `@ai-sdk/openai` `text-embedding-3-small` (1536) |
| Theme | Tailwind Plus **Pocket** look (Inter, cyan-500, gray-50) in `src/app/globals.css`, `src/components/ui/*`. **Spec wants Big Day Story palette + Playfair Display/Manrope.** |

**Pages** (`src/app`)

| Route | File | Purpose today |
| --- | --- | --- |
| `/` | `page.tsx` | Minimal hero (Pocket) |
| `/chat` | `chat/page.tsx` → `components/chat/Chat.tsx` | **Main couple UI**: chat + workspace tabs (My Wedding, Budget, Vendors, Messages, Search, Drafts); also vendor UI by role (Messages, My business, Knowledge) |
| `/search` | `search/page.tsx` | Vendor semantic search (server component, `match_vendors`) |
| `/inbox`, `/inbox/[threadId]` | `inbox/**` | Mailbox (Messages / Drafts), reply, approve drafts |
| `/vendor` | `vendor/page.tsx` | Vendor home → renders `Chat` (redirects non-vendors to `/chat`) |
| `/vendor/login` | `vendor/login/page.tsx` | Redirects to `/chat` (unified sign-in) |
| `/vendor/inbox` | `vendor/inbox/page.ts` | **Broken:** JSX in a `.ts` file; blocks `tsc`/`next build` |

**Route handlers** (`src/app/api`)

| Route | Auth | Notes |
| --- | --- | --- |
| `auth/signup`, `auth/verify`, `auth/signin`, `auth/reset/{request,confirm}` | Supabase session | Guest→account upgrade (email/phone OTP + password), role pick, guest merge |
| `chat` | `getUser` | `streamText`, couple or vendor tools by role, `stepCountIs(6)` |
| `inbox`, `inbox/[threadId]` | `getViewer` | Read mailbox for chat's Messages tab |
| `inquiries/[id]/send` | `getUser` + ownership | Approve & send a draft (couple or vendor side); wakes vendor agent |
| `threads/[id]/reply` | `getUser` + ownership | Personal reply; wakes vendor agent on couple replies |
| `escalations/[id]` | RLS read proves ownership | Needs-you actions (approve/edit/guide/reject/take_over). Header says `/resolve`; `api/escalations/[id]/resolve/` folder is **empty** |
| `cron/escalations` | `CRON_SECRET` | SLA reminders/expiry (see security finding S-1) |
| `knowledge`, `knowledge/[id]` | RLS | Vendor KB: links (crawler), FAQs, PDFs (behind flag) |

**Components** (`src/components`): `chat/Chat.tsx`, `chat/workspace.tsx`, `chat/cards/{AccountCard, InquiryDraftsCard, VendorDetailsCard, VendorListCard, WeddingCard}`, `couple/{WeddingPane, VendorsPane}`, `budget/BudgetPane`, `inbox/{InboxPane, MailShell, ThreadActions}`, `knowledge/KnowledgePane`, `vendor/{BusinessPane, EscalationCard, Offer}`, `ui/{Button, Container, Logo, SiteHeader, SiteFooter, fields}`.

**Service code**: `src/lib/{auth, auth-session, budget, categories, crawl, email, embeddings, flags, knowledge, mail-threads, mailbox}.ts`, `src/lib/supabase/{admin, browser, server}.ts`; `src/agent/{models, prompts, shared}.ts`; `src/agent/tools/{account, couple, vendor}.ts`; `src/agent/vendor/{act, context, decide, fixtures, gate, pricing, responder, rules}.ts`.

**Not present** (named in spec §2/§10 as reusable but absent from this repo): `src/agent/vendor/slots.ts`, `events.ts`, `templates.ts`, `kb.ts`, `outbox.ts`, `activity.ts`; `src/server/**`; `src/contracts/`; `api/consultations`; `api/quotes/[id]/{view,accept}`; `EstimateCard`, `CallTimesCard`; `charge_estimate_view()`; `email.ts` `sendInvite`/`makeIcs` (only `sendMessageEmail`, `sendInquiryEmail`, `sendDraftReviewEmail`, `notify` exist); `src/lib/supabase/types.ts`; `.env.example`.

### 1.2 Supabase tables (public schema, dev project)

All tables have RLS **enabled** except `spatial_ref_sys` (PostGIS system table).

| Table | Columns |
| --- | --- |
| `profiles` | id, role (couple/vendor/admin), full_name, email, phone, is_guest, onboarded, terms_version, terms_accepted_at, created_at |
| `metros` | slug, name, state, lat, lng |
| `couple_projects` | id, couple_id, partner_names, wedding_date, metro_slug, venue, guest_count, budget_total, style, needs (text[]), created_at |
| `vendor_categories` | slug, name, category_group, sort_order, active (33 rows) |
| `vendors` | id, business_name, category (FK → vendor_categories), bio, metro_slug, location (geography), service_radius_miles, price_min, price_max, website, published, updated_at, embedding vector(1536) |
| `vendor_packages` | id, vendor_id, name, description, price, inclusions text[] |
| `vendor_addons` | id, vendor_id, name, description, price, created_at (**not in spec**) |
| `testimonials` | id, vendor_id, author_name, rating, body, verified, created_at |
| `threads` | id, project_id, vendor_id, status (open/quoted/held/declined/waiting_credits), created_at, vendor_agent_paused |
| `messages` | id, thread_id, sender (couple/couple_agent/vendor/vendor_agent/system), subject, body, payload, status (pending_approval/sent), created_at, read_at, emailed_at |
| `quotes` | id, thread_id, package_id, line_items, total, valid_until, status, first_viewed_at, created_at |
| `lead_credit_ledger` | id, vendor_id, quote_id, delta, reason, created_at |
| `vendor_agent_settings` | vendor_id, autonomy_level, confidence_threshold, hold_days, quote_valid_days, signature, holding_reply, call_link, call_min_notice_hours, calls_per_day |
| `vendor_agent_rules` | id, vendor_id, kind, params, source_text, active, created_at |
| `vendor_availability` | vendor_id, date, status (held/booked/blocked), thread_id, hold_expires_at |
| `consult_hours` | id, vendor_id, weekday, start_time, end_time, timezone, slot_minutes |
| `consultations` | id, thread_id, vendor_id, starts_at, ends_at, status, created_at |
| `escalations` | id, thread_id, vendor_id, violations, reason, decision, total, status, resolution, due_at, resolved_at, created_at |
| `agent_audit_log` | id, thread_id, agent, decision, gate, outcome, created_at |
| `budget_items` | id, project_id, category, label, planned, planned_by, booked, booked_vendor_id, booked_note, updated_at; unique nulls not distinct (project_id, category, label) |
| `vendor_knowledge` | id, vendor_id, kind (website/instagram/facebook/youtube/link/faq/pdf), title, url, question, answer, file_path, status, error, chars, created_at, updated_at |
| `vendor_knowledge_chunks` | id, source_id, vendor_id, content, embedding vector(1536), page_url |
| `vendor_knowledge_pages` | id, source_id, vendor_id, url, title, status, error, chars, updated_at |
| `pending_verifications` | email, guest_id, mode, created_at (unused by current code) |
| View `vendor_agent_stats` | `security_invoker = true` (respects RLS) |

**Functions:** `owns_thread` (definer), `vendor_was_contacted` (definer), `mark_thread_read` (definer, authenticated only), `match_vendors`, `match_vendor_knowledge` (server-only), `merge_guest_into_user` (definer, server-only), `vendor_credit_balance` (definer, **executable by anon**), trigger functions `handle_new_user`, `welcome_credits`, `create_vendor_settings`, `keep_sent_messages`.
**Triggers:** `auth.users` → `on_auth_user_created`; `vendors` → `on_vendor_created`, `on_vendor_welcome`; `messages` → `keep_sent_messages` (sent messages immutable / undeletable).
**Extensions:** `postgis`, `vector`, `btree_gist` **in `public`**; pg_stat_statements, uuid-ossp, pgcrypto in `extensions`.

### 1.3 RLS policies (summary)

| Table | Policies |
| --- | --- |
| profiles | read own; update own (column grants limit to full_name, phone, onboarded, terms_*) |
| couple_projects | couple ALL own; vendor SELECT if `vendor_was_contacted(id)` |
| vendors | SELECT published or own; **ALL where id = auth.uid() (any authenticated user, any role)** |
| vendor_packages / vendor_addons | SELECT if vendor published or own; vendor ALL own |
| testimonials | SELECT public; vendor INSERT unverified |
| threads | SELECT couple-owner or vendor; couple INSERT |
| messages | SELECT: couple sees sent + own-side drafts, vendor sees sent + own-side drafts; couple INSERT/UPDATE own drafts |
| quotes | SELECT couple-owner or vendor (**no `first_viewed_at` check**) |
| budget_items | couple ALL own (via couple_projects) |
| vendor_agent_settings / rules / availability, consult_hours | vendor ALL own |
| consultations, escalations, agent_audit_log, lead_credit_ledger | SELECT only (owner/vendor) |
| vendor_knowledge (+ chunks, pages) | vendor SELECT/INSERT(pending)/DELETE own; chunks/pages SELECT own |
| metros, vendor_categories | public SELECT |

### 1.4 Storage

| Bucket | Public | Limits | Policies |
| --- | --- | --- | --- |
| `vendor-knowledge` | no | 10 MB, `application/pdf` | none (server issues signed upload URLs; server reads) |

No buckets yet for documents, contracts, vendor photos, website covers.

### 1.5 Auth (dev project)

- Email + password with email OTP (8-digit, `otp_length = 8`), confirmations **on**, SMTP via Resend (`smtp.resend.com`, sender "Knotly").
- **Anonymous sign-ins on** (guest chat → upgrade). Spec drops guests.
- TOTP MFA enroll/verify on. **Twilio SMS provider enabled with no account SID** (phone OTP would fail).
- `site_url = http://localhost:3000`, no additional redirect URLs.
- Email templates in repo: `supabase/templates/{email_change,recovery}.html` (send `{{ .Token }}`); application status unknown on remote.

### 1.6 Env var names (from code; values not read)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (implicit, SDK), `ANTHROPIC_WORKSPACE_ID`, `OPENAI_API_KEY` (implicit, SDK), `RESEND_API_KEY`, `EMAIL_FROM`, `DEV_EMAIL_TO`, `APP_URL`, `CRON_SECRET`, `AGENT_KILL_SWITCH`, `KNOWLEDGE_RENDERER`, `JINA_API_KEY`, `FIRECRAWL_API_KEY`, `NEXT_PUBLIC_KNOWLEDGE_PDF`.
Not yet referenced but needed by spec: Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs), Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`), Resend webhook secret, AI Gateway key.

### 1.7 Integrations and tests

| Integration | State |
| --- | --- |
| Supabase | In use (Auth, Postgres, pgvector, PostGIS, Storage). **Realtime: no tables in `supabase_realtime`.** |
| Resend | `src/lib/email.ts`; delivery depends on verified domain `mail.knotly.net` (SMTP also via Resend) |
| Anthropic | Direct; **API credit balance currently $0** (requests fail) |
| OpenAI | Embeddings only |
| Jina / Firecrawl | Optional page rendering for the KB crawler (`src/lib/crawl.ts`), off by default |
| Stripe, Twilio, AI Gateway | Not integrated |

| Tests | State |
| --- | --- |
| `pnpm test` (vitest) | `src/agent/vendor/gate.test.ts` with `fixtures.ts` |
| `pnpm evals` | `evals/vendor-agent.mts` (calls Claude) |
| pgTAP / RLS tests | **None** |
| Seed | `scripts/seed.mts` (vendors, packages, testimonials, embeddings) |

---

## 2. Mapping to the spec

Legend: **E** Exists · **P** Partial · **M** Missing.

### Couple — Plan

| ID | Status | Covered by today | Gap |
| --- | --- | --- | --- |
| CP-1 Overview `/app` | M | Pieces: `WeddingPane`, `BudgetPane`, `VendorsPane` | Route, stat cards, checklist/calendar cards, redirect to setup |
| CP-2 My wedding | P | `couple_projects`; `saveWeddingDetails` tool (`agent/tools/couple.ts`); read-only `WeddingPane` | Form + server action, `venue_address`, phone + SMS opt-in, checklist seeding, default budget split, re-dating |
| CP-3 Needs | P | `couple_projects.needs` (text[]), `vendor_categories` | `needs` table (budget, priority, must-haves, status), auto status, links to search, budget line + checklist task |
| CP-4 Vendors search | P | `match_vendors()`, `/search`, `searchVendors` tool, `VendorListCard` | Date-availability filter + badge, exact filters vs description reorder, **Save**, `/app/vendors` route |
| CP-5 Vendor profile | P | `VendorDetailsCard`, `components/vendor/Offer.tsx` (package cards), testimonials | `/app/vendors/[id]`, deliverables, FAQ highlights, call hours, Request to book / Ask / Book a call |
| CP-6 Bookings | M | Approximation: `threads.status`, `quotes`, `draftInquiry` tool, `VendorsPane` | `bookings` table + lifecycle, request form, detail page, Realtime |
| CP-7 Messages | P | `threads`/`messages`, `/inbox`, `InboxPane`, `api/threads/[id]/reply` (wakes agent), unread counts | `/app/messages` route, system-event rows, Realtime, reply by email |

### Couple — Organize, Guests, Help

| ID | Status | Covered by today | Gap |
| --- | --- | --- | --- |
| CO-1 Budget | P | `budget_items` (planned/booked), `lib/budget.ts`, `BudgetPane`, `planBudget`/`recordBooking` tools | Spec columns (estimated, paid, source, booking_id), editable table, Add expense, default split, booking auto-fill |
| CO-2 Checklist | M | — | `checklist_templates`, `checklist_items`, seeding, auto-complete |
| CO-3 Wedding day timeline | M | — | `timeline_events`, assignments, share link, PDF |
| CO-4 Calendar | M | `consultations` (data only) | Views, `personal_events`, ICS feed (`calendar_token`) |
| CO-5 Documents | M | — | `documents`, `document_shares`, bucket, signed URLs |
| CG-1 Guest list | M | — | `guests`, CSV import/export |
| CG-2 Wedding website | M | — | `wedding_websites`, `/w/[slug]`, RSVP functions |
| CG-3 Gift registry | M | — | `registry_links` |
| CH-1 Help assistant | P | `Chat.tsx`, `/api/chat`, cards (`VendorListCard`, …), `coupleTools` | Drawer, read-only tool set + `draftText` + `suggestAction`, small model, caps (`help_usage`), 3-step limit; retire write tools |

### Vendor — Work

| ID | Status | Covered by today | Gap |
| --- | --- | --- | --- |
| VW-1 Overview | M | `vendor_agent_stats` view, `escalations` | Page with live cards |
| VW-2 Inquiries | P | `threads`, `messages`, `agent_audit_log` (decision + gate) | List + detail with reasoning per step |
| VW-3 Bookings | M | — | Depends on `bookings`, deliverables tracking |
| VW-4 Calendar | P | `vendor_availability`, `setAvailability` tool | Month view, block/unblock UI |
| VW-5 Calls | P | `consult_hours`, `consultations`, settings `call_link`, `call_min_notice_hours`, `calls_per_day` | `slots.ts`, `api/consultations`, invites (ICS), UI |
| VW-6 Contracts | M | — | `contract_templates`, `contracts`, editor, preview, merge fields |
| VW-7 Messages | P | `/inbox`, reply route, `threads.vendor_agent_paused`, escalation `take_over` | "You're handling this" banner + Resume, no double-send guard UI |

### Vendor — Your agent

| ID | Status | Covered by today | Gap |
| --- | --- | --- | --- |
| VA-1 Needs you | P | `escalations`, `api/escalations/[id]`, `EscalationCard`, `cron/escalations` (SLA) | Route `/vendor/needs-you` (`/vendor/inbox/page.ts` broken), Add-to-KB after resolve |
| VA-2 Activity | P | `agent_audit_log` (agent decisions only) | `activity_events` for all actors/channels, feed UI, filters |
| VA-3 Agent rules | P | `vendor_agent_settings`, `vendor_agent_rules`, `rules.ts`, tools `saveRule`/`listRules`/`setAutonomy`/`setAvailability` | Form UI, templates, follow-up schedule, quiet hours, min notice, `paused`; remove discount rules from UI |
| VA-4 Knowledge base | P | `vendor_knowledge` (+ chunks, pages), `/api/knowledge`, `KnowledgePane`, crawler, `searchKnowledge`, `addKnowledge` tool | Verbatim Q&A answer at ≥ 0.85, test box, unanswered-questions list, `source` = escalation |

### Vendor — Business

| ID | Status | Covered by today | Gap |
| --- | --- | --- | --- |
| VB-1 Business details | P | `vendors`, `BusinessPane` (read-only), `saveBusinessProfile` tool | Form, slug, phone, Instagram, photos, `/v/[slug]`, publish preconditions |
| VB-2 Packages | P | `vendor_packages`, `Offer.tsx` cards, `savePackages` tool, `vendor_addons` | `deliverables`, `hours`, `retainer_amount`, `active`, `sort`, form; add-ons not in spec (decision Q-6) |
| VB-3 Reviews | P | `testimonials`, `addTestimonials` tool | Review request link (`review_token`), verified flow |
| VB-4 Credits | P | `lead_credit_ledger`, `vendor_credit_balance()`, welcome credits, credit check in `responder.ts` | Plans, `plan_pricing`, `vendor_usage`, wallet, Stripe Checkout/portal/webhook |
| VB-5 Settings | M | — | `notify_prefs`, quiet hours, digest email |

### Agent and lifecycle (spec §7–8, not separately numbered)

| Area | Status | Notes |
| --- | --- | --- |
| Templated path (`events.ts`, `templates.ts`) | M | Today every couple message goes to `decide()` |
| KB path (`kb.ts`, thresholds) | P | Retrieval exists (`searchKnowledge`), no verbatim/threshold logic |
| AI fallback (`decide`, `gate`, `pricing`, `act`) | E | Discount logic must be removed for no-haggle |
| Autonomy, pause, kill switch | P | `autonomy_level`, `AGENT_KILL_SWITCH` referenced; no `paused` setting |
| Booking lifecycle (`transitionBooking`) | M | |
| Outbox / SMS / quiet hours | M | Emails sent inline via Resend |
| Contracts + e-sign + countersign | M | |

---

## 3. Database plan

Additive only (per `CLAUDE.md`). Anything that drops, renames, or changes a constraint on a table holding data is listed under **Needs approval** and is not done without a written backfill and your OK.

### 3.1 Existing tables

| Table | Decision | Additive change | Backfill / data preservation |
| --- | --- | --- | --- |
| `profiles` | Keep, extend | `phone_verified`, `sms_opt_in_at`, `notify_prefs` | Defaults; `is_guest` kept but unused |
| `metros` | Keep | — | — |
| `couple_projects` | Keep, extend | `venue_address`, `calendar_token` | Default token per row; **`needs` array stays** (read-only) until UI moves to `needs` table |
| `vendor_categories` | Keep (add to spec) | — | Reference data for `needs.category`, `budget_items.category`, `vendors.category` |
| `vendors` | Keep, extend | `slug unique`, `phone`, `instagram`, `photos`, `plan`, `plan_renews_at`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` | `slug` = slugified `business_name`, de-duplicated with `-2`, `-3`; `plan='payg'` |
| `vendor_packages` | Keep, extend | `hours`, `retainer_amount`, `deliverables jsonb`, `active`, `sort` | `deliverables` from `inclusions` (`[{item, qty:null, delivery:null}]`); `inclusions` kept |
| `vendor_addons` | Keep (pending Q-6) | — | Not shown in no-haggle UI until decided |
| `testimonials` | Keep, extend | `booking_id`, `review_token unique` | — |
| `threads` | Keep, extend | `booking_id` | Existing threads have no booking (dev data) |
| `messages` | Keep | — | `read_at`, `emailed_at`, immutability trigger stay |
| `quotes` | Repurpose as estimate | `booking_id` | Link later; fix RLS (S-2) |
| `lead_credit_ledger` | Freeze, replace | — | Superseded by `vendor_usage` + `wallet_transactions`; welcome credits conversion per Q-7 |
| `vendor_agent_settings` | Keep, extend | `contract_days`, `auto_countersign`, `followup_days`, `kb_answer_threshold`, `kb_ai_threshold`, `min_notice_days`, `quiet_hours`, `sms_enabled`, `paused` | Defaults |
| `vendor_agent_rules` | Keep | — | Existing `price_floor` / `max_discount` rows set `active=false` (no-haggle) |
| `vendor_availability`, `consult_hours`, `consultations`, `escalations`, `agent_audit_log` | Keep | — | — |
| `budget_items` | Keep, extend | `estimated`, `paid`, `source`, `booking_id` | `estimated = planned`; `source = 'default'` if `planned_by='ai'` else `'manual'`; `booked` already exists; `label` filled from category name where null |
| `vendor_knowledge` (+ `_chunks`, `_pages`) | Keep as the spec's `vendor_kb` | `vendor_knowledge.source` ('manual','escalation', file), Q&A question embedding for verbatim match | `kind='faq'` rows = spec `qa`; chunks = `doc_chunk`. Add `match_vendor_kb()` over these tables instead of a new `vendor_kb` table (Q-5) |
| `pending_verifications`, `merge_guest_into_user()` | Freeze | — | Spec says drop; keep until guest flow is removed (Needs approval) |

### 3.2 New tables (spec §9), in migration order

1. `owns_project()`; `needs`; `bookings` (+ `one_open_booking` index); `contract_templates`; `contracts`; `message_templates`; `activity_events`; `outbox`; `vendor_tasks`.
2. `plan_pricing` (seed 3 rows), `vendor_usage`, `wallet_transactions`, `wallet_balance()`, new `charge_estimate_view()` (doesn't exist in this repo; write fresh).
3. `checklist_templates` (seed ~40), `checklist_items`, `timeline_events`, `timeline_assignments`, `personal_events`, `documents`, `document_shares`.
4. `guests`, `wedding_websites`, `registry_links`, `help_usage`, `public_website()`, `submit_rsvp()`.
5. Storage buckets: `documents` (private), `contracts` (private), `vendor-photos` (public read), `website-covers` (public read) with policies.
6. Realtime publication: `bookings`, `messages`, `activity_events`.
7. Backfills: `needs` from `couple_projects.needs[]` (status `not_started`, budget from matching `budget_items.estimated`); vendor slugs; package deliverables; budget columns.

**Conflict to resolve:** spec `budget_items` has `label not null` and multiple rows per category (Add expense); the existing table has `unique nulls not distinct (project_id, category, label)`. Plan: fill `label` and keep the unique key (expenses use distinct labels). If you want duplicate labels, replacing the constraint **needs approval**.

### 3.3 Needs approval (not additive)

| Change | Why |
| --- | --- |
| Drop `pending_verifications`, `merge_guest_into_user()` | Spec §2 (guest flow removed) |
| Move `vector`, `btree_gist` (and later `postgis`) to `extensions` schema | Security S-5 |
| Disable anonymous sign-ins | Spec §3 normal signup |
| Drop `couple_projects.needs` after `needs` table is live | Spec §2 |
| Retire `lead_credit_ledger` | Replaced by usage/wallet |

---

## 4. Framework plan

The app **is** Next.js App Router, so no migration is needed. Gaps and the order to close them:

1. **`src/proxy.ts`** (Next 16 name for middleware) using `@supabase/ssr` to refresh the session cookie on every request, plus role guards that redirect `/app/**` → couples, `/vendor/**` → vendors. RLS stays the real security.
2. **Route groups** per spec §3: `src/app/(couple)/app/**`, `src/app/(vendor)/vendor/**`, `src/app/(public)/{v,w,review}/**`, `src/app/(auth)/{signup,vendor/signup,login}`. Each group layout checks the role.
3. **Server actions** in `src/server/actions/*.ts` (Zod-validated, run as the user) for every form; cross-party effects only in `src/server/bookings.ts` (`transitionBooking`) and the outbox sender.
4. **Cron:** add `vercel.json` with `/api/cron/agent` every 5 min (Vercel Pro), extending `api/cron/escalations`.
5. **Keep the app usable during the move:** build `/app` and `/vendor/*` pages **next to** `/chat` and `/inbox`. Reuse `WeddingPane`, `BudgetPane`, `VendorsPane`, `InboxPane`, `KnowledgePane`, `BusinessPane`, `Offer`, `EscalationCard`, `VendorListCard`. When CP-1…CP-7 ship, redirect `/chat` → `/app` and turn `Chat.tsx` into the Help drawer (CH-1) and the vendor "Set up with AI" helper. Retire `/inbox` after `/app/messages` and `/vendor/messages` exist.
6. **Theme:** replace Pocket tokens in `src/app/globals.css` with the Big Day Story palette + Playfair Display/Manrope (`next/font/google`); keep `Button`/`fields` APIs so pages don't change.
7. **AI Gateway:** swap `anthropic(...)` in `src/agent/models.ts` for the gateway provider + small default model (one file).
8. **Types:** run `pnpm types` → `src/lib/supabase/types.ts` and use typed clients; add `src/contracts/` for shared booking/event/template types.

---

## 5. Security findings

| ID | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| S-1 | **Cron route fails open** if `CRON_SECRET` is unset: the header `Bearer undefined` passes | `src/app/api/cron/escalations/route.ts` compares to `` `Bearer ${process.env.CRON_SECRET}` `` | Return 500/401 when `!process.env.CRON_SECRET`; use constant-time compare |
| S-2 | **Quote price readable before "opening"**: couples can `select total from quotes` directly, bypassing pay-per-view charging | Policy "couple or vendor reads quotes" has no `first_viewed_at` check | Revoke direct `select` on price columns for `authenticated`; expose via security-definer `view_quote(id)` that charges once (`vendor_usage` unique) and returns the row |
| S-3 | **Any signed-in user can create/edit a vendor listing** (couples, anonymous guests) and self-publish | Policy "vendor edits own listing" = `id = auth.uid()` | `with check` requires `profiles.role='vendor'`; move `published`, `embedding`, `price_min/max` writes to server actions (column grants) |
| S-4 | **`vendor_credit_balance(v)` callable by anyone for any vendor** | security definer, EXECUTE granted to anon | Revoke from anon/authenticated or add `where v = auth.uid()`; same for trigger functions `handle_new_user`, `welcome_credits`, `create_vendor_settings` (revoke EXECUTE from PUBLIC) |
| S-5 | **Extensions in `public`** expose hundreds of PostGIS/pgvector/btree_gist functions through the REST API; `spatial_ref_sys` has RLS off | `pg_extension` | Move `vector`, `btree_gist` to `extensions` (`alter extension … set schema`); PostGIS needs reinstall or leave with revoked grants (Needs approval) |
| S-6 | **No session refresh / guards** (no `proxy.ts`) | — | Section 4 step 1 |
| S-7 | **Anonymous sign-ins enabled** (bot signups, spec removes guests) | Remote auth config | Disable after signup forms ship; add CAPTCHA meanwhile |
| S-8 | **Email links built from request Host** when `APP_URL` is unset (host-header injection) | `APP_URL ?? req.nextUrl.origin` in `inquiries/[id]/send`, `threads/[id]/reply` | Require `APP_URL` in production; fail if missing |
| S-9 | **KB crawler SSRF check is hostname-only** (a public name resolving to a private IP passes) | `src/lib/knowledge.ts` `parsePublicUrl` | Resolve DNS and reject private ranges before each fetch (incl. redirects) |
| S-10 | **`DEV_EMAIL_TO` override** reroutes all mail; dangerous if set in prod | `src/lib/email.ts` | Only honor when `NODE_ENV !== 'production'` |
| S-11 | **Couple budget visible to every contacted vendor** | `vendor_was_contacted` policy exposes full `couple_projects` row | Expose a vendor-safe view (names, date, metro, guest count); decide on budget (Q-9) |
| S-12 | **Auth config**: Twilio SMS provider on with no SID; `site_url` localhost; no redirect URLs | Remote config | Disable SMS provider until Twilio is set up; set prod `site_url`/redirects |
| S-13 | Malformed bodies → 500 (Zod `.parse` throws) | `api/escalations/[id]/route.ts` | `safeParse` → 400 |

**Committed secrets:** scanned full git history (all branches) for Anthropic/OpenAI/Resend/Supabase/Stripe/Twilio key patterns and JWTs, and for any `.env*` file: **none found**. The licensed Tailwind Plus template (`templates/`) is git-ignored and not tracked. Add `.env.example` (names only).

---

## 6. Agent task lists

Branches `agent/db`, `agent/ai`, `agent/ui`. Shared contracts in `src/contracts/` (bump `CONTRACT_VERSION`). Status files `docs/status/<name>.md`; requests `docs/human-input/<name>.md`.

### Owned paths

| Agent | Owns | Reads only |
| --- | --- | --- |
| **db** | `supabase/migrations/**`, `supabase/tests/**` (pgTAP), `supabase/seed*`, `scripts/seed.mts`, `src/lib/supabase/types.ts`, `src/contracts/db.ts` | everything else |
| **ai** | `src/agent/**`, `src/server/bookings.ts`, `src/server/outbox.ts`, `src/server/activity.ts`, `src/server/actions/{bookings,messages,contracts,knowledge,agentSettings,billing,help}.ts`, `src/app/api/**` (cron, webhooks, help, escalations, consultations, calendar ICS), `src/lib/{email,knowledge,crawl,embeddings}.ts`, `evals/**`, `src/contracts/{events,templates}.ts` | db types |
| **ui** | `src/app/(couple)/**`, `src/app/(vendor)/**`, `src/app/(public)/**`, `src/app/(auth)/**`, `src/proxy.ts`, `src/components/**`, `src/app/globals.css`, `src/app/layout.tsx`, `src/server/actions/{wedding,needs,vendors,budget,checklist,timeline,calendar,documents,guests,website,registry,vendorBusiness,packages,calendarVendor,contractsVendor,tasks}.ts` | contracts |

### Phase 0 — Foundation (Oct 5–16)

| Agent | Tasks (adjusted for what exists) |
| --- | --- |
| db | Section 3.1 extensions + 3.2 groups 1–4 + buckets + Realtime; fix S-2, S-3, S-4 policies; pgTAP RLS tests per ownership pattern; seed: vendors with packages+deliverables, KB FAQs, default message templates, checklist templates; `pnpm types` |
| ai | `transitionBooking` skeleton (`src/server/bookings.ts`), `outbox` (enqueue/cancel/flush), `activity.log`, `/api/cron/agent` extending `cron/escalations` (fix S-1); `CONTRACT_VERSION` for booking statuses + event types |
| ui | `proxy.ts` + role layouts (S-6); Big Day Story tokens + fonts; app shell `Sidebar`, `PageHeader`, `StatCard`, `SectionCard`, `StatusPill`, `DataTable`, `FormField`, `EmptyState`, `Drawer`; `/signup`, `/vendor/signup`, `/login` (email OTP); fix `vendor/inbox/page.ts` → `.tsx` |
| **Depends** | ui shell needs db `profiles.role` only (exists); ai needs db `bookings`, `outbox`, `activity_events` |

### Phase 1 — Plan + Business (Oct 19–30)

| Agent | Tasks |
| --- | --- |
| db | Search query with availability filter (extend `match_vendors` with date), Realtime on `bookings`/`messages`/`activity_events` |
| ai | `requestBooking`/`acceptOffer`/`cancelBooking` actions → `transitionBooking`; re-embed vendor on business/package save |
| ui | CP-1…CP-7 (reuse `WeddingPane`, `BudgetPane`, `VendorsPane`, `VendorListCard`, `Offer`, `InboxPane`); VB-1, VB-2 (reuse `BusinessPane`, `Offer`); VW-4, VW-5 forms |
| **Depends** | ui CP-6 needs ai booking actions; CP-4 needs db search change |

### Phase 2 — Vendor Agent core (Nov 2–13)

| Agent | Tasks |
| --- | --- |
| db | `match_vendor_kb()` over `vendor_knowledge*` (Q&A verbatim + chunks), default `message_templates` seed |
| ai | `events.ts` playbook, `templates.ts`, `kb.ts` thresholds, AI fallback via existing `decide`/`gate` (remove discount checks), autonomy + `paused`, escalation → KB entry; eval cases for zero-AI paths |
| ui | VA-1 (reuse `EscalationCard`), VA-2 activity feed, VA-3 rules/templates form, VA-4 (reuse `KnowledgePane`, add test box + unanswered list), VW-1, VW-2, VW-7 |
| **Depends** | ui VA-2/VW-1 need ai `activity_events` writes |

### Phase 3 — Contracts, calls, SMS, Organize (Nov 16–25)

| Agent | Tasks |
| --- | --- |
| db | Contract/document storage policies, signed-URL helpers |
| ai | Contract render + click-to-sign + PDF + countersign; `slots.ts` + `/api/consultations` + ICS invites; Twilio send/inbound webhook (STOP/HELP); follow-ups, reminders, digest; `charge_estimate_view` usage + wallet deduction |
| ui | VW-3, VW-6, CO-1 (extend `BudgetPane`), CO-2…CO-5, Bookings detail |
| **Depends** | Twilio A2P (human), contract template legal review (human) |

### Phase 4 — Guests, website, Help, pilot (Nov 30–Dec 11)

| Agent | Tasks |
| --- | --- |
| db | `public_website()`, `submit_rsvp()`, RSVP rate limiting |
| ai | Help assistant (`/api/help`, read-only tools, `draftText`, `suggestAction`, caps via `help_usage`, small model); `generateTemplatesWithAI`; Stripe webhook + Checkout + portal (VB-4) |
| ui | CG-1…CG-3, CO-3, Help drawer (from `Chat.tsx`), VB-3…VB-5; retire `/chat` and `/inbox` |

---

## 7. Questions and inputs needed

| ID | Question / input | Needed for | Blocking? |
| --- | --- | --- | --- |
| Q-1 | **Anthropic API credits are $0** on the key's org; top up in Claude Console (not claude.ai) | Any AI path, `pnpm evals` | Yes for AI work |
| Q-2 | AI Gateway: create a key and choose the default small model, or stay on direct Anthropic? | `src/agent/models.ts` | No (direct works once funded) |
| Q-3 | Stripe: account, Basic/Pro products and price IDs, webhook secret | VB-4 | Phase 4 |
| Q-4 | Twilio: account SID, messaging service, A2P 10DLC registration (start now) | SMS | Phase 3 |
| Q-5 | Keep the existing `vendor_knowledge*` tables as the spec's `vendor_kb` (recommended) or build `vendor_kb` fresh? | VA-4, agent KB path | Phase 2 |
| Q-6 | Add-ons (`vendor_addons`): keep as fixed-price extras, or retire under no-haggle? | VB-2, pricing | Phase 1 |
| Q-7 | Convert existing welcome credits (5 per vendor in `lead_credit_ledger`) to a $5 wallet adjustment, or drop them? | VB-4 backfill | Phase 4 |
| Q-8 | Approve "Needs approval" items in §3.3 (drop guest tables/flow, move extensions, disable anonymous sign-in) | Cleanup | No |
| Q-9 | Should contacted vendors see the couple's total budget? (today they can) | S-11 | No |
| Q-10 | Vercel Pro for 5-minute cron; production Supabase project details (separate from dev) | Cron, launch | Phase 0/launch |
| Q-11 | Resend: is `mail.knotly.net` verified? Webhook secret for bounces | All email | Phase 0 |
| Q-12 | Lawyer review of vendor terms (countersign) and default contract template | VW-6 | Before launch |
| Q-13 | Theme: confirm replacing the current Pocket look with the Big Day Story palette and fonts | UI Phase 0 | No |
