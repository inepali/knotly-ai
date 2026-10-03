// src/app/vendor/inbox/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import EscalationCard from "@/components/vendor/EscalationCard";

export default async function Inbox() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/vendor/login");

  const { data: items } = await sb
    .from("escalations")
    .select("id, thread_id, reason, decision, total, status, created_at")
    .neq("status", "resolved")
    .order("created_at");

  // The couple's latest message for each
  const threadIds = (items ?? []).map((e) => e.thread_id);
  const { data: msgs } = await sb
    .from("messages")
    .select("thread_id, body, created_at")
    .in("thread_id", threadIds)
    .in("sender", ["couple", "couple_agent"])
    .eq("status", "sent")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">
        Needs you ({items?.length ?? 0})
      </h1>
      {!items?.length && (
        <p className="text-gray-500">
          All clear. Your agent is handling everything.
        </p>
      )}
      {items?.map((e) => (
        <EscalationCard
          key={e.id}
          esc={e}
          coupleMessage={
            msgs?.find((m) => m.thread_id === e.thread_id)?.body ?? ""
          }
        />
      ))}
    </main>
  );
}
