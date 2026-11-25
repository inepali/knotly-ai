// src/lib/actions/knowledge.ts — a vendor's knowledge base (shared by the dashboard forms).
import { z } from "zod";
import { after } from "next/server";
import { ingestKnowledge, kindOfUrl, parsePublicUrl, searchKnowledge } from "@/lib/knowledge";
import { getVendor } from "./vendor-profile";
import { fail, ok, parseInput, type Sb } from "./result";

export const AddKnowledgeInput = z.object({
  url: z.string().optional().describe("A link to learn from"),
  question: z.string().optional().describe("FAQ question, in the couple's words"),
  answer: z.string().optional().describe("FAQ answer, exactly as the vendor gives it"),
});
export type AddKnowledgeInput = z.input<typeof AddKnowledgeInput>;

export const AskVendorKnowledgeInput = z.object({
  vendorId: z.string().describe("The vendor's id from searchVendors"),
  question: z.string().describe("The couple's question, in their words"),
});
export type AskVendorKnowledgeInput = z.input<typeof AskVendorKnowledgeInput>;

export async function addKnowledge(sb: Sb, userId: string, input: unknown) {
  const p = parseInput(AddKnowledgeInput, input);
  if (!p.ok) return p;
  const { url, question, answer } = p.data;

  if (!(await getVendor(sb, userId))) return fail("Create the business profile first.");
  let row;
  if (url) {
    const u = parsePublicUrl(url);
    if (!u) return fail("That isn't a public web address.");
    row = { kind: kindOfUrl(u), url: u.toString(), title: u.hostname };
  } else if (question && answer) {
    row = { kind: "faq", question, answer, title: question };
  } else return fail("Give a link, or both a question and an answer.");

  const { data, error } = await sb
    .from("vendor_knowledge")
    .insert({ ...row, vendor_id: userId, status: "pending" })
    .select("id, kind")
    .single();
  if (error) return fail(error.message);
  after(() => ingestKnowledge(data.id)); // reading a page takes a few seconds
  return ok({ added: data.kind, note: "Being learned now; it shows as Ready in the Knowledge tab." });
}

export async function askVendorKnowledge(sb: Sb, _userId: string, input: unknown) {
  const p = parseInput(AskVendorKnowledgeInput, input);
  if (!p.ok) return p;
  const { vendorId, question } = p.data;

  if (!z.uuid().safeParse(vendorId).success) return fail("Use the vendor's id from searchVendors.");
  // Only listings couples can see (RLS hides unpublished vendors from them).
  const { data: v } = await sb.from("vendors").select("business_name").eq("id", vendorId).maybeSingle();
  if (!v) return fail("Vendor not found.");
  const hits = await searchKnowledge(vendorId, question, 5);
  return ok(
    hits.length
      ? {
          vendor: v.business_name,
          excerpts: hits.map((h) => ({ from: h.title ?? h.kind, url: h.url, text: h.text })),
          note: "Answer only from these excerpts and say they come from the vendor. If they don't answer it, suggest asking the vendor.",
        }
      : {
          vendor: v.business_name,
          excerpts: [],
          note: "The vendor hasn't shared information on this. Suggest asking them directly.",
        }
  );
}
