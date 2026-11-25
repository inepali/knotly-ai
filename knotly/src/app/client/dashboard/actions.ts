"use server";
// Server actions behind the couple dashboard's forms. Each one re-checks who is signed in,
// then calls the shared function in src/lib/actions (the shared server functions).
import { revalidatePath } from "next/cache";
import { coupleOrError } from "@/lib/couple-session";
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
