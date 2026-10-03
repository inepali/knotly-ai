// src/lib/knowledge.ts — a vendor's knowledge base: read each source, split it into
// pieces, embed them, and find the pieces that answer a couple's question.
import "server-only";
import { embedMany, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { supabaseAdmin as db } from "@/lib/supabase/admin";
import { chatModel } from "@/agent/models";
import { embedText } from "@/lib/embeddings";
import { PDF_UPLOADS_ENABLED } from "@/lib/flags";
import { discoverPages, meta, readPage } from "@/lib/crawl";

export const KNOWLEDGE_BUCKET = "vendor-knowledge";
export type KnowledgeKind = "website" | "instagram" | "facebook" | "youtube" | "link" | "faq" | "pdf";

const MAX_CHARS = 60_000; // per source; keeps cost and prompt size sane
const embeddingModel = openai.embeddingModel("text-embedding-3-small");

// ---------------------------------------------------------------------------------
// Links

export function kindOfUrl(url: URL): KnowledgeKind {
  const h = url.hostname.replace(/^www\./, "");
  if (h === "instagram.com") return "instagram";
  if (h === "facebook.com" || h === "fb.com" || h === "m.facebook.com") return "facebook";
  if (h === "youtube.com" || h === "youtu.be" || h === "m.youtube.com") return "youtube";
  return "website";
}

// Only public http(s) sites; no localhost, private networks or cloud metadata addresses.
// (Hostname check only — a DNS name pointing at a private address isn't caught.)
export function parsePublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith("[") || // IPv6 literals
    !h.includes(".")
  )
    return null;
  return url;
}

// Social sites hide their content behind a login: keep the public summary only.
async function readSocial(url: URL) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "KnotlyBot/1.0 (+vendor knowledge base)", Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`The page returned ${res.status}.`);
  const html = (await res.text()).slice(0, 2_000_000);
  const title = meta(html, "og:title");
  const description = meta(html, "og:description") || meta(html, "description");
  const text = [title && `Title: ${title}`, description && `Summary: ${description}`].filter(Boolean).join("\n\n");
  if (!text) throw new Error("Couldn't read anything public from this link.");
  return { title: title || url.hostname, text };
}

// ---------------------------------------------------------------------------------
// Websites: crawl the whole site (sitemap + links), one row per page.

const CRAWL_BUDGET_MS = 45_000; // stay inside the route's 60-second limit; the rest resumes on Re-read
const CRAWL_CONCURRENCY = 4;
const PAGE_CHARS = 20_000;

type Src = { id: string; vendor_id: string; url: string | null };

async function learnPage(src: Src, page: { id: string; url: string }) {
  try {
    const p = await readPage(page.url);
    const text = p.text.slice(0, PAGE_CHARS);
    const label = p.title || new URL(page.url).pathname;
    // Each piece names its page, so a search hit makes sense on its own and can be cited.
    const pieces = chunk(text).map((c) => `[${label} — ${page.url}]\n${c}`);
    const { embeddings } = await embedMany({ model: embeddingModel, values: pieces });
    await db.from("vendor_knowledge_chunks").delete().eq("source_id", src.id).eq("page_url", page.url);
    const { error } = await db.from("vendor_knowledge_chunks").insert(
      pieces.map((content, i) => ({
        source_id: src.id,
        vendor_id: src.vendor_id,
        page_url: page.url,
        content,
        embedding: embeddings[i],
      }))
    );
    if (error) throw new Error(error.message);
    await db
      .from("vendor_knowledge_pages")
      .update({ status: "ready", error: null, title: p.title || null, chars: text.length, updated_at: new Date().toISOString() })
      .eq("id", page.id);
  } catch (e) {
    await db
      .from("vendor_knowledge_pages")
      .update({
        status: "error",
        error: e instanceof Error ? e.message : "Couldn't read this page.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id);
  }
}

async function crawlWebsite(src: Src, start: URL) {
  const began = Date.now();

  // An unfinished crawl continues; otherwise discover the site's pages afresh.
  let { data: queue } = await db
    .from("vendor_knowledge_pages")
    .select("id, url")
    .eq("source_id", src.id)
    .eq("status", "pending");
  if (!queue?.length) {
    let linksOnStart: string[] = [];
    try {
      linksOnStart = (await readPage(start.toString())).links;
    } catch {} // JavaScript-only sites have no links in their HTML; the sitemap covers them
    const urls = await discoverPages(new URL("/", start), [start.toString(), ...linksOnStart]);
    await db.from("vendor_knowledge_chunks").delete().eq("source_id", src.id);
    await db.from("vendor_knowledge_pages").delete().eq("source_id", src.id);
    const { data: inserted, error } = await db
      .from("vendor_knowledge_pages")
      .insert(urls.map((url) => ({ source_id: src.id, vendor_id: src.vendor_id, url })))
      .select("id, url");
    if (error) throw new Error(error.message);
    queue = inserted ?? [];
  }

  const todo = [...(queue ?? [])];
  const worker = async () => {
    while (todo.length && Date.now() - began < CRAWL_BUDGET_MS) await learnPage(src, todo.shift()!);
  };
  await Promise.all(Array.from({ length: CRAWL_CONCURRENCY }, worker));

  const { data: pages } = await db
    .from("vendor_knowledge_pages")
    .select("url, title, status, error, chars")
    .eq("source_id", src.id);
  const ready = (pages ?? []).filter((p) => p.status === "ready");
  const left = (pages ?? []).filter((p) => p.status === "pending").length;
  if (!ready.length && !left) {
    const reason = (pages ?? []).find((p) => p.error)?.error ?? "No pages could be read.";
    throw new Error(`Couldn't read any of ${pages?.length ?? 0} pages. ${reason}`);
  }
  const home = ready.find((p) => new URL(p.url).pathname === "/") ?? ready[0];
  return {
    title: home?.title ?? start.hostname,
    chars: ready.reduce((n, p) => n + (p.chars ?? 0), 0),
    note: left ? `${left} page${left === 1 ? "" : "s"} still to read — use Re-read to continue.` : null,
  };
}

// ---------------------------------------------------------------------------------
// PDFs: Claude reads the file and returns its text.

async function readPdf(path: string) {
  const { data, error } = await db.storage.from(KNOWLEDGE_BUCKET).download(path);
  if (error || !data) throw new Error("Couldn't open the uploaded file.");
  const { text } = await generateText({
    model: chatModel,
    maxOutputTokens: 16_000,
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: new Uint8Array(await data.arrayBuffer()), mediaType: "application/pdf" },
          {
            type: "text",
            text: "Extract the text of this document so it can be searched. Keep every fact: prices, packages, policies, dates, contact details, FAQs. Write tables as plain lines. Output only the document's content.",
          },
        ],
      },
    ],
  });
  if (!text.trim()) throw new Error("No text found in this PDF.");
  return text;
}

// ---------------------------------------------------------------------------------

// ~1,000-character pieces on paragraph boundaries, with a little overlap.
export function chunk(text: string, size = 1000, overlap = 150) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) {
      out.push(cur);
      cur = cur.slice(-overlap);
    }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size - overlap) out.push(p.slice(i, i + size));
      cur = "";
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Read one source and (re)build its pieces. Safe to run again ("Re-read").
export async function ingestKnowledge(sourceId: string) {
  const { data: src } = await db.from("vendor_knowledge").select("*").eq("id", sourceId).single();
  if (!src) return;

  try {
    let title: string = src.title ?? "";
    let text: string;
    if (src.kind === "faq") {
      text = `Q: ${src.question}\nA: ${src.answer}`;
      title = src.question;
    } else if (src.kind === "pdf") {
      if (!PDF_UPLOADS_ENABLED) throw new Error("PDF reading is turned off for now.");
      text = await readPdf(src.file_path);
    } else {
      const url = parsePublicUrl(src.url ?? "");
      if (!url) throw new Error("That link isn't a public web address.");
      if (src.kind === "website") {
        // Crawled page by page; pieces are stored per page inside crawlWebsite.
        const site = await crawlWebsite(src, url);
        await db
          .from("vendor_knowledge")
          .update({
            status: "ready",
            error: site.note,
            title: site.title,
            chars: site.chars,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sourceId);
        return;
      }
      const read = await readSocial(url);
      title = read.title;
      text = read.text;
    }
    text = text.slice(0, MAX_CHARS);

    // Each piece carries its source name, so a search hit makes sense on its own.
    const pieces = chunk(text).map((c) => `[${title}]\n${c}`);
    const { embeddings } = await embedMany({ model: embeddingModel, values: pieces });

    await db.from("vendor_knowledge_chunks").delete().eq("source_id", sourceId);
    const { error } = await db.from("vendor_knowledge_chunks").insert(
      pieces.map((content, i) => ({ source_id: sourceId, vendor_id: src.vendor_id, content, embedding: embeddings[i] }))
    );
    if (error) throw new Error(error.message);

    await db
      .from("vendor_knowledge")
      .update({ status: "ready", error: null, title, chars: text.length, updated_at: new Date().toISOString() })
      .eq("id", sourceId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't read this source.";
    console.error("[knowledge] ingest", sourceId, message);
    await db
      .from("vendor_knowledge")
      .update({ status: "error", error: message, updated_at: new Date().toISOString() })
      .eq("id", sourceId);
  }
}

export type KnowledgeHit = { source: string; kind: string; title: string | null; url: string | null; text: string };

// The vendor's knowledge most relevant to a question (empty if they have none).
export async function searchKnowledge(vendorId: string, question: string, limit = 6): Promise<KnowledgeHit[]> {
  if (!question.trim()) return [];
  const { count } = await db
    .from("vendor_knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);
  if (!count) return [];
  const { data, error } = await db.rpc("match_vendor_knowledge", {
    p_vendor: vendorId,
    query_embedding: await embedText(question),
    p_limit: limit,
  });
  if (error) {
    console.error("[knowledge] search", error.message);
    return [];
  }
  return (data ?? [])
    .filter((r: { similarity: number }) => r.similarity > 0.2)
    .map((r: { source_id: string; kind: string; title: string | null; url: string | null; content: string }) => ({
      source: `kb:${r.source_id}`,
      kind: r.kind,
      title: r.title,
      url: r.url,
      text: r.content,
    }));
}
