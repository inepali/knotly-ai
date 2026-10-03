// src/lib/embeddings.ts
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { supabaseAdmin } from "./supabase/admin";

const model = openai.embeddingModel("text-embedding-3-small"); // 1536 numbers

export async function embedText(value: string) {
  const { embedding } = await embed({ model, value });
  return embedding;
}

// Build one "profile document" per vendor and store its embedding
export async function refreshVendorEmbedding(vendorId: string) {
  const { data: v } = await supabaseAdmin
    .from("vendors")
    .select(
      "business_name, category, bio, metro_slug, price_min, vendor_packages(name, price, inclusions), vendor_addons(name, price), testimonials(body)"
    )
    .eq("id", vendorId)
    .single();
  if (!v) return;

  const doc = [
    `${v.business_name}: ${v.category} in ${v.metro_slug}, from $${v.price_min}`,
    v.bio,
    ...v.vendor_packages.map(
      (p) => `Package ${p.name} $${p.price}: ${p.inclusions.join(", ")}`
    ),
    ...v.vendor_addons.map((a) => `Add-on ${a.name} +$${a.price}`),
    ...v.testimonials.slice(0, 5).map((t) => `Review: ${t.body}`),
  ]
    .filter(Boolean)
    .join("\n");

  await supabaseAdmin
    .from("vendors")
    .update({ embedding: await embedText(doc) })
    .eq("id", vendorId);
}
