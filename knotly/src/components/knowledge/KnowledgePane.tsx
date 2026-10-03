// src/components/knowledge/KnowledgePane.tsx — the vendor's Knowledge tab: links, FAQs
// and PDFs their assistant learns from to answer couples accurately.
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { fieldClasses } from "@/components/ui/fields";
import { PDF_UPLOADS_ENABLED } from "@/lib/flags";

type Source = {
  id: string;
  kind:
    "website" | "instagram" | "facebook" | "youtube" | "link" | "faq" | "pdf";
  title: string | null;
  url: string | null;
  question: string | null;
  answer: string | null;
  status: "pending" | "ready" | "error";
  error: string | null; // on a ready website: a note such as "3 pages still to read"
  chars: number | null;
  vendor_knowledge_pages?: SitePage[]; // websites: every page the crawl found
};
type SitePage = {
  url: string;
  title: string | null;
  status: "pending" | "ready" | "error" | "skipped";
  error: string | null;
  chars: number | null;
};

const KIND_LABEL: Record<Source["kind"], string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  link: "Link",
  faq: "FAQ",
  pdf: "PDF",
};

const field = fieldClasses;
const button =
  "rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-4 py-1.5 text-sm text-white disabled:opacity-40";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return res
    .json()
    .catch(() => ({ ok: false, error: "Something went wrong." }));
}
const postJson = (url: string, body: object) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export default function KnowledgePane() {
  const [items, setItems] = useState<Source[] | null>(null);
  const [hasListing, setHasListing] = useState(true);
  const [version, setVersion] = useState(0);
  const [link, setLink] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"link" | "faq" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let off = false;
    api("/api/knowledge").then((j) => {
      if (off) return;
      if (j.ok) {
        setItems(j.items);
        setHasListing(j.hasListing);
      } else setError(j.error ?? "Couldn't load your knowledge base.");
    });
    return () => {
      off = true;
    };
  }, [version]);

  // While anything is still being read, check again every few seconds.
  const pending = items?.some((i) => i.status === "pending");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setVersion((v) => v + 1), 3000);
    return () => clearInterval(t);
  }, [pending]);

  async function run(
    kind: "link" | "faq" | "pdf",
    work: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusy(kind);
    setError("");
    const r = await work();
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "Something went wrong.");
    refresh();
  }

  const addLink = () =>
    run("link", async () => {
      const r = await postJson("/api/knowledge", { type: "link", url: link });
      if (r.ok) setLink("");
      return r;
    });

  const addFaq = () =>
    run("faq", async () => {
      const r = await postJson("/api/knowledge", {
        type: "faq",
        question,
        answer,
      });
      if (r.ok) {
        setQuestion("");
        setAnswer("");
      }
      return r;
    });

  const addPdf = (file: File) =>
    run("pdf", async () => {
      if (file.type !== "application/pdf")
        return { ok: false, error: "Only PDF files can be uploaded." };
      const r = await postJson("/api/knowledge", {
        type: "pdf",
        filename: file.name,
        size: file.size,
      });
      if (!r.ok) return r;
      // Straight to storage with the one-time URL, then ask the server to read it.
      const { error: upError } = await supabaseBrowser()
        .storage.from(r.upload.bucket)
        .uploadToSignedUrl(r.upload.path, r.upload.token, file, {
          contentType: "application/pdf",
        });
      if (upError) {
        await api(`/api/knowledge/${r.id}`, { method: "DELETE" });
        return { ok: false, error: "Upload failed. Please try again." };
      }
      return postJson(`/api/knowledge/${r.id}`, {});
    });

  if (!items)
    return (
      <p className="text-sm text-gray-500">
        {error || "Loading your knowledge base…"}
      </p>
    );
  if (!hasListing)
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        Create your business profile first (name and what you do), then add your
        links and FAQs here.
      </p>
    );

  return (
    <div className="space-y-6 text-sm">
      <p className="text-gray-600">
        Your assistant answers couples from what you add here, so the more it
        knows, the more accurate it gets. Prices always come from your packages.
      </p>

      <section className="space-y-2">
        <h3 className="font-medium">Add a link</h3>
        <p className="text-xs text-gray-500">
          Website pages are read in full. Instagram, Facebook and YouTube only
          share their public summary, so your assistant mainly uses them to
          share the link.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) addLink();
          }}
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://yourstudio.com or instagram.com/yourstudio"
            className={field}
          />
          <button disabled={busy === "link" || !link.trim()} className={button}>
            {busy === "link" ? "Adding…" : "Add"}
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Add an FAQ</h3>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim() && answer.trim()) addFaq();
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Question couples ask, e.g. Do you travel outside Charlotte?"
            className={field}
          />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            placeholder="Your answer"
            className={field}
          />
          <button
            disabled={busy === "faq" || !question.trim() || !answer.trim()}
            className={button}
          >
            {busy === "faq" ? "Adding…" : "Add FAQ"}
          </button>
        </form>
      </section>

      {PDF_UPLOADS_ENABLED && (
        <section className="space-y-2">
          <h3 className="font-medium">Upload a PDF</h3>
          <p className="text-xs text-gray-500">
            Brochures, price guides, contracts, policies. Up to 10 MB each.
          </p>
          <label className={`${button} inline-block cursor-pointer`}>
            {busy === "pdf" ? "Uploading…" : "Choose PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              disabled={busy === "pdf"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) addPdf(f);
              }}
            />
          </label>
        </section>
      )}

      {error && <p className="text-red-600">{error}</p>}

      <section className="space-y-2">
        <h3 className="font-medium">
          What your assistant knows ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-2xl bg-white shadow-sm ring-1 ring-gray-900/5">
            {items.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                      {KIND_LABEL[s.kind]}
                    </span>
                    {s.kind === "faq" ? s.question : s.title}
                  </p>
                  {s.kind === "faq" && s.answer && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                      {s.answer}
                    </p>
                  )}
                  {s.url && (
                    <p className="truncate text-xs text-gray-500">{s.url}</p>
                  )}
                  <p className="mt-0.5 text-xs">
                    {s.status === "pending" && (
                      <span className="text-gray-500">
                        {s.kind === "website" && s.vendor_knowledge_pages?.length
                          ? `Reading pages… ${s.vendor_knowledge_pages.filter((p) => p.status !== "pending").length} of ${s.vendor_knowledge_pages.length}`
                          : "Learning…"}
                      </span>
                    )}
                    {s.status === "ready" && (
                      <span className="text-emerald-700">
                        Ready
                        {s.kind === "website" && s.vendor_knowledge_pages?.length
                          ? ` · ${s.vendor_knowledge_pages.filter((p) => p.status === "ready").length} of ${s.vendor_knowledge_pages.length} pages read`
                          : ""}
                        {s.chars
                          ? ` · ${s.chars.toLocaleString()} characters`
                          : ""}
                      </span>
                    )}
                    {s.status === "ready" && s.error && (
                      <span className="block text-amber-700">{s.error}</span>
                    )}
                    {s.status === "error" && (
                      <span className="text-red-600">
                        Couldn&apos;t read: {s.error}
                      </span>
                    )}
                  </p>
                  {s.kind === "website" && s.vendor_knowledge_pages?.length ? (
                    <SitePages pages={s.vendor_knowledge_pages} />
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-3 text-xs">
                  {s.kind !== "faq" && s.status !== "pending" && (
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() =>
                        postJson(`/api/knowledge/${s.id}`, {}).then(refresh)
                      }
                    >
                      Re-read
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-600 underline-offset-2 hover:underline"
                    onClick={() =>
                      api(`/api/knowledge/${s.id}`, { method: "DELETE" }).then(
                        refresh,
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Every page the crawl found, with what happened to it.
function SitePages({ pages }: { pages: SitePage[] }) {
  const order = { error: 0, pending: 1, skipped: 2, ready: 3 } as const;
  const sorted = [...pages].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-gray-500">Pages ({pages.length})</summary>
      <ul className="mt-1 space-y-1">
        {sorted.map((p) => (
          <li key={p.url} className="min-w-0">
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                p.status === "ready" ? "bg-emerald-500" : p.status === "error" ? "bg-red-500" : "bg-gray-300"
              }`}
              aria-label={p.status}
            />
            <a href={p.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {new URL(p.url).pathname}
            </a>
            {p.status === "ready" && p.chars ? <span className="text-gray-500"> · {p.chars.toLocaleString()} chars</span> : null}
            {p.status === "pending" && <span className="text-gray-500"> · waiting</span>}
            {p.status === "error" && <span className="block pl-3.5 text-red-600">{p.error}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
