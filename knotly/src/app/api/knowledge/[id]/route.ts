// src/app/api/knowledge/[id]/route.ts — (re)read one source, or remove it.
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail } from "@/lib/auth";
import { KNOWLEDGE_BUCKET, ingestKnowledge } from "@/lib/knowledge";

export const maxDuration = 60;

// RLS returns the source only to the vendor who owns it.
async function ownSource(id: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("vendor_knowledge").select("id, kind, file_path").eq("id", id).maybeSingle();
  return { sb, src: data };
}

// Start (or redo) learning from this source — after a PDF upload, or "Re-read".
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/knowledge/[id]">) {
  const { id } = await ctx.params;
  const { src } = await ownSource(id);
  if (!src) return fail("Not found.", 404);
  await supabaseAdmin
    .from("vendor_knowledge")
    .update({ status: "pending", error: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  after(() => ingestKnowledge(id));
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/knowledge/[id]">) {
  const { id } = await ctx.params;
  const { sb, src } = await ownSource(id);
  if (!src) return fail("Not found.", 404);
  const { error } = await sb.from("vendor_knowledge").delete().eq("id", id); // chunks cascade
  if (error) return fail(error.message, 500);
  if (src.file_path) await supabaseAdmin.storage.from(KNOWLEDGE_BUCKET).remove([src.file_path]);
  return Response.json({ ok: true });
}
