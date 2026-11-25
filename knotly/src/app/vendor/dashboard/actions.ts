"use server";
// Server actions behind the vendor dashboard's forms. Each one re-checks who is signed in
// (and that they're a vendor), then calls the shared function in src/lib/actions, the same
// one the chat tools use.
import { revalidatePath } from "next/cache";
import { vendorOrError } from "@/lib/vendor-session";
import {
  addTestimonials,
  deleteAddOn,
  deletePackage,
  deleteTestimonial,
  publishProfile,
  saveAddOns,
  saveBusinessProfile,
  savePackages,
  updateAddOn,
  updatePackage,
  type AddTestimonialsInput,
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
  saveRule,
  setAutonomy,
  type RemoveRuleInput,
  type SaveRuleInput,
  type SetAutonomyInput,
} from "@/lib/actions/vendor-agent-settings";
import {
  saveConsultHours,
  setAvailability,
  type SaveConsultHoursInput,
  type SetAvailabilityInput,
} from "@/lib/actions/availability";

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

export const saveBusinessAction = async (i: SaveBusinessProfileInput) => run((sb, u) => saveBusinessProfile(sb, u, i));
export const publishAction = async (i: PublishProfileInput) => run((sb, u) => publishProfile(sb, u, i));
export const addReviewsAction = async (i: AddTestimonialsInput) => run((sb, u) => addTestimonials(sb, u, i));
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

export const setAvailabilityAction = async (i: SetAvailabilityInput) => run((sb, u) => setAvailability(sb, u, i));
export const saveConsultHoursAction = async (i: SaveConsultHoursInput) => run((sb, u) => saveConsultHours(sb, u, i));
