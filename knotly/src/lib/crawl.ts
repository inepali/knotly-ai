// src/lib/crawl.ts — find a vendor website's pages and read them.
//
// Discovery: robots.txt → sitemap(s) → (fallback) links on the site's own pages.
// Reading: plain HTML first. Sites built with JavaScript (React, Wix…) send an empty
// shell, so a near-empty page goes to a rendering service — only if one is configured:
//   KNOWLEDGE_RENDERER=jina       (optional JINA_API_KEY; https://jina.ai/reader)
//   KNOWLEDGE_RENDERER=firecrawl  (FIRECRAWL_API_KEY; https://firecrawl.dev)
// Rendering sends the public page address to that service. Off by default.
import "server-only";

export const MAX_PAGES = 25;
const UA = "KnotlyBot/1.0 (+vendor knowledge base)";
const THIN = 300; // fewer readable characters than this = probably a JavaScript shell
const RENDERER = process.env.KNOWLEDGE_RENDERER as "jina" | "firecrawl" | undefined;

export const renderingEnabled = () =>
  RENDERER === "jina" || (RENDERER === "firecrawl" && !!process.env.FIRECRAWL_API_KEY);

// ---------------------------------------------------------------------------------
// HTML helpers

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

export function meta(html: string, name: string) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i");
  return decode((html.match(a)?.[1] ?? html.match(b)?.[1] ?? "").trim());
}

export function readableText(html: string) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

const pageTitle = (html: string) =>
  meta(html, "og:title") || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");

// Same site = same host, ignoring a leading "www.".
const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
export const sameSite = (a: URL, b: URL) => bare(a.hostname) === bare(b.hostname);

// Normalize for de-duplication: no hash, no trailing slash (except root), no tracking params.
export function normalize(u: URL) {
  const n = new URL(u.toString());
  n.hash = "";
  for (const k of [...n.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) n.searchParams.delete(k);
  if (n.pathname.length > 1) n.pathname = n.pathname.replace(/\/+$/, "");
  return n.toString();
}

const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|pdf|zip|mp4|mov|mp3|woff2?|ttf)$/i;

async function get(url: string, accept = "text/html") {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": UA, Accept: accept },
  });
}

// ---------------------------------------------------------------------------------
// Discovery

type Robots = { sitemaps: string[]; disallow: string[] };

async function readRobots(root: URL): Promise<Robots> {
  const out: Robots = { sitemaps: [], disallow: [] };
  try {
    const res = await get(new URL("/robots.txt", root).toString(), "text/plain");
    if (!res.ok) return out;
    let applies = false;
    for (const raw of (await res.text()).split("\n")) {
      const line = raw.split("#")[0].trim();
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (/^sitemap$/i.test(key)) out.sitemaps.push(value);
      else if (/^user-agent$/i.test(key)) applies = value === "*" || /knotly/i.test(value);
      else if (/^disallow$/i.test(key) && applies && value) out.disallow.push(value);
    }
  } catch {}
  return out;
}

const allowed = (u: URL, robots: Robots) => !robots.disallow.some((p) => u.pathname.startsWith(p));

// Reads a sitemap or sitemap index (nested up to a few files).
async function readSitemaps(start: string[], root: URL): Promise<string[]> {
  const queue = [...start];
  const seen = new Set<string>();
  const pages: string[] = [];
  while (queue.length && seen.size < 5) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    try {
      const u = new URL(next);
      if (!sameSite(u, root)) continue; // e.g. other city subdomains: separate sites
      const res = await get(next, "application/xml,text/xml");
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
      if (/<sitemapindex/i.test(xml)) queue.push(...locs);
      else pages.push(...locs);
    } catch {}
  }
  return pages;
}

// Pages most likely to answer couples' questions come first; blog posts last.
function priority(u: URL) {
  const p = u.pathname.toLowerCase();
  if (p === "/" || p === "") return 0;
  if (/(^|\/)(blog|news|posts?|tags?|category|author)(\/|$)/.test(p)) return 4; // before keywords: "/blog/…-pricing"
  if (/(package|pricing|price|investment|rates|faq|question)/.test(p)) return 1;
  if (/(about|service|offer|booking|book|contact|travel|polic|process|team|what-to-expect)/.test(p)) return 2;
  return 3;
}

// Up to MAX_PAGES same-site URLs, home page first.
export async function discoverPages(root: URL, linksOnRoot: string[] = []): Promise<string[]> {
  const robots = await readRobots(root);
  const sitemaps = robots.sitemaps.length ? robots.sitemaps : [new URL("/sitemap.xml", root).toString()];
  const candidates = [root.toString(), ...(await readSitemaps(sitemaps, root)), ...linksOnRoot];

  const urls = new Map<string, URL>();
  for (const c of candidates) {
    try {
      const u = new URL(c, root);
      if ((u.protocol !== "https:" && u.protocol !== "http:") || !sameSite(u, root)) continue;
      if (SKIP_EXT.test(u.pathname) || !allowed(u, robots)) continue;
      urls.set(normalize(u), u);
    } catch {}
  }
  return [...urls.entries()]
    .sort(([, a], [, b]) => priority(a) - priority(b))
    .slice(0, MAX_PAGES)
    .map(([key]) => key);
}

// ---------------------------------------------------------------------------------
// Reading one page

export type Page = { title: string; text: string; links: string[]; rendered: boolean };

// An app shell: almost no text, an empty mount point, and scripts that build the page.
const looksLikeAppShell = (html: string) =>
  /<div[^>]+id=["'](root|app|__next|__nuxt|svelte)["'][^>]*>\s*<\/div>/i.test(html) ||
  (html.match(/<script\b/gi)?.length ?? 0) >= 3;

async function render(url: string): Promise<{ title: string; text: string } | null> {
  if (RENDERER === "jina") {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "text",
        ...(process.env.JINA_API_KEY ? { Authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`Rendering service returned ${res.status}.`);
    const body = await res.text();
    const title = body.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const text = body.replace(/^(Title|URL Source|Published Time):.*$/gm, "").replace(/^Markdown Content:\s*$/m, "").trim();
    return { title, text };
  }
  if (RENDERER === "firecrawl" && process.env.FIRECRAWL_API_KEY) {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(`Rendering service returned ${res.status}.`);
    return { title: json.data?.metadata?.title ?? "", text: json.data?.markdown ?? "" };
  }
  return null;
}

export async function readPage(url: string): Promise<Page> {
  const res = await get(url);
  if (!res.ok) throw new Error(`The page returned ${res.status}.`);
  if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("Not a web page.");
  const html = (await res.text()).slice(0, 2_000_000);

  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map((m) => decode(m[1]));
  const title = pageTitle(html);
  const description = meta(html, "og:description") || meta(html, "description");
  let text = readableText(html);

  if (text.length < THIN && looksLikeAppShell(html)) {
    const rendered = await render(url);
    if (rendered && rendered.text.length >= THIN)
      return { title: rendered.title || title, text: rendered.text, links, rendered: true };
    if (!rendered)
      throw new Error(
        "This page loads its content with JavaScript, so it can't be read without page rendering (see KNOWLEDGE_RENDERER)."
      );
    text = rendered.text || text;
  }
  const full = [description && `Summary: ${description}`, text].filter(Boolean).join("\n\n");
  if (full.length < 40) throw new Error("No readable text on this page.");
  return { title, text: full, links, rendered: false };
}
