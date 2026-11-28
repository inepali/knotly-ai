// src/app/api/auth/signin/route.ts
// Sign-in is the same for couples, vendors and admins.
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { Identifier, credential, fail, firstIssue } from "@/lib/auth";
import { completeSignIn } from "@/lib/auth-session";
import { claimChatsFromCookies } from "@/lib/public-chat-session";

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

  const done = await completeSignIn(guestId, data.user.id);
  // Chats from vendors' public pages on this device move into Messages (couples only; checked in SQL).
  await claimChatsFromCookies(data.user.id);
  return Response.json({ ok: true, ...done });
}
