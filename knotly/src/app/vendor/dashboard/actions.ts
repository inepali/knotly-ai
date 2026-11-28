"use server";
// Server actions behind the vendor dashboard's forms. Each one re-checks who is signed in
// (and that they're a vendor), then calls the shared server function in src/lib/actions.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { removeAvatar, saveAvatar } from "@/lib/actions/avatar";
import { vendorOrError } from "@/lib/vendor-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendOneEmail } from "@/lib/email";
import { requestSiteUrl } from "@/lib/site";
import { createWalletReloadSession } from "@/lib/stripe";
import { startWalletReload, type StartWalletReloadInput } from "@/lib/actions/wallet";
import { reportSpamLead, type ReportSpamInput } from "@/lib/actions/spam";
import { pageLeadTranscript, setPageLeadStatus, type SetPageLeadStatusInput } from "@/lib/page-leads";
import { cancelReviewRequest, sendReviewRequest } from "@/lib/actions/review-requests";
import type { CancelReviewRequestInput, SendReviewRequestInput } from "@/lib/review-requests";
import {
  deleteAddOn,
  deletePackage,
  deleteTestimonial,
  publishProfile,
  saveAddOns,
  saveBusinessProfile,
  savePackages,
  updateAddOn,
  updatePackage,
  type DeleteItemInput,
  type PublishProfileInput,
  type SaveAddOnsInput,
  type SaveBusinessProfileInput,
  type SavePackagesInput,
  type UpdateAddOnInput,
  type UpdatePackageInput,
} from "@/lib/actions/vendor-profile";
import {
  removeRule,
  saveAgentIdentity,
  saveCustomInstructions,
  saveRule,
  setAutonomy,
  type RemoveRuleInput,
  type SaveAgentIdentityInput,
  type SaveCustomInstructionsInput,
  type SaveRuleInput,
  type SetAutonomyInput,
} from "@/lib/actions/vendor-agent-settings";
import { resetFeedToken } from "@/lib/actions/calendar-feed";
import {
  saveConsultHours,
  setAvailability,
  type SaveConsultHoursInput,
  type SetAvailabilityInput,
} from "@/lib/actions/availability";

import {
  addPortfolioImage,
  addPortfolioVideo,
  deletePortfolioImage,
  deletePortfolioVideo,
  reorderPortfolio,
  requestPortfolioUpload,
  updatePortfolioImage,
  type AddPortfolioImageInput,
  type AddPortfolioVideoInput,
  type DeletePortfolioItemInput,
  type ReorderPortfolioInput,
  type RequestPortfolioUploadInput,
  type UpdatePortfolioImageInput,
} from "@/lib/actions/vendor-portfolio";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a shared action as the signed-in vendor and refreshes the dashboard's pages. */
async function run(
  fn: (sb: NonNullable<Awaited<ReturnType<typeof vendorOrError>>["sb"]>, userId: string) => Promise<{ ok: boolean; error?: string }>
): Promise<Result> {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await fn(me.sb, me.userId);
  if (!r.ok) return { ok: false, error: r.error ?? "Something went wrong." };
  revalidatePath("/vendor/dashboard", "layout");
  return { ok: true };
}

// Review requests: ask a past client (by email, or a couple from Knotly) to write a review.
export async function sendReviewRequestAction(i: SendReviewRequestInput) {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  const r = await sendReviewRequest(me.sb, me.userId, i, { admin: supabaseAdmin, send: sendOneEmail, siteUrl: await requestSiteUrl() });
  if (r.ok) revalidatePath("/vendor/dashboard/business");
  return r.ok ? { ok: true as const, emailed: r.data.emailed } : { ok: false as const, error: r.error };
}
export const cancelReviewRequestAction = async (i: CancelReviewRequestInput) => run((sb, u) => cancelReviewRequest(sb, u, i));

// The first save creates the business row, which is when the $10 signup credit can be granted.
export async function saveBusinessAction(i: SaveBusinessProfileInput) {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  const r = await saveBusinessProfile(me.sb, me.userId, i, { admin: supabaseAdmin });
  if (!r.ok) return { ok: false as const, error: r.error ?? "Something went wrong." };
  revalidatePath("/vendor/dashboard", "layout");
  return { ok: true as const, signupCreditCents: r.data.signupCreditCents };
}
export const publishAction = async (i: PublishProfileInput) => run((sb, u) => publishProfile(sb, u, i));
export const deleteReviewAction = async (i: DeleteItemInput) => run((sb, u) => deleteTestimonial(sb, u, i));

export const addPackagesAction = async (i: SavePackagesInput) => run((sb, u) => savePackages(sb, u, i));
export const updatePackageAction = async (i: UpdatePackageInput) => run((sb, u) => updatePackage(sb, u, i));
export const deletePackageAction = async (i: DeleteItemInput) => run((sb, u) => deletePackage(sb, u, i));
export const addAddOnsAction = async (i: SaveAddOnsInput) => run((sb, u) => saveAddOns(sb, u, i));
export const updateAddOnAction = async (i: UpdateAddOnInput) => run((sb, u) => updateAddOn(sb, u, i));
export const deleteAddOnAction = async (i: DeleteItemInput) => run((sb, u) => deleteAddOn(sb, u, i));

export const setAutonomyAction = async (i: SetAutonomyInput) => run((sb, u) => setAutonomy(sb, u, i));
export const saveRuleAction = async (i: SaveRuleInput) => run((sb, u) => saveRule(sb, u, i));
export const removeRuleAction = async (i: RemoveRuleInput) => run((sb, u) => removeRule(sb, u, i));
export const saveCustomInstructionsAction = async (i: SaveCustomInstructionsInput) =>
  run((sb, u) => saveCustomInstructions(sb, u, i));
export const saveAgentIdentityAction = async (i: SaveAgentIdentityInput) => run((sb, u) => saveAgentIdentity(sb, u, i));

// Portfolio: the browser gets upload tickets, sends the files to storage, then records them here.
export async function requestPortfolioUploadAction(i: RequestPortfolioUploadInput) {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  return requestPortfolioUpload(me.sb, me.userId, i);
}
// The public page and listings read on each request, so the dashboard refresh is enough.
export const addPortfolioImageAction = async (i: AddPortfolioImageInput) => run((sb, u) => addPortfolioImage(sb, u, i));
export const updatePortfolioImageAction = async (i: UpdatePortfolioImageInput) => run((sb, u) => updatePortfolioImage(sb, u, i));
export const deletePortfolioImageAction = async (i: DeletePortfolioItemInput) => run((sb, u) => deletePortfolioImage(sb, u, i));
export const reorderPortfolioAction = async (i: ReorderPortfolioInput) => run((sb, u) => reorderPortfolio(sb, u, i));
export const addPortfolioVideoAction = async (i: AddPortfolioVideoInput) => run((sb, u) => addPortfolioVideo(sb, u, i));
export const deletePortfolioVideoAction = async (i: DeletePortfolioItemInput) => run((sb, u) => deletePortfolioVideo(sb, u, i));

export async function signOutAction() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/signin");
}

// The photo shows in the sidebar on every page the vendor can open (dashboard and Messages).
export async function uploadAvatarAction(form: FormData): Promise<Result> {
  const r = await run((sb, u) => saveAvatar(sb, u, form.get("avatar")));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
export async function removeAvatarAction(): Promise<Result> {
  const r = await run((sb, u) => removeAvatar(sb, u));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export const resetCalendarLinkAction =async () => run((sb, u) => resetFeedToken(sb, u));
export const setAvailabilityAction =async (i: SetAvailabilityInput) => run((sb, u) => setAvailability(sb, u, i));
export const saveConsultHoursAction = async (i: SaveConsultHoursInput) => run((sb, u) => saveConsultHours(sb, u, i));

// Wallet reload: returns the Stripe Checkout URL; the browser goes there. The webhook credits it.
export async function startWalletReloadAction(i: StartWalletReloadInput) {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  const r = await startWalletReload(me.sb, me.userId, i, { createSession: createWalletReloadSession, siteUrl: await requestSiteUrl() });
  return r.ok ? { ok: true as const, url: r.data.url } : { ok: false as const, error: r.error };
}

// Report a charged lead as spam (within 14 days). An admin reviews it; approval returns the fee.
export const reportSpamLeadAction = async (i: ReportSpamInput) => run((sb, u) => reportSpamLead(sb, u, i));

// Leads from the chat on the public page: contacted / converted / spam (spam may give the fee back).
export async function setPageLeadStatusAction(i: SetPageLeadStatusInput) {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  const r = await setPageLeadStatus(me.sb, me.userId, i);
  if (!r.ok) return { ok: false as const, error: r.error };
  revalidatePath("/vendor/dashboard", "layout");
  return { ok: true as const, creditedCents: r.data.creditedCents };
}
export async function pageLeadTranscriptAction(leadId: string) {
  const me = await vendorOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  const r = await pageLeadTranscript(me.sb, leadId);
  return r.ok ? { ok: true as const, messages: r.data } : { ok: false as const, error: r.error };
}
