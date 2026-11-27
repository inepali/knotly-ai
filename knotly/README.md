# Knotly — Claude Code setup pack

Copy everything here into /Users/sghimire/knotly/knotly-ai (merge with existing files; if the repo
already has a CLAUDE.md, combine them). Also add docs/spec.md: open the "Knotly MVP Spec" doc and
download it as Markdown.

1. Commit: `git add -A && git commit -m "chore: claude code setup + MVP spec"`.
2. Claude Code Desktop → open the knotly-ai folder → new session → paste prompts/01-audit.md.
3. Review docs/GAP_ANALYSIS.md (bring it back to the claude.ai chat if you want help refining it).
4. Three new sessions (db, ai, ui) → paste prompts/02-agent-kickoff.md with the name filled in.
5. Next day / new session: prompts/03-resume.md.

## Couple add-ons (Stripe)

Couples pay once per wedding for add-ons (see `client-add-ons-spec.md`). Set in `.env.local` and on Vercel:

- `STRIPE_SECRET_KEY`: server only. Use a test key (`sk_test_…`) in dev.
- `STRIPE_WEBHOOK_SECRET`: from a Stripe webhook pointed at `/api/stripe/webhook` with the events
  `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`.
  Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Turn on Stripe Tax and add your NC/SC registrations in the Stripe dashboard. Checkout uses `automatic_tax`.

Prices live in the `addon_catalog` table, so you can change them without a deploy.

### Testing add-ons without Stripe

Set `DEV_UNLOCK_ALL_ADDONS=true` in `.env.local` (or for Vercel **Preview** only). Any wedding that
opens the couple dashboard gets every paid add-on, so you can build and test them. Checkout still works.

- It is ignored on Vercel **Production** (`VERCEL_ENV=production`), even if set.
- It works by adding real `couple_addons` rows (`source = 'admin'`, 5 years), because the database
  rules check them too. Real purchases are never overwritten.
- Turning it off doesn't remove those rows. To lock a dev database again:
  `delete from couple_addons where source = 'admin';`

## File storage (Cloudflare R2)

All uploads go through `src/lib/storage` (see `r2-storage-migration-spec.md`). Each area (avatars,
portfolio, knowledge, sites, guest-photos) lives in **R2** or **Supabase Storage**; the default is
Supabase, so nothing changes until you switch.

Server-only env vars (never `NEXT_PUBLIC_`), in `.env.local` and on Vercel:

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: an R2 API token with
  **Object Read & Write**, scoped to the one bucket.
- `R2_BUCKET`: e.g. `knotly-files` (private; no public access, no custom domain).
- `STORAGE_PROVIDER=r2` moves every area. Or move some first: `STORAGE_R2_AREAS=sites,portfolio`.

Setup, once:

1. Create the bucket and token in Cloudflare. Add the CORS rules in `docs/r2-cors.json`
   (bucket → Settings → CORS policy). Add any custom preview domains you use.
2. Copy existing files: `node --env-file=.env.local --experimental-strip-types scripts/storage-copy-to-r2.mts --dry-run`,
   then without `--dry-run`. Safe to re-run.
3. Set `STORAGE_R2_AREAS` (or `STORAGE_PROVIDER=r2`) and redeploy. Run the copy script once more
   right after, to catch files uploaded in between.
4. Keep the Supabase buckets for a few weeks as a fallback. Switching back is just the env var.

How files are served:

- Public images (portfolio, website photos) use `/media/{area}/{path}`, which redirects to a 24-hour
  signed R2 link. Vercel's CDN caches the redirect for an hour, so the bytes never pass through Vercel.
- Private files (avatars, guest photos, PDFs) get short signed links, only after the app checks who's asking.
- The browser uploads with a one-time ticket from the server, signed for that exact type and size.
  The server checks the file after upload (and deletes it if it doesn't fit).
