"use server";
// Server actions for Knotly admins. Each re-checks profiles.role = 'admin', then uses the
// service-role client; the database functions check the admin again (assert_admin).
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { adminOrError } from "@/lib/admin-session";
import { notify } from "@/lib/email";
import { banSpamCouple, resolveSpamReport } from "@/lib/actions/spam";
import { removeMetroPricing, savePricing, type PricingInput } from "@/lib/actions/pricing";

type Result = { ok: true } | { ok: false; error: string };

export async function resolveSpamReportAction(reportId: string, approve: boolean): Promise<Result> {
  const me = await adminOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await resolveSpamReport(supabaseAdmin, me.userId, { reportId, approve }, { send: notify });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/admin/spam-reports");
  return { ok: true };
}

// Bans the couple's sign-in for good and credits every vendor they cost a lead.
export async function banSpamCoupleAction(coupleId: string): Promise<Result> {
  const me = await adminOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await banSpamCouple(supabaseAdmin, me.userId, { coupleId }, {
    send: notify,
    ban: async (id) => {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "876000h" }); // ~100 years
      return { error: error ? { message: error.message } : null };
    },
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/admin/spam-reports");
  return { ok: true };
}

// Pricing (pricing_config). Applies to new estimates, texts and reloads.
export async function savePricingAction(input: PricingInput): Promise<Result> {
  const me = await adminOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await savePricing(supabaseAdmin, me.userId, input);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/admin/pricing");
  return { ok: true };
}

export async function removeMetroPricingAction(metroSlug: string): Promise<Result> {
  const me = await adminOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await removeMetroPricing(supabaseAdmin, { metroSlug });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/admin/pricing");
  return { ok: true };
}
