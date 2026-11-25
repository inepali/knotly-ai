// src/app/api/auth/signup/route.ts
// Step 1 of turning a guest into an account: attach an email/phone and send a code.
// The guest keeps the same user id, so their saved wedding comes along.
import { supabaseServer } from "@/lib/supabase/server";
import { Identifier, credential, fail, firstIssue } from "@/lib/auth";

export async function POST(req: Request) {
  const parsed = Identifier.safeParse(await req.json());
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const sb = await supabaseServer();
  let {
    data: { user },
  } = await sb.auth.getUser();
  // Arriving from the sign-up page with no session: start the (anonymous) session here.
  // Supabase only lets an anonymous user attach an email/phone and set a password after
  // verifying it, so sign-up always passes through one.
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error || !data.user) {
      console.error("[auth/signup] anonymous start", error?.code, error?.message);
      return fail("Couldn't start sign-up. Please try again.");
    }
    user = data.user;
  }
  if (!user.is_anonymous) return fail("You're already signed in.");

  const { error } = await sb.auth.updateUser(credential(parsed.data));
  if (error?.code === "email_exists" || error?.code === "phone_exists")
    return Response.json(
      { ok: false, exists: true, error: "You already have an account. Please sign in." },
      { status: 409 }
    );
  if (error) {
    console.error("[auth/signup]", error.code, error.message);
    return fail(
      error.code === "over_email_send_rate_limit" || error.code === "over_sms_send_rate_limit"
        ? "Too many codes sent. Please wait a few minutes and try again."
        : error.message
    );
  }
  return Response.json({ ok: true });
}
