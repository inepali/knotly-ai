"use server";
// Server actions behind the couple dashboard's forms. Each one re-checks who is signed in,
// then calls the shared function in src/lib/actions (the shared server functions).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { removeAvatar, saveAvatar } from "@/lib/actions/avatar";
import { coupleOrError } from "@/lib/couple-session";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshVendorEmbedding } from "@/lib/embeddings";
import { submitClientReview } from "@/lib/actions/review-requests";
import type { WriteReviewInput } from "@/lib/review-requests";
import { startAddonCheckout } from "@/lib/actions/addons";
import {
  deleteEvent,
  deleteHousehold,
  importHouseholds,
  saveEvent,
  saveHousehold,
  setGuestCountFromList,
  type DeleteHouseholdInput,
  type HouseholdInput,
  type ImportHouseholdsInput,
  type SaveEventInput,
} from "@/lib/actions/guests";
import {
  addSitePhoto,
  checkSlug,
  moveSitePhoto,
  publishSite,
  removeSitePhoto,
  requestSitePhotoUpload,
  saveSite,
  setSitePassword,
  type PublishSiteInput,
  type SaveSiteInput,
  type SetSitePasswordInput,
  type SitePhotoInput,
  type SitePhotoRef,
  type SiteUploadInput,
} from "@/lib/actions/website";
import { saveRsvpSettings, sendRsvpReminders, type SaveRsvpSettingsInput } from "@/lib/actions/rsvp";
import { sendEmailBatch, sendRsvpReminder } from "@/lib/email";
import { saveDesign, sendInvitations, type SaveDesignInput, type SendInvitationsInput } from "@/lib/actions/invitations";
import {
  deleteGiftNote,
  deleteRegistryFund,
  deleteRegistryItem,
  deleteRegistryLink,
  removeClaim,
  saveRegistryFund,
  saveRegistryIntro,
  saveRegistryItem,
  saveRegistryLink,
  type IdInput,
  type IntroInput,
  type SaveFundInput,
  type SaveItemInput,
  type SaveLinkInput,
} from "@/lib/actions/registry";
import { addTables, deleteTable, saveTable, setSeats, type AddTablesInput, type SaveTableInput, type SetSeatsInput, type TableIdInput } from "@/lib/actions/seating";
import { deletePhotos, moderatePhotos, setPhotoSettings, type DeletePhotosInput, type ModerateInput, type PhotoSettingsInput } from "@/lib/actions/photo-share";
import { deleteGift, importFromRegistry, markThanked, saveGift, type GiftIdInput, type SaveGiftInput, type ThankedInput } from "@/lib/actions/thank-you";
import { createCheckoutSession } from "@/lib/stripe";
import { requestSiteUrl } from "@/lib/site";
import { saveWeddingForm, type SaveWeddingFormInput } from "@/lib/actions/wedding";
import { postProject, requestMoreEstimates } from "@/lib/actions/posting";
import {
  applyDefaultBudgetSplit,
  planBudget,
  recordBooking,
  type PlanBudgetInput,
  type RecordBookingInput,
} from "@/lib/actions/budget";

type Result = { ok: true } | { ok: false; error: string };
const DASH = "/client/dashboard";

function refresh() {
  revalidatePath(DASH, "layout");
}

export async function signOutAction() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/signin");
}

export async function uploadAvatarAction(formData: FormData): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await saveAvatar(me.sb, me.userId, formData.get("avatar"));
  if (!r.ok) return r;
  revalidatePath("/", "layout"); // the photo also shows in the sidebar on Messages
  return { ok: true };
}

export async function removeAvatarAction(): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await removeAvatar(me.sb, me.userId);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveWeddingAction(input: SaveWeddingFormInput): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await saveWeddingForm(me.sb, me.userId, input);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

/** Save the form, then post it, so "Post to vendors" always posts what's on screen. */
export async function saveAndPostAction(input: SaveWeddingFormInput): Promise<Result & { matched?: Record<string, number> }> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const saved = await saveWeddingForm(me.sb, me.userId, input);
  if (!saved.ok) return saved;
  const posted = await postProject(me.sb, me.userId);
  if (!posted.ok) return posted;
  refresh();
  return { ok: true, matched: posted.data.matched };
}

export async function moreEstimatesAction(category: string): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await requestMoreEstimates(me.sb, me.userId, { category });
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function planBudgetAction(input: PlanBudgetInput): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await planBudget(me.sb, me.userId, input);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function suggestBudgetAction(): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await applyDefaultBudgetSplit(me.sb, me.userId);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function recordBookingAction(input: RecordBookingInput): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await recordBooking(me.sb, me.userId, input);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

// Add-ons: Stripe Checkout. Returns the hosted checkout URL; the browser goes there.
export async function startAddonCheckoutAction(keys: string[]): Promise<Result & { url?: string }> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await startAddonCheckout(me.sb, me.userId, { keys }, { createSession: createCheckoutSession, siteUrl: await requestSiteUrl() });
  return r.ok ? { ok: true, url: r.data.url } : r;
}

// Guest List (free). Each action re-checks the signed-in couple; RLS keeps rows to their own wedding.
type Shared<I> = (sb: NonNullable<Awaited<ReturnType<typeof coupleOrError>>["sb"]>, userId: string, input: I) => Promise<{ ok: boolean; error?: string }>;
async function asCouple<I>(fn: Shared<I>, input: I): Promise<Result> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await fn(me.sb, me.userId, input);
  if (!r.ok) return { ok: false, error: r.error ?? "Something went wrong." };
  refresh();
  return { ok: true };
}
export const saveHouseholdAction = async (i: HouseholdInput) => asCouple(saveHousehold, i);
export const deleteHouseholdAction = async (i: DeleteHouseholdInput) => asCouple(deleteHousehold, i);
export const importHouseholdsAction = async (i: ImportHouseholdsInput) => asCouple(importHouseholds, i);
export const applyGuestCountAction = async () => asCouple((sb, u) => setGuestCountFromList(sb, u), undefined);
export const saveEventAction = async (i: SaveEventInput) => asCouple(saveEvent, i);
export const deleteEventAction = async (i: DeleteHouseholdInput) => asCouple(deleteEvent, i);

// Wedding Website (add-on). RLS also refuses writes without an active add-on.
export const saveSiteAction = async (i: SaveSiteInput) => asCouple(saveSite, i);
export const checkSlugAction = async (slug: string) => asCouple(checkSlug, { slug });
export const setSitePasswordAction = async (i: SetSitePasswordInput) => asCouple(setSitePassword, i);
export const publishSiteAction = async (i: PublishSiteInput) => {
  const r = await asCouple(publishSite, i);
  if (r.ok) revalidatePath("/w/[slug]", "page");
  return r;
};
// Returns data (the upload ticket) and doesn't refresh, unlike asCouple.
export async function requestSitePhotoUploadAction(i: SiteUploadInput) {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  return requestSitePhotoUpload(me.sb, me.userId, i);
}
export const addSitePhotoAction = async (i: SitePhotoInput) => asCouple(addSitePhoto, i);
export const removeSitePhotoAction = async (i: SitePhotoRef) => asCouple(removeSitePhoto, i);
export const moveSitePhotoAction = async (i: SitePhotoRef) => asCouple(moveSitePhoto, i);

// RSVP (add-on).
export const saveRsvpSettingsAction = async (i: SaveRsvpSettingsInput) => asCouple(saveRsvpSettings, i);
export async function sendRsvpRemindersAction(): Promise<Result & { sent?: number }> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await sendRsvpReminders(me.sb, me.userId, { send: sendRsvpReminder, siteUrl: await requestSiteUrl() });
  if (!r.ok) return r;
  refresh();
  return { ok: true, sent: r.data.sent };
}

// Gift Registry (add-on).
export const saveRegistryIntroAction = async (i: IntroInput) => asCouple(saveRegistryIntro, i);
export const saveRegistryLinkAction = async (i: SaveLinkInput) => asCouple(saveRegistryLink, i);
export const deleteRegistryLinkAction = async (i: IdInput) => asCouple(deleteRegistryLink, i);
export const saveRegistryFundAction = async (i: SaveFundInput) => asCouple(saveRegistryFund, i);
export const deleteRegistryFundAction = async (i: IdInput) => asCouple(deleteRegistryFund, i);
export const saveRegistryItemAction = async (i: SaveItemInput) => asCouple(saveRegistryItem, i);
export const deleteRegistryItemAction = async (i: IdInput) => asCouple(deleteRegistryItem, i);
export const removeClaimAction = async (i: IdInput) => asCouple(removeClaim, i);
export const deleteGiftNoteAction = async (i: IdInput) => asCouple(deleteGiftNote, i);

// Save-the-Dates & Invitations (add-on).
export const saveDesignAction = async (i: SaveDesignInput) => asCouple(saveDesign, i);
export async function sendInvitationsAction(i: SendInvitationsInput): Promise<Result & { sent?: number; failed?: number }> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await sendInvitations(me.sb, me.userId, i, { sendBatch: sendEmailBatch, siteUrl: await requestSiteUrl() });
  if (!r.ok) return r;
  refresh();
  return { ok: true, sent: r.data.sent, failed: r.data.failed };
}

// Seating Chart (add-on).
export const saveTableAction = async (i: SaveTableInput) => asCouple(saveTable, i);
export const addTablesAction = async (i: AddTablesInput) => asCouple(addTables, i);
export const deleteTableAction = async (i: TableIdInput) => asCouple(deleteTable, i);
export const setSeatsAction = async (i: SetSeatsInput) => asCouple(setSeats, i);

// Guest Photo Sharing (add-on).
export const setPhotoSettingsAction = async (i: PhotoSettingsInput) => asCouple(setPhotoSettings, i);
export const moderatePhotosAction = async (i: ModerateInput) => asCouple(moderatePhotos, i);
export const deletePhotosAction = async (i: DeletePhotosInput) => asCouple(deletePhotos, i);

// Thank-You Tracker (add-on).
export const saveGiftAction = async (i: SaveGiftInput) => asCouple(saveGift, i);
export const markThankedAction = async (i: ThankedInput) => asCouple((sb, u, x) => markThanked(sb, u, x), i);
export const deleteGiftAction = async (i: GiftIdInput) => asCouple(deleteGift, i);
export async function importGiftsAction(): Promise<Result & { added?: number; matched?: number }> {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false, error: me.error };
  const r = await importFromRegistry(me.sb, me.userId);
  if (!r.ok) return r;
  refresh();
  return { ok: true, ...r.data };
}

// Reviews a vendor asked this couple for. Written as "Verified Knotly client".
export async function submitClientReviewAction(i: WriteReviewInput & { requestId: string }) {
  const me = await coupleOrError();
  if (me.error !== undefined) return { ok: false as const, error: me.error };
  const r = await submitClientReview(me.sb, supabaseAdmin, me.userId, i);
  if (!r.ok) return { ok: false as const, error: r.error };
  after(() => refreshVendorEmbedding(r.data.vendorId));
  revalidatePath("/client/dashboard", "layout");
  return { ok: true as const };
}
