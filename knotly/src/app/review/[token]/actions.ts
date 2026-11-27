"use server";
// A review written through the one-time link a vendor emailed. No account needed.
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshVendorEmbedding } from "@/lib/embeddings";
import { submitEmailReview } from "@/lib/actions/review-requests";
import type { WriteReviewInput } from "@/lib/review-requests";

export async function submitEmailReviewAction(token: string, i: WriteReviewInput & { website?: string }) {
  if (i.website) return { ok: false as const, error: "Something went wrong." }; // honeypot
  const r = await submitEmailReview(supabaseAdmin, token, { name: i.name, rating: i.rating, body: i.body });
  if (!r.ok) return { ok: false as const, error: r.error };
  after(() => refreshVendorEmbedding(r.data.vendorId));
  return { ok: true as const };
}
