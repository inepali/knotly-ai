// src/app/api/auth/verify/route.ts
// Step 2 of sign-up: check the code, then set the password and record terms.
// Supabase only lets an anonymous user set a password after the email/phone is verified.
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Identifier, Password, TERMS_VERSION, fail, firstIssue } from "@/lib/auth";

const Body = z.intersection(
  Identifier,
  z.object({
    code: z.string().regex(/^\d{6,10}$/, "Enter the code we sent you."),
    password: Password,
    acceptedTerms: z.literal(true, "Please accept the terms."),
  })
);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { method, identifier, code, password } = parsed.data;

  const sb = await supabaseServer();
  const { data, error } =
    method === "email"
      ? await sb.auth.verifyOtp({ email: identifier.toLowerCase(), token: code, type: "email_change" })
      : await sb.auth.verifyOtp({ phone: identifier, token: code, type: "phone_change" });
  if (error || !data.user) return fail("That code didn't work. Check it or request a new one.");

  const { error: pwError } = await sb.auth.updateUser({ password });
  if (pwError) {
    console.error("[auth/verify] password", pwError.code, pwError.message);
    return fail(pwError.message);
  }

  // is_guest and email aren't user-editable (column grants), so the admin client writes them.
  await supabaseAdmin
    .from("profiles")
    .update({
      is_guest: false,
      ...(method === "email" ? { email: identifier.toLowerCase() } : { phone: identifier }),
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", data.user.id);

  return Response.json({ ok: true });
}
