// src/app/api/auth/verify/route.ts
// Step 2 of sign-up: check the code, then set the password and record terms.
// Supabase only lets an anonymous user set a password after the email/phone is verified.
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Identifier, Password, SignupRole, TERMS_VERSION, fail, firstIssue } from "@/lib/auth";
import { grantSignupCredit } from "@/lib/signup-credit";

const Body = z.intersection(
  Identifier,
  z.object({
    code: z.string().regex(/^\d{6,10}$/, "Enter the code we sent you."),
    password: Password,
    acceptedTerms: z.literal(true, "Please accept the terms."),
    role: SignupRole.default("couple"),
  })
);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { method, identifier, code, password, role } = parsed.data;

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

  // role, is_guest and email aren't user-editable (column grants), so the admin client
  // writes them. Guests start as 'couple'; an admin is never downgraded here.
  const { data: current } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  await supabaseAdmin
    .from("profiles")
    .update({
      ...(current?.role === "admin" ? {} : { role }),
      is_guest: false,
      // The code proved they own the phone (phone_verified gates the signup credit and texts).
      ...(method === "email" ? { email: identifier.toLowerCase() } : { phone: identifier, phone_verified: true }),
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", data.user.id);

  const finalRole = current?.role === "admin" ? "admin" : role;
  // Vendors: the verified code unlocks the $10 signup credit. It usually waits for the first
  // business save (it needs the business row); trying here covers a row that already exists.
  if (finalRole === "vendor") await grantSignupCredit(supabaseAdmin, data.user.id);

  return Response.json({ ok: true, role: finalRole });
}
