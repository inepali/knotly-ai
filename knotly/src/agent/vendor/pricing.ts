// src/agent/vendor/pricing.ts
import type { Decision } from "./decide";
import type { VendorCtx } from "./context";

export function priceQuote(d: Decision, ctx: VendorCtx) {
  if (d.responseType !== "quote" || !d.quote) return null;
  const pkg = ctx.packages.find((p) => p.id === d.quote!.packageId);
  if (!pkg) return null;
  const lines = [{ label: `${pkg.name} package`, amount: pkg.price }];
  // Add-ons at the vendor's listed price; unknown ids are left out (the gate flags them).
  for (const id of d.quote.addOnIds) {
    const addOn = ctx.addOns.find((a) => a.id === id);
    if (addOn) lines.push({ label: addOn.name, amount: addOn.price });
  }
  // The discount applies to the package only, never to add-ons.
  const discount = Math.round(pkg.price * (d.quote.discountPercent / 100));
  if (discount > 0)
    lines.push({ label: `${d.quote.discountPercent}% off`, amount: -discount });
  return {
    packageId: pkg.id,
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
  };
}
export type Priced = NonNullable<ReturnType<typeof priceQuote>>;
