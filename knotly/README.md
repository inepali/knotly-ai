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
