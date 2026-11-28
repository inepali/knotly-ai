// src/components/vendor/TalkToAgent.tsx — "Talk to {agent name}" on a vendor's public page:
// the button (inline, plus a sticky bar on phones) and the quick-chat popup. The assistant answers
// from the vendor's own information; contact details go through a form card, never the model.
// Visitors who aren't signed in are asked to create an account so the chat is saved.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { fieldClasses } from "@/components/ui/fields";
import { HELP_MAX_INPUT_CHARS } from "@/agent/help";
import {
  CARD_AFTER_MESSAGES,
  QUICK_REPLIES,
  agentLabel,
  consentText,
  greeting,
  needFromChat,
  talkLabel,
} from "@/lib/public-chat";

type Props = {
  vendorId: string;
  businessName: string;
  agentName: string | null;
  /** Shown in "Also get free estimates from other …". */
  categoryPlural: string;
  /** This page's path, to come back to after signup. */
  returnPath: string;
  /** Where "Get a free estimate" goes, for the sticky bar on phones. */
  estimateHref: string;
};

type Loaded = { signedIn: boolean; saved: boolean; threadId: string | null; leadSent: boolean; messages: UIMessage[] };

export default function TalkToAgent(p: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const label = talkLabel(p.agentName, p.businessName);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch(`/api/public-chat/${p.vendorId}`)
      .then(async (r) => (r.ok ? ((await r.json()) as Loaded) : Promise.reject(new Error(await r.text()))))
      .then((d) => !cancelled && setLoaded(d))
      .catch((e: Error) => !cancelled && setLoadError(e.message || "Couldn't open the chat."));
    return () => {
      cancelled = true;
    };
  }, [open, loaded, p.vendorId]);

  const button = (className: string) => (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="talk-to-agent"
      onClick={() => setOpen(true)}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50",
        className
      )}
    >
      <span aria-hidden>💬</span> {label}
    </button>
  );

  return (
    <>
      {button("")}

      {/* Phones: both actions stay in reach at the bottom of the screen. */}
      {!open && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-gray-200 bg-white/95 p-3 backdrop-blur sm:hidden">
          <Link href={p.estimateHref} className="flex-1 rounded-lg bg-cyan-500 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-cyan-600">
            Get a free estimate
          </Link>
          {button("flex-1 px-3")}
        </div>
      )}

      {open && (
        <section
          id="talk-to-agent"
          role="dialog"
          aria-label={label}
          className="fixed inset-x-0 bottom-0 z-40 flex h-[100dvh] flex-col bg-white sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[35rem] sm:max-h-[85dvh] sm:w-[24rem] sm:rounded-2xl sm:shadow-2xl sm:shadow-gray-900/20 sm:ring-1 sm:ring-gray-900/10"
        >
          <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-cyan-100 font-semibold text-cyan-800">
              {(p.agentName ?? p.businessName).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.agentName ?? p.businessName}</p>
              <p className="truncate text-xs text-gray-500">{agentLabel(p.agentName, p.businessName).replace(/^.*? · /, "")}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100" aria-label="Close chat">
              ✕
            </button>
          </header>
          {loaded ? (
            <ChatBody {...p} loaded={loaded} />
          ) : (
            <p className={clsx("p-4 text-sm", loadError ? "text-red-600" : "text-gray-500")} role={loadError ? "alert" : undefined}>
              {loadError || "Opening chat…"}
            </p>
          )}
        </section>
      )}
    </>
  );
}

const textOf = (m: UIMessage) => m.parts.map((x) => (x.type === "text" ? x.text : "")).join("");

function ChatBody(p: Props & { loaded: Loaded }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: `/api/public-chat/${p.vendorId}` }), [p.vendorId]);
  const { messages, sendMessage, status, error } = useChat({ transport, messages: p.loaded.messages });
  const [input, setInput] = useState("");
  const [bannerHidden, setBannerHidden] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [sent, setSent] = useState<{ firstName: string; email: string; threadId: string | null } | null>(
    p.loaded.leadSent ? { firstName: "", email: "", threadId: p.loaded.threadId } : null
  );
  const end = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  const visitorTexts = messages.filter((m) => m.role === "user").map(textOf);
  const modelOffered = messages.some((m) => m.role === "assistant" && m.parts.some((x) => x.type === "tool-offerContactCard"));
  // The vendor is busy (daily cap): skip the chat and take details instead.
  const cardOnly = !!error && /cardOnly/.test(error.message);
  const showCard = !sent && (cardOpen || cardOnly || modelOffered || visitorTexts.length >= CARD_AFTER_MESSAGES);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length, showCard, status]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    if (t === "Get a quote") setCardOpen(true);
    sendMessage({ text: t });
    setInput("");
  }

  const signupHref = `/signup?role=couple&next=${encodeURIComponent(p.returnPath)}`;
  const signinHref = `/signin?next=${encodeURIComponent(p.returnPath)}`;

  return (
    <>
      {!p.loaded.signedIn && !bannerHidden && (
        <div className="flex items-start gap-2 bg-cyan-50 px-4 py-2.5 text-xs text-cyan-950">
          <p className="flex-1">
            <strong>Save this conversation.</strong>{" "}
            <Link href={signupHref} className="font-semibold underline">
              Create a free Knotly account →
            </Link>{" "}
            so you can pick it up later and get replies from {p.businessName} in one place.{" "}
            <Link href={signinHref} className="underline">
              Sign in
            </Link>
          </p>
          <button type="button" onClick={() => setBannerHidden(true)} aria-label="Hide" className="text-cyan-900/60">
            ✕
          </button>
        </div>
      )}
      {p.loaded.signedIn && p.loaded.threadId && (
        <p className="bg-emerald-50 px-4 py-2 text-xs text-emerald-900">
          Saved to your Messages.{" "}
          <Link href={`/inbox/${p.loaded.threadId}`} className="font-semibold underline">
            Continue there →
          </Link>
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
        <Bubble role="assistant" text={greeting(p.agentName, p.businessName)} />
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => (q === "Get a quote" ? setCardOpen(true) : send(q))}
                className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:border-gray-400"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => {
          const t = textOf(m);
          return t ? <Bubble key={m.id} role={m.role === "user" ? "user" : "assistant"} text={t} /> : null;
        })}
        {status === "submitted" && <p className="text-xs text-gray-500">{p.agentName ?? "Assistant"} is typing…</p>}
        {error && !cardOnly && (
          <p role="alert" className="text-xs text-red-600">
            {error.message || "Something went wrong. Please try again."}
          </p>
        )}
        {cardOnly && <Bubble role="assistant" text={`Leave your details and ${p.businessName} will reply.`} />}

        {showCard && (
          <ContactCard
            {...p}
            initialNeed={needFromChat(visitorTexts)}
            onSent={(s) => setSent(s)}
          />
        )}
        {sent && sent.firstName && (
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-950">
            <p>
              Thanks, {sent.firstName}! {p.businessName} will get back to you at {sent.email}.
            </p>
            {sent.threadId ? (
              <Link href={`/inbox/${sent.threadId}`} className="mt-1 inline-block font-semibold underline">
                Open in Messages →
              </Link>
            ) : (
              !p.loaded.signedIn && (
                <Link href={signupHref} className="mt-2 inline-flex rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600">
                  Save this chat: create your account
                </Link>
              )
            )}
          </div>
        )}
        {sent && !sent.firstName && (
          <p className="text-xs text-gray-500">
            You&apos;ve shared your details with {p.businessName}. Ask anything else here.
          </p>
        )}
        {!showCard && !sent && messages.length > 0 && (
          <button type="button" onClick={() => setCardOpen(true)} className="text-xs font-medium text-cyan-700 underline">
            Share your details for a quote
          </button>
        )}
        <div ref={end} />
      </div>

      {!cardOnly && (
        <form
          className="flex gap-2 border-t border-gray-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className={fieldClasses}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, HELP_MAX_INPUT_CHARS))}
            placeholder="Ask a question…"
            aria-label="Your message"
            maxLength={HELP_MAX_INPUT_CHARS}
          />
          <button
            disabled={busy || !input.trim()}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return role === "user" ? (
    <p className="ml-8 rounded-2xl rounded-br-sm bg-cyan-500 px-3 py-2 text-white">{text}</p>
  ) : (
    <p className="mr-6 rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 whitespace-pre-wrap text-gray-900">{text}</p>
  );
}

function ContactCard(
  p: Props & {
    loaded: Loaded;
    initialNeed: string;
    onSent: (s: { firstName: string; email: string; threadId: string | null }) => void;
  }
) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", weddingDate: "", need: p.initialNeed, website: "" });
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const r = await fetch(`/api/public-chat/${p.vendorId}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, phone: form.phone || undefined, wantsMoreEstimates: more }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; threadId?: string | null };
      if (!r.ok || !d.ok) setError(d.error ?? "Couldn't send your details. Please try again.");
      else p.onSent({ firstName: form.name.trim().split(" ")[0], email: form.email.trim(), threadId: d.threadId ?? null });
    } catch {
      setError("Couldn't send your details. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const input = `${fieldClasses} mt-1`;
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-gray-200 p-3" aria-label={`Send your details to ${p.businessName}`}>
      <p className="font-semibold">Get a reply from {p.businessName}</p>
      <label className="block text-xs font-medium text-gray-700">
        Name
        <input className={input} required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={set("name")} />
      </label>
      <label className="block text-xs font-medium text-gray-700">
        Email
        <input className={input} required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={set("email")} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-gray-700">
          Phone <span className="font-normal text-gray-500">(optional)</span>
          <input className={input} type="tel" maxLength={25} autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Wedding date
          <input className={input} type="date" value={form.weddingDate} onChange={set("weddingDate")} />
        </label>
      </div>
      <label className="block text-xs font-medium text-gray-700">
        What do you need?
        <textarea className={input} required minLength={10} maxLength={1000} rows={3} value={form.need} onChange={set("need")} />
      </label>
      {/* Honeypot: hidden from people, tempting to bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={set("website")} aria-hidden />
      <label className="flex items-start gap-2 text-xs text-gray-700">
        <input type="checkbox" className="mt-0.5" checked={more} onChange={(e) => setMore(e.target.checked)} />
        Also get free estimates from other {p.categoryPlural}
      </label>
      <p className="text-[11px] leading-snug text-gray-500">{consentText(p.businessName)}</p>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button disabled={pending} className="w-full rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
        {pending ? "Sending…" : `Send to ${p.businessName}`}
      </button>
      {!p.loaded.signedIn && (
        <p className="text-[11px] text-gray-500">Tip: create a free Knotly account after sending to save this chat.</p>
      )}
    </form>
  );
}
