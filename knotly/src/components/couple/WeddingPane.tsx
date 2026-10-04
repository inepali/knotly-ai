// src/components/couple/WeddingPane.tsx — the couple's permanent "My Wedding" tab:
// their saved plan, loaded from the database (RLS: their own wedding only).
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import WeddingCard from "@/components/chat/cards/WeddingCard";

type Data = Parameters<typeof WeddingCard>[0]["data"];

export default function WeddingPane({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let off = false;
    const sb = supabaseBrowser();
    sb.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return;
      const { data: row } = await sb
        .from("couple_projects")
        .select("partner_names, wedding_date, metro_slug, venue, guest_count, budget_total, style, needs")
        .eq("couple_id", auth.user.id)
        .limit(1)
        .maybeSingle();
      if (!off) setData(row ?? { empty: true });
    });
    return () => {
      off = true;
    };
  }, [refreshKey]); // reload when the assistant saves wedding details

  if (!data) return <p className="text-sm text-gray-500">Loading your wedding…</p>;
  return (
    <div className="rounded-3xl bg-white p-6 shadow-lg shadow-gray-900/5 ring-1 ring-gray-900/5">
      <WeddingCard data={data} />
    </div>
  );
}
