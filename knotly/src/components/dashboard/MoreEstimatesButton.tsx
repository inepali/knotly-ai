// src/components/dashboard/MoreEstimatesButton.tsx — "Get 5 more estimates" for one category.
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { moreEstimatesAction } from "@/app/client/dashboard/actions";

export default function MoreEstimatesButton({ category }: { category: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        color="cyan"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await moreEstimatesAction(category);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Asking…" : "Get 5 more estimates"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
