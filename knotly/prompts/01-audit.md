Read CLAUDE.md and docs/spec.md (the new MVP scope). This repo is our existing Knotly app.
Do NOT change any application code in this session. Produce docs/GAP_ANALYSIS.md with:

1. Inventory: framework and routing, pages/components, Supabase tables and columns, RLS
   policies, storage buckets and policies, auth setup, env var names, integrations, tests.
2. Mapping to the spec: for every requirement ID (CP-*, CO-*, CG-*, CH-*, VW-*, VA-*, VB-*),
   mark Exists / Partial / Missing with the file or table that covers it.
3. Database plan: map each existing table to spec section 9 (keep / extend / rename / replace),
   additive migrations only, and how existing data is preserved or backfilled.
4. Framework plan: the spec needs Next.js server actions, route handlers, cron, and after().
   If this app is not Next.js App Router, propose a migration path that reuses existing
   components and keeps the app usable during the move, with an order of steps.
5. Security findings: committed secrets (search git history too), permissive RLS or storage
   policies, missing auth checks, each with a concrete fix.
6. Task lists for three agents (db, ai, ui): owned paths, and tasks mapped to spec section 12
   phases, adjusted for what already exists. Note dependencies between agents.
7. Questions and inputs needed from me (keys, decisions) at the end.

Keep it concrete: file paths, table names, and requirement IDs. When done, give me a 10-line
summary in chat.
