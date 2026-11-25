# Knotly — rules for Claude Code

Knotly (knotly.net) is a wedding marketplace. This repo (`knotly-ai`) is the EXISTING app being
enhanced to the new MVP scope in `docs/spec.md` (source of truth). Requirement IDs (CP-*, CO-*,
CG-*, CH-*, VW-*, VA-*, VB-*) are ticket IDs.

## Product in one paragraph
Couples plan by **forms** (wedding, needs, vendors, bookings, messages, budget, checklist,
wedding-day timeline, calendar, documents, guests, website + RSVP, registry) with an optional
**Help assistant** chat. Vendors set up business, no-haggle packages + deliverables, availability,
call hours, contract template, knowledge base; a **Vendor AI Agent** handles inquiries, holds,
contracts (incl. countersigning), calls, texts, follow-ups, escalations, and logs every action.
Templated path first, AI only when language is needed. Knotly never handles couple↔vendor payments;
Stripe is only for vendor ↔ Knotly billing (Basic $19, Pro $49, Pay-as-you-go wallet).

## Target stack
Next.js App Router + TypeScript strict, Tailwind, Supabase Cloud (Postgres, Auth, Storage, Realtime,
pgvector, PostGIS), Vercel AI SDK via AI Gateway (small model by default), Zod, Resend, Twilio,
Stripe, Vercel (cron). pnpm. UI: sidebar layout, Big Day Story palette (sidebar #2E1F63,
violet #5037C3, gold #F0C13F / button #DFB33A with dark text, page #F5F4F8), Playfair Display
headings, Manrope UI text. If the current code differs (e.g. Vite SPA), follow the migration plan
in `docs/GAP_ANALYSIS.md` once it exists; never rewrite working features without a plan entry.

## Working on an existing app
- Read before writing. Reuse existing components, tables, and data; extend rather than replace.
- Database changes are ADDITIVE migrations only (`supabase/migrations/*`). Never drop or rename a
  table/column holding data without a written migration + backfill step approved by the human.
- Run migrations against the DEV Supabase project only. Never touch production.
- Keep the app working at every commit: typecheck, lint, tests green before committing.
- Small commits with requirement IDs: `feat(CP-3): needs list with budget lines`.
- Never merge to `main`; open PRs. The human merges.

## Parallel agents (when running db / ai / ui sessions)
Each session works on its own branch `agent/<name>` and owns paths listed in
`docs/GAP_ANALYSIS.md` (task lists section). Read other agents' work with
`git show agent/<other>:<path>`; never edit their files. Shared contracts live in `src/contracts/`;
bump the `CONTRACT_VERSION` comment when changing one and note it in `docs/status/<name>.md`.

## Secrets and outside information — never guess
Never invent keys, IDs, URLs, prices, or legal text. Never read, print, or commit `.env*` files
(only `.env.example` with names). When you need something external (keys, Stripe/Twilio/Resend
setup, a business decision), append a request to `docs/human-input/<name>.md` using the template,
keep working on something unblocked (mocks, stubs, feature flags), and end your turn with
`⏸ Waiting on human: <IDs>`.

## Security non-negotiables
RLS on every table; cross-party writes only in server code after an ownership check; couple text is
untrusted in every prompt; service-role key server-only; signed URLs for documents.

## Cost rules
Templated/knowledge-base answers before any model call; small model, maxOutputTokens 500, last 12
messages; Help assistant capped at 30 messages/couple/day; embeddings only on save or described
search. Log tokens per request.
