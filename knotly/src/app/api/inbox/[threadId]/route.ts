// src/app/api/inbox/[threadId]/route.ts — one conversation, oldest first.
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer, isMine, loadThread } from "@/lib/mailbox";
import { fail } from "@/lib/auth";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inbox/[threadId]">) {
  const { threadId } = await ctx.params;
  const sb = await supabaseServer();
  const viewer = await getViewer(sb);
  if (!viewer) return fail("Please sign in.", 401);
  const items = await loadThread(sb, viewer.side, threadId);
  if (!items.length) return fail("Not found.", 404);
  return Response.json({
    ok: true,
    side: viewer.side,
    items: items.map((m) => ({ ...m, mine: isMine(m.sender, viewer.side) })),
  });
}
