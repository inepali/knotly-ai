// src/app/api/auth/reset/confirm/route.ts
// Forgot password, step 2: check the code (which signs the user in), then set the
// new password. Afterwards it behaves like a normal sign-in, including the guest merge.
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { Identifier, Password, fail, firstIssue } from "@/lib/auth";
import { completeSignIn } from "@/lib/auth-session";

const Body = z.intersection(
  Identifier,
  z.object({
    code: z.string().regex(/^\d{6,10}$/, "Enter the code we sent you."),
    password: Password,
  })
);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { method, identifier, code, password } = parsed.data;

  const sb = await supabaseServer();
  const {
    data: { user: before },
  } = await sb.auth.getUser();
  const guestId = before?.is_anonymous ? before.id : null;

  const { data, error } =
    method === "email"
      ? await sb.auth.verifyOtp({ email: identifier.toLowerCase(), token: code, type: "recovery" })
      : await sb.auth.verifyOtp({ phone: identifier, token: code, type: "sms" });
  if (error || !data.user) return fail("That code didn't work. Check it or request a new one.");

  const { error: pwError } = await sb.auth.updateUser({ password });
  if (pwError) {
    console.error("[auth/reset/confirm] password", pwError.code, pwError.message);
    return fail(
      pwError.code === "same_password" ? "Choose a password you haven't used before." : pwError.message
    );
  }

  return Response.json({ ok: true, ...(await completeSignIn(guestId, data.user.id)) });
}
