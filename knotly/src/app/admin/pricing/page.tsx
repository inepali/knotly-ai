// Admin: vendor pricing (pricing_config). One default row, plus optional per-metro overrides.
// Changes apply to new estimates, texts and reloads; an estimate keeps the fee it was sent with.
import { requireAdmin } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPricing, type PricingRow } from "@/lib/actions/pricing";
import PricingForm from "@/components/admin/PricingForm";
import { panelClasses } from "@/components/ui/fields";

export const metadata = { title: "Pricing · Knotly admin" };

export default async function PricingPage(props: PageProps<"/admin/pricing">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const add = typeof sp.add === "string" ? sp.add : "";
  const { rows, metros, metrosWithoutOverride } = await loadPricing(supabaseAdmin);
  const def = rows.find((r) => r.metro_slug === null);
  const overrides = rows.filter((r) => r.metro_slug !== null);
  const metroName = (slug: string) => {
    const m = metros.find((x) => x.slug === slug);
    return m ? `${m.name}, ${m.state}` : slug;
  };
  const adding = def && add && metrosWithoutOverride.some((m) => m.slug === add) ? ({ ...def, metro_slug: add } as PricingRow) : null;
  const updated = (r: PricingRow) => new Date(r.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Vendor pricing</h1>
      <p className="mt-1 text-sm text-gray-600">
        Applies to new estimates, texts and reloads. Estimates already sent keep the fee they were sent with.
      </p>

      {def ? (
        <section className={`${panelClasses} mt-6 p-6`} aria-label="Default prices">
          <h2 className="mb-1 font-semibold">Default (every metro without its own prices)</h2>
          <p className="mb-4 text-xs text-gray-500">Last changed {updated(def)}</p>
          <PricingForm row={def} metroSlug={null} canRemove={false} />
        </section>
      ) : (
        <p className="mt-6 text-sm text-red-700">The default pricing row is missing. Run the wallet migrations.</p>
      )}

      {overrides.map((r) => (
        <section key={r.metro_slug} className={`${panelClasses} mt-6 p-6`} aria-label={`${metroName(r.metro_slug!)} prices`}>
          <h2 className="mb-1 font-semibold">{metroName(r.metro_slug!)}</h2>
          <p className="mb-4 text-xs text-gray-500">Last changed {updated(r)}</p>
          <PricingForm row={r} metroSlug={r.metro_slug} canRemove />
        </section>
      ))}

      {adding && (
        <section className={`${panelClasses} mt-6 p-6`} aria-label="New metro prices">
          <h2 className="mb-1 font-semibold">{metroName(adding.metro_slug!)} (new, starts from the default)</h2>
          <p className="mb-4 text-xs text-gray-500">Not saved yet.</p>
          <PricingForm row={adding} metroSlug={adding.metro_slug} canRemove={false} />
        </section>
      )}

      {metrosWithoutOverride.length > 0 && (
        <form className="mt-6 flex flex-wrap items-center gap-2 text-sm" action="/admin/pricing">
          <label htmlFor="add-metro" className="text-gray-700">
            Set different prices for
          </label>
          <select id="add-metro" name="add" defaultValue={add} className="rounded-lg border border-gray-300 px-2 py-1.5">
            {metrosWithoutOverride.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}, {m.state}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700">
            Add
          </button>
        </form>
      )}
    </main>
  );
}
