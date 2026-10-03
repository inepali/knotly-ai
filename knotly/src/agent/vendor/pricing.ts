// src/agent/vendor/pricing.ts
import type { Decision } from "./decide";
import type { VendorCtx } from "./context";

export function priceQuote(d: Decision, ctx: VendorCtx) {
  if (d.responseType !== "quote" || !d.quote) return null;
  const pkg = ctx.packages.find((p) => p.id === d.quote!.packageId);
  if (!pkg) return null;
  const lines = [{ label: `${pkg.name} package`, amount: pkg.price }];
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
