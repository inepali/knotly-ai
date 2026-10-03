// src/agent/vendor/estimate.ts
// Turns the agent's quote choice into an estimate. The model only picks a package,
// add-ons and a discount; the numbers are computed here and checked against the
// vendor's rules, so a price in a draft can never be invented.
import type { Decision } from "./decide";
import type { VendorCtx } from "./context";

export type Estimate = {
  packageName: string;
  lines: { label: string; amount: number }[];
  subtotal: number;
  discountPercent: number;
  discount: number;
  total: number;
  validUntil: string; // YYYY-MM-DD
  warnings: string[]; // for the vendor's review only; never shown to the couple
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export function buildEstimate(ctx: VendorCtx, quote: NonNullable<Decision["quote"]>): Estimate | null {
  const pkg = ctx.packages.find((p) => p.id === quote.packageId);
  if (!pkg) return null; // not one of their packages: no estimate, the draft says so in warnings upstream

  const warnings: string[] = [];
  // Add-ons only from the vendor's own list, at their listed price.
  const chosen = quote.addOnIds.map((id) => ctx.addOns.find((a) => a.id === id));
  if (chosen.some((a) => !a)) warnings.push("The assistant named an add-on you don't offer; it was left out.");
  const lines = [
    { label: pkg.name, amount: pkg.price },
    ...chosen.filter((a) => !!a).map((a) => ({ label: a.name, amount: a.price })),
  ];

  // Discounts only within the vendor's max_discount rule (none allowed without one).
  const maxRule = ctx.rules.find((r) => r.kind === "max_discount");
  const maxPct = maxRule?.kind === "max_discount" ? maxRule.percent : 0;
  const discountPercent = Math.min(quote.discountPercent, maxPct);
  if (discountPercent < quote.discountPercent)
    warnings.push(
      maxPct
        ? `The assistant wanted ${quote.discountPercent}% off; capped at your ${maxPct}% maximum.`
        : `The assistant wanted ${quote.discountPercent}% off, but you have no discount rule, so none was applied.`
    );

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const discount = Math.round((subtotal * discountPercent) / 100);
  const total = subtotal - discount;

  const floor = ctx.rules.find((r) => r.kind === "price_floor");
  if (floor?.kind === "price_floor" && total < floor.amount)
    warnings.push(`Total ${usd(total)} is below your price floor of ${usd(floor.amount)}.`);
  if (ctx.dateStatus !== "open") warnings.push(`Your calendar shows the wedding date as "${ctx.dateStatus}".`);

  const days = ctx.settings?.quote_valid_days ?? 14;
  const validUntil = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  return { packageName: pkg.name, lines, subtotal, discountPercent, discount, total, validUntil, warnings };
}

// Plain-text block appended to the couple-facing message.
export function formatEstimate(e: Estimate) {
  const rows = e.lines.map((l) => `  ${l.label}: ${usd(l.amount)}`);
  if (e.discount) rows.push(`  Discount (${e.discountPercent}%): −${usd(e.discount)}`);
  const valid = new Date(`${e.validUntil}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "long" });
  return ["Estimate", ...rows, `  Total: ${usd(e.total)}`, `Valid until ${valid}.`].join("\n");
}
