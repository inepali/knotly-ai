// src/app/api/knowledge/route.ts — the vendor's knowledge base: list and add sources.
// Reading a source (fetching a page, extracting a PDF) happens after the response.
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail } from "@/lib/auth";
import { KNOWLEDGE_BUCKET, ingestKnowledge, kindOfUrl, parsePublicUrl } from "@/lib/knowledge";
import { PDF_UPLOADS_ENABLED } from "@/lib/flags";

export const maxDuration = 60;

const Add = z.discriminatedUnion("type", [
  z.object({ type: z.literal("link"), url: z.string().trim().min(3).max(2000) }),
  z.object({
    type: z.literal("faq"),
    question: z.string().trim().min(3, "Write the question.").max(500),
    answer: z.string().trim().min(1, "Write the answer.").max(4000),
  }),
  z.object({
    type: z.literal("pdf"),
    filename: z.string().trim().min(1).max(200),
    size: z.number().int().positive().max(10 * 1024 * 1024, "PDFs can be up to 10 MB."),
  }),
]);

// The signed-in vendor, or a Response explaining why not.
async function vendorOf() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { error: fail("Please sign in.", 401) };
  const { data: vendor } = await sb.from("vendors").select("id").eq("id", user.id).maybeSingle();
  return { sb, userId: user.id, hasListing: !!vendor };
}

export async function GET() {
  const v = await vendorOf();
  if ("error" in v) return v.error;
  const { data } = await v.sb
    .from("vendor_knowledge")
    .select(
      "id, kind, title, url, question, answer, status, error, chars, created_at, vendor_knowledge_pages(url, title, status, error, chars)"
    )
    .order("created_at", { ascending: false });
  return Response.json({ ok: true, hasListing: v.hasListing, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const v = await vendorOf();
  if ("error" in v) return v.error;
  if (!v.hasListing) return fail("Create your business profile first (name and category).");

  const parsed = Add.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const add = parsed.data;

  let row: Record<string, unknown>;
  if (add.type === "link") {
    const url = parsePublicUrl(add.url);
    if (!url) return fail("Enter a public web address, like https://yourstudio.com.");
    row = { kind: kindOfUrl(url), url: url.toString(), title: url.hostname };
  } else if (add.type === "faq") {
    row = { kind: "faq", question: add.question, answer: add.answer, title: add.question };
  } else {
    if (!PDF_UPLOADS_ENABLED) return fail("PDF uploads aren't available yet.");
    if (!/\.pdf$/i.test(add.filename)) return fail("Only PDF files can be uploaded.");
    row = { kind: "pdf", title: add.filename };
  }

  // RLS: vendors can only add 'pending' sources to their own listing.
  const { data: src, error } = await v.sb
    .from("vendor_knowledge")
    .insert({ ...row, vendor_id: v.userId, status: "pending" })
    .select("id")
    .single();
  if (error) return fail(error.message, 500);

  if (add.type === "pdf") {
    // The browser uploads straight to storage with a one-time URL, then calls
    // POST /api/knowledge/[id] to start reading it.
    const path = `${v.userId}/${src.id}.pdf`;
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(KNOWLEDGE_BUCKET)
      .createSignedUploadUrl(path);
    if (signError || !signed) return fail("Couldn't prepare the upload. Please try again.", 500);
    await supabaseAdmin.from("vendor_knowledge").update({ file_path: path }).eq("id", src.id);
    return Response.json({ ok: true, id: src.id, upload: { bucket: KNOWLEDGE_BUCKET, path, token: signed.token } });
  }

  after(() => ingestKnowledge(src.id));
  return Response.json({ ok: true, id: src.id });
}
