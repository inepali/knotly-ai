// src/app/api/auth/start/route.ts
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { email } = await req.json();
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.is_anonymous)
    return Response.json(
      { ok: false, error: "Already signed in" },
      { status: 400 }
    );

  let mode: "upgrade" | "existing" = "upgrade";
  const { error } = await sb.auth.updateUser({ email }); // new email: sends a code
  if (error?.code === "email_exists") {
    mode = "existing";
    await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
  } else if (error) {
    return Response.json(
      { ok: false, error: "Please check the email address." },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("pending_verifications")
    .upsert({
      email: email.toLowerCase(),
      guest_id: user.id,
      mode,
      created_at: new Date().toISOString(),
    });
  return Response.json({ ok: true }); // identical either way
}
