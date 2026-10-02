// src/app/api/auth/reset/request/route.ts
// Forgot password, step 1: send a reset code to the account's email or phone.
// The reply is the same whether or not an account exists, so this can't be used
// to find out who has a Knotly account.
import { supabaseServer } from "@/lib/supabase/server";
import { Identifier, fail, firstIssue } from "@/lib/auth";

export async function POST(req: Request) {
  const parsed = Identifier.safeParse(await req.json());
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { method, identifier } = parsed.data;

  const sb = await supabaseServer();
  const { error } =
    method === "email"
      ? await sb.auth.resetPasswordForEmail(identifier.toLowerCase())
      : await sb.auth.signInWithOtp({ phone: identifier, options: { shouldCreateUser: false } });

  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_sms_send_rate_limit" || error?.status === 429)
    return fail("Too many codes sent. Please wait a few minutes and try again.", 429);
  // Anything else (including "no such user") is logged, not shown.
  if (error) console.error("[auth/reset/request]", error.code, error.message);

  return Response.json({ ok: true });
}
