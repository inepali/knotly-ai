// src/app/api/auth/signin/route.ts
// Returning couple: sign in with a password, then fold anything they did as a guest
// today into their saved wedding. Saved values win; differences are returned.
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Identifier, credential, fail, firstIssue } from "@/lib/auth";

const Body = z.intersection(Identifier, z.object({ password: z.string().min(1, "Enter your password.") }));

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const sb = await supabaseServer();
  const {
    data: { user: before },
  } = await sb.auth.getUser();
  const guestId = before?.is_anonymous ? before.id : null;

  const { data, error } = await sb.auth.signInWithPassword({
    ...credential(parsed.data),
    password: parsed.data.password,
  } as Parameters<typeof sb.auth.signInWithPassword>[0]);
  if (error || !data.user) return fail("That email/phone and password don't match.", 401);

  let conflicts: unknown[] = [];
  if (guestId && guestId !== data.user.id) {
    const { data: c, error: mergeError } = await supabaseAdmin.rpc("merge_guest_into_user", {
      p_guest: guestId,
      p_user: data.user.id,
    });
    if (mergeError) console.error("[auth/signin] merge", mergeError.message);
    conflicts = c ?? [];
  }

  return Response.json({ ok: true, conflicts });
}
