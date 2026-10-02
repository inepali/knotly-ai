// src/app/api/inbox/route.ts — the signed-in user's mailbox, for the chat's Inbox tab.
// Same data as the /inbox page; RLS limits it to their own conversations.
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer, loadMailbox } from "@/lib/mailbox";
import { fail } from "@/lib/auth";

export async function GET() {
  const sb = await supabaseServer();
  const viewer = await getViewer(sb);
  if (!viewer) return fail("Please sign in.", 401);
  return Response.json({ ok: true, side: viewer.side, items: await loadMailbox(sb, viewer.side) });
}
