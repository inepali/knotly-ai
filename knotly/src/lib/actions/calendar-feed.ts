// src/lib/actions/calendar-feed.ts — the secret token behind a vendor's calendar feed link.
import { fail, ok, type Sb } from "./result";

/** The vendor's feed token, created on first use. Null if it can't be read or created. */
export async function ensureFeedToken(sb: Sb, userId: string): Promise<string | null> {
  const { data } = await sb.from("vendor_calendar_feeds").select("token").eq("vendor_id", userId).maybeSingle();
  if (data?.token) return data.token;
  const { data: created } = await sb.from("vendor_calendar_feeds").insert({ vendor_id: userId }).select("token").single();
  return created?.token ?? null;
}

/** Replace the token so the old link stops working. */
export async function resetFeedToken(sb: Sb, userId: string) {
  const { error: removeError } = await sb.from("vendor_calendar_feeds").delete().eq("vendor_id", userId);
  if (removeError) return fail(removeError.message);
  const { data, error } = await sb.from("vendor_calendar_feeds").insert({ vendor_id: userId }).select("token").single();
  if (error || !data) return fail(error?.message ?? "Couldn't create a new link.");
  return ok({ token: data.token as string });
}
