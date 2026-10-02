// src/app/api/auth/verify/route.ts
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TERMS_VERSION = "2026-09";

export async function POST(req: Request) {
  const { email, code, acceptedTerms } = await req.json();
  if (!acceptedTerms)
    return Response.json(
      { ok: false, error: "Please accept the terms." },
      { status: 400 }
    );

  const { data: pending } = await supabaseAdmin
    .from("pending_verifications")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();
  if (!pending)
    return Response.json({ ok: false, error: "Start again." }, { status: 400 });

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: pending.mode === "upgrade" ? "email_change" : "email",
  });
  if (error || !data.user)
    return Response.json(
      { ok: false, error: "That code didn't work." },
      { status: 400 }
    );

  const userId = data.user.id;
  let conflicts: unknown[] = [];
  if (pending.mode === "existing") {
    const { data: c } = await supabaseAdmin.rpc("merge_guest_into_user", {
      p_guest: pending.guest_id,
      p_user: userId,
    });
    conflicts = c ?? [];
  }
  await supabaseAdmin
    .from("profiles")
    .update({
      is_guest: false,
      email,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", userId);
  await supabaseAdmin
    .from("pending_verifications")
    .delete()
    .eq("email", email.toLowerCase());

  return Response.json({
    ok: true,
    returning: pending.mode === "existing",
    conflicts,
  });
}
