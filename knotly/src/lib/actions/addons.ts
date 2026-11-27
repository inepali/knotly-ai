// src/lib/actions/addons.ts — couple add-ons: what's for sale, what this wedding owns, and checkout.
import { z } from "zod";
import { betterBundle, buildCart, type Cart, type CatalogItem } from "@/lib/addons";
import { getProject } from "./wedding";
import { devUnlockAll } from "@/lib/dev-addons";
import { fail, ok, parseInput, type Sb } from "./result";

export type OwnedAddon = { addon_key: string; active_until: string; source: string };

async function loadCatalog(sb: Sb): Promise<CatalogItem[]> {
  const { data } = await sb.from("addon_catalog").select("*").eq("active", true).order("sort");
  return (data ?? []) as CatalogItem[];
}

async function loadOwned(sb: Sb, projectId: string): Promise<OwnedAddon[]> {
  const { data } = await sb
    .from("couple_addons")
    .select("addon_key, active_until, source")
    .eq("project_id", projectId);
  return (data ?? []) as OwnedAddon[];
}

const activeKeys = (owned: OwnedAddon[], now = Date.now()) =>
  owned.filter((o) => new Date(o.active_until).getTime() > now).map((o) => o.addon_key);

/** Catalog + what the couple owns (active or read-only) + their payments, for the Add-ons page. */
export async function listAddons(sb: Sb, userId: string) {
  const project = await getProject(sb, userId);
  const catalog = await loadCatalog(sb);
  if (!project) return ok({ projectId: null, catalog, owned: [] as OwnedAddon[], active: [] as string[], devUnlocked: devUnlockAll() });
  const owned = await loadOwned(sb, project.id);
  return ok({ projectId: project.id as string, catalog, owned, active: activeKeys(owned), devUnlocked: devUnlockAll() });
}

export const QuoteAddonsInput = z.object({ keys: z.array(z.string().min(1).max(40)).min(1).max(10) });
export type QuoteAddonsInput = z.input<typeof QuoteAddonsInput>;

/** What a checkout for these keys would contain and cost, plus a cheaper bundle if there is one. */
export async function quoteAddons(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(QuoteAddonsInput, input);
  if (!p.ok) return p;
  const project = await getProject(sb, userId);
  if (!project) return fail("Save your wedding details on My Wedding first.");
  const [catalog, owned] = await Promise.all([loadCatalog(sb), loadOwned(sb, project.id)]);
  const active = activeKeys(owned);
  const r = buildCart(catalog, p.data.keys, active);
  if (!r.ok) return fail(r.error);
  return ok({ projectId: project.id as string, cart: r.cart, better: betterBundle(catalog, r.cart, active) });
}

export type CheckoutDeps = {
  createSession: (p: {
    cart: Cart;
    projectId: string;
    email?: string | null;
    successUrl: string;
    cancelUrl: string;
  }) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  siteUrl: string;
};

/** Start Stripe Checkout for these add-ons. Prices come from the catalog, never from the browser. */
export async function startAddonCheckout(sb: Sb, userId: string, input: unknown, deps: CheckoutDeps) {
  const q = await quoteAddons(sb, userId, input);
  if (!q.ok) return q;
  const { cart, projectId } = q.data;
  if (cart.total_cents < 50) return fail("Nothing to pay for here."); // Stripe's minimum charge
  const { data: profile } = await sb.from("profiles").select("email").eq("id", userId).maybeSingle();
  const base = `${deps.siteUrl}/client/dashboard/add-ons`;
  const s = await deps.createSession({
    cart,
    projectId,
    email: profile?.email ?? null,
    successUrl: `${base}?unlocked=${encodeURIComponent(cart.keys.join(","))}`,
    cancelUrl: `${base}?canceled=1`,
  });
  return s.ok ? ok({ url: s.url }) : fail(s.error);
}
