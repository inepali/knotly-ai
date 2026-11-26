// src/components/addons/BuyButton.tsx — send the couple to Stripe Checkout for these add-ons.
"use client";
import { Button } from "@/components/ui/Button";
import { startAddonCheckoutAction } from "@/app/client/dashboard/actions";
import { useAction } from "@/components/dashboard/useAction";

export default function BuyButton({
  keys,
  label,
  variant = "solid",
}: {
  keys: string[];
  label: string;
  variant?: "solid" | "outline";
}) {
  const buy = useAction();
  const go = () =>
    buy.run(async () => {
      const r = await startAddonCheckoutAction(keys);
      if (r.ok && r.url) window.location.assign(r.url);
      return r;
    });
  return (
    <div>
      {variant === "solid" ? (
        <Button type="button" color="cyan" disabled={buy.pending} onClick={go}>
          {buy.pending ? "Opening checkout…" : label}
        </Button>
      ) : (
        <Button type="button" variant="outline" color="gray" disabled={buy.pending} onClick={go}>
          {buy.pending ? "Opening checkout…" : label}
        </Button>
      )}
      {buy.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {buy.error}
        </p>
      )}
    </div>
  );
}
