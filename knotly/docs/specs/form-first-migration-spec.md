# Form-First Migration Spec

## Overview

Knotly (`inepali/knotly-ai`) is chat-first today: couples and vendors do everything through `/chat`, and each action is a Claude tool call (`saveWeddingDetails`, `draftInquiry`, `savePackages`, `saveRule`, …) on `claude-sonnet-5`. Every save costs tokens, and as the history grows each turn costs more.

This spec makes **forms the primary UI** for both sides. Chat stays for **help and support only**, at two levels:

1. **Platform help:** "How do I…?" questions about Knotly, for couples and vendors.
2. **Vendor-level help:** on a vendor's profile, couples ask that vendor's questions, answered from the vendor's knowledge base.

The **Vendor Agent** (`src/agent/vendor/*`: decide → gate → act → responder, escalations, evals) is the product, and this spec leaves it alone. It runs server-side when an inquiry arrives, not as a chat.

Scope: app shell, routes, turning the existing panes into pages, replacing chat tools with server actions, and slimming the chat down. Billing, contracts, SMS, the quote-broadcast loop and the Wedding Essentials pages are out of scope and each gets its own spec.

## What we reuse

| Existing | Becomes |
|---|---|
| `WeddingPane` + `WeddingCard` (read-only) | My Wedding **form** page |
| `BudgetPane`, `lib/budget.ts` | Budget page, plus an add/edit line form |
| `VendorsPane` | My Vendors page |
| `/inbox`, `/inbox/[threadId]`, `MailShell`, `ThreadActions` | Messages (both sides, unchanged) |
| `/search` + `match_vendors` RPC | Retired from the couple side. Pattern reused for the `match_project_vendors` RPC |
| `draftInquiry` thread/message insert | Fan-out from **Post to vendors** |
| `BusinessPane` | Business profile **form** |
| `KnowledgePane`, `lib/knowledge.ts`, `lib/crawl.ts` | Knowledge page (already form-based) |
| `/vendor/inbox` (escalations) | Needs You page |
| `api/auth/*` routes | Real sign-up / sign-in pages |
| Tool `execute` bodies | Extracted into shared server functions (see Requirements) |

## Routes

Sidebar layout (Big Day Story brand colors), one layout per role.

**Couple: `/client/dashboard/…`**

| Page | Route | Source |
|---|---|---|
| My Wedding | `/my-wedding` | `saveWeddingDetails` logic + `WeddingCard` fields, plus **Post to vendors** |
| Estimates | `/vendors` | `VendorsPane`: vendors who responded, grouped by category |
| Messages | `/inbox` | existing inbox |
| Budget | `/budget` | `BudgetPane` + `recordBooking` / `planBudget` logic |

**Vendor: `/vendor/dashboard/…`**

| Page | Route | Source |
|---|---|---|
| Needs You | `/needs-you` | `/vendor/inbox` escalations |
| Messages | `/inbox` | existing inbox |
| Business | `/business` | `BusinessPane` + `saveBusinessProfile`, `publishProfile` |
| Packages & Add-ons | `/packages` | `savePackages`, `saveAddOns` |
| Knowledge | `/knowledge` | `KnowledgePane` |
| Agent Settings | `/agent` | `saveRule`, `listRules`, `setAutonomy`, `getAgentStats` |
| Availability | `/availability` | `setAvailability`, `consult_hours` |

Public: `/` (landing), `/signup`, `/signin`, `/vendors/[id]` (vendor profile + vendor-level help).

## Requirements

### Shared server functions
- Move each tool's `execute` logic into `src/lib/actions/<domain>.ts` (e.g. `wedding.ts`, `budget.ts`, `inquiries.ts`, `vendor-profile.ts`, `vendor-agent-settings.ts`). Each function takes `(sb, userId, input)`, validates with the same Zod schema the tool uses, and returns `{ ok, data | error }`.
- Forms call these through Next server actions. The schemas live in one place, shared by the form and the action.
- The chat tools that remain (if any) call the same functions, so there are never two copies of the logic.
- Reads go through RLS with the user's client (`supabaseServer`), as they do now. `supabaseAdmin` is only for the cases that already need it (for example, setting `role`).

### Couple forms
- **My Wedding:** partner names, date, metro (a dropdown from `metros` rather than free text with `resolveMetro`), venue, guest count, total budget, style, and needs (multi-select from `VENDOR_CATEGORIES`), with an **optional budget per needed category**. Every field is optional and partial saves are allowed, matching today's behavior.
- **Couples never pick vendors first.** No vendor search or "contact" form on the couple side. The couple fills in My Wedding and taps **Post to vendors**, and vendors come to them (see *Project post & matching*).
- **Estimates page:** vendors who responded, grouped by category, with each one's estimate and status (from `VendorsPane`). Opening a vendor shows their profile, the "Ask this vendor" help, and the message thread.
- **Budget:** add/edit target lines per category, and a "Mark booked" action (from `recordBooking`). `planBudget` becomes a **non-AI** default split by category percentages. AI suggestions can come back later as an optional button.

### Project post & matching
The couple's post replaces vendor search and inquiries.

1. **Post:** `postProject(projectId)` requires a date, metro and at least one need. It sets `couple_projects.posted_at`. Edits after posting re-run matching only for categories added later.
2. **Match in SQL first (no tokens):** a `match_project_vendors(project_id, category)` RPC returns published vendors where:
   - `vendors.category` is one of the needed categories,
   - the wedding metro falls within the vendor's `service_radius_miles` (PostGIS),
   - the date isn't `booked`/`blocked` in `vendor_availability`, and an unexpired `held` doesn't count as free,
   - the budget fits: the cheapest `vendor_packages.price` ≤ the couple's budget for that category, or ≤ `budget_total` when no category budget is set.
   Only vendors that pass all four get a thread.
3. **Fan out:** for each match, create a `threads` row and a `messages` row (`sender: "system"`, `payload.type: "project_post"` with the wedding facts), then run `runVendorAgent(threadId)` in `after()` or a queue. This reuses the existing agent flow (decide → gate → act).
4. **Vendor Agent decides** using its rules and packages: send an estimate (`quote`), `decline`, or `escalate` to Needs You. **Declines are silent:** the couple never sees vendors who passed, and their threads are hidden from the couple.
5. **Estimate cap: 5 per category by default.** Store it as `estimate_cap` per needed category on the project (e.g. a `project_needs(project_id, category, budget, estimate_cap default 5)` table instead of the `needs text[]` column).
   - Fan out in **waves** so tokens aren't spent on vendors who won't be shown. Run the agent for up to `cap − estimates_so_far` matched vendors at a time. When some decline, run the next wave from the remaining matches. Stop when the cap is reached or no matches are left.
   - Matched vendors never reached stay `queued` (not notified, not charged).
   - **"Get 5 more estimates":** a button per category on the Estimates page raises `estimate_cap` by 5 and resumes the waves from the queue. Vendors who already declined are never asked again.
   - If no matches are left, the couple sees "No more available vendors for this category yet". New vendors who publish later can be matched into open projects (a later enhancement).
6. **Couple sees** only vendors who sent an estimate, on the Estimates page. Messaging opens from there.
7. **Vendor-side view:** a **Leads** list (on Needs You or its own tab) shows posts the agent escalated or that the vendor turned off auto-reply for, so the vendor can respond by hand.

Paying when a couple opens an estimate (`quotes.first_viewed_at`) is covered in the billing spec. Note that `runVendorAgent` currently stops when a vendor has no credits; revisit that check there.

### Vendor forms
- Business profile, packages, add-ons, testimonials, publish toggle: forms over the existing tables.
- Agent Settings: list/add/remove `vendor_agent_rules`, an autonomy setting, stats. This replaces chat-only configuration.
- Availability: a date picker for blocked/booked dates, plus consult-hours editing.

### Auth
- Dedicated `/signup` (choose **Couple** or **Wedding vendor**) and `/signin` pages built on the existing `api/auth/*` routes. Role is set at signup on the server, which replaces `switchToVendor`.
- Drop the anonymous guest-chat entry. Browsing `/find` and vendor profiles stays public. Saving anything requires an account.
- Keep `merge_guest_into_user` in the DB for now. Remove it in a later cleanup once no guest rows remain.

### Help chat (the only chat left)
- A collapsible **Help** widget in both dashboards. No tools that write to the database.
- **Platform help:** answers come from a short, static Knotly help doc in the system prompt (cacheable). It can link to dashboard routes ("Go to My Wedding →") but never performs actions.
- **Vendor-level help:** on a responding vendor's profile, an "Ask this vendor" box that runs only `searchKnowledge` (read-only, the `askVendorKnowledge` logic) scoped to that vendor. If there's no answer, it points the couple to the message thread.
- **Token guardrails:**
  - Help uses a cheaper model than the Vendor Agent: add `helpModel` (Haiku-class) to `src/agent/models.ts`. `chatModel` stays for the Vendor Agent only.
  - Prompt caching on the system prompt and help doc.
  - At most 2 tool steps (`stopWhen: stepCountIs(2)`), only the last ~10 messages sent, and a 1,000-character input cap.
  - A per-user daily message cap (e.g. 30), counted in a small `help_usage` table. Logged-out visitors on a vendor profile get a lower cap per IP/session.
- Replace `/api/chat` with `/api/help` and delete `coupleTools`, `vendorTools` and `accountTools` once every action has a form.

### Cleanup
- Retire `src/components/chat/workspace.tsx` and the chat cards (`VendorListCard`, `InquiryDraftsCard`, `AccountCard`, …) once their pages exist. `WeddingCard` stays as the read view on My Wedding.
- Home page copy: drop "Plan your wedding by chatting".
- **Bug to fix in passing:** `src/app/vendor/inbox/page.ts` contains JSX but has a `.ts` extension. Rename it to `.tsx` (or delete it when Needs You replaces it).

### Build order
1. Shared server functions plus tests (lift them from the tools, no behavior change).
2. Auth pages and role at signup.
3. Couple: My Wedding + Post → matching RPC + fan-out → Estimates → Budget.
4. Vendor: Business → Packages → Knowledge → Agent Settings → Availability → Needs You.
5. Help widget (`/api/help`, `helpModel`, caps).
6. Delete `/chat`, the chat tools and the workspace.

## Open questions

1. ~~"Vendor-level" help~~ **Resolved:** vendor-level help means couples asking a specific vendor's questions, answered from that vendor's knowledge base. Vendors' own how-to questions go to platform help.
2. ~~Contacting vendors~~ **Resolved:** couples don't pick vendors. They post their details, and vendors respond only if the date is free and the budget fits.
3. ~~Estimate cap~~ **Resolved:** 5 per category by default. The couple can ask for 5 more at a time.
4. ~~Wave order~~ **Resolved:** weighted random rotation. Each matched vendor gets a random draw, Pro subscribers get extra weight (configurable, e.g. 1.5×), and new vendors aren't starved. The order is stored on the queued threads so a wave can be replayed exactly.
5. **Guest browsing (default taken):** the public site is the landing page plus sign-up/sign-in. Vendor profiles are visible only to couples who received that vendor's estimate. Revisit if SEO pages are wanted later.

## References

- Repo: `inepali/knotly-ai` @ `280e00a` (Oct 4, 2026)
- Chat entry: `src/app/api/chat/route.ts`, `src/agent/tools/{couple,vendor,account}.ts`, `src/agent/prompts.ts`
- Panes: `src/components/{couple,budget,vendor,knowledge,inbox}/*`
- Vendor Agent (unchanged): `src/agent/vendor/*`, `evals/vendor-agent.mts`
- Nav pattern: `client-dashboard-nav-spec.md` (its later pages, like Website and Registry, follow in their own specs)
