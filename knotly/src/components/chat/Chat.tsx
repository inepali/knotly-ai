// src/components/chat/Chat.tsx
// Chat on the left, workspace on the right. Text, sign-up/sign-in and status chips
// stay in the chat; results and drafts the agent produces open in the workspace.
"use client";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AccountCard, { HAS_ACCOUNT_KEY, type Role } from "./cards/AccountCard";
import {
  BUSINESS,
  BUSINESS_TOOLS,
  INBOX,
  WorkspacePanel,
  chipLabel,
  deriveArtifacts,
  isPanelTool,
  summarize,
} from "./workspace";

type Action = { label: string; guestOnly?: boolean } & ({ href: string } | { prompt: string });

// Pills under the composer: links go to a page, prompts start a conversation.
const coupleActions: Action[] = [
  { label: "Register", prompt: "I'd like to create an account.", guestOnly: true },
  { label: "Sign in", prompt: "I already have an account. Please sign me in.", guestOnly: true },
  { label: "I'm a wedding vendor", prompt: "I run a wedding business and want to list it on Knotly.", guestOnly: true },
  { label: "Vendor Listing", href: "/vendors" },
  { label: "Plan my budget", prompt: "Help me plan a budget for my wedding." },
  { label: "Find a photographer", prompt: "Find me a wedding photographer near Charlotte." },
];
const vendorActions: Action[] = [
  { label: "Set up my business profile", prompt: "Help me set up my business profile." },
  { label: "Add my packages", prompt: "I'd like to add my packages and prices." },
  { label: "Add reviews", prompt: "I'd like to add reviews from past clients." },
  { label: "Publish my listing", prompt: "Is my listing ready to publish?" },
];

// unread: messages from the other side not opened yet.
// review: their own side's drafts waiting for approval (e.g. the vendor agent's replies).
// RLS limits both to the user's own conversations.
type MailCounts = { unread: number; review: number };
async function countMail(role: Role): Promise<MailCounts> {
  const sb = supabaseBrowser();
  const mine = role === "vendor" ? ["vendor", "vendor_agent"] : ["couple", "couple_agent"];
  const theirs = role === "vendor" ? ["couple", "couple_agent", "system"] : ["vendor", "vendor_agent", "system"];
  const [unread, review] = await Promise.all([
    sb.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").is("read_at", null).in("sender", theirs),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("status", "pending_approval").in("sender", mine),
  ]);
  return { unread: unread.count ?? 0, review: review.count ?? 0 };
}

// Check for new mail this often while the page is visible.
const MAIL_POLL_MS = 20_000;

const pill =
  "rounded-full border border-gray-300 px-5 py-2.5 text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900";

export default function Chat() {
  // Set when the couple agent hands a guest to vendor onboarding (switchToVendor);
  // once that reply finishes, the chat continues with the vendor agent.
  const handoff = useRef(false);
  const { messages, sendMessage, status } = useChat({
    // talks to /api/chat by default
    onFinish: ({ message, isError, isAbort }) => {
      if (isError || isAbort) return;
      const switched = message.parts.some(
        (p) =>
          p.type === "tool-switchToVendor" &&
          "state" in p &&
          p.state === "output-available" &&
          (p.output as { ok?: boolean }).ok
      );
      if (switched) {
        handoff.current = true;
        setRole("vendor");
      }
    },
  });
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false); // true once a (guest) session exists
  // null = guest; otherwise the email/phone they signed in with
  const [account, setAccount] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("couple");
  const [returning, setReturning] = useState(false); // this browser signed in before
  // Which artifact the user picked. `at` = how many artifacts existed then, so a newer
  // result automatically takes over the panel without an effect.
  const [pick, setPick] = useState<{ id: string; at: number } | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "workspace">("chat");
  const [seen, setSeen] = useState(0); // artifacts already viewed on mobile
  const [mail, setMail] = useState<MailCounts>({ unread: 0, review: 0 });
  const bottomRef = useRef<HTMLDivElement>(null);

  const busy = !ready || status === "submitted" || status === "streaming";
  const empty = messages.length === 0;
  const artifacts = deriveArtifacts(messages);
  // With nothing else open: signed-in users land on Messages, guest vendors on Knowledge.
  const activeId =
    pick && pick.at === artifacts.length
      ? pick.id
      : (artifacts.at(-1)?.id ?? (account ? INBOX : role === "vendor" ? BUSINESS : undefined));
  const inboxOpen = pick?.id === INBOX && pick.at === artifacts.length;
  const unseen = artifacts.length - seen;
  // Each finished listing change (packages, add-ons, profile…) reloads My business.
  const businessVersion = messages
    .flatMap((m) => m.parts)
    .filter(
      (p) =>
        p.type.startsWith("tool-") &&
        BUSINESS_TOOLS.has(p.type.slice("tool-".length)) &&
        "state" in p &&
        p.state === "output-available"
    ).length;

  async function loadAccount() {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    const u = data.user;
    setAccount(u && !u.is_anonymous ? u.email || u.phone || "your account" : null);
    if (u) {
      const { data: profile } = await sb.from("profiles").select("role").eq("id", u.id).maybeSingle();
      const r = (profile?.role as Role) ?? "couple";
      setRole(r);
      if (!u.is_anonymous) setMail(await countMail(r));
    }
  }


  // Every visitor gets a session so chats can be tied to a profile; guests upgrade later.
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(async ({ data }) => {
      try {
        setReturning(localStorage.getItem(HAS_ACCOUNT_KEY) === "1");
      } catch {}
      if (!data.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) console.error("Guest sign-in failed:", error.message);
      }
      await loadAccount();
      setReady(true);
    });
  }, []);

  // New messages arrive from the other side at any time: re-count while the page is
  // visible, and right away when the user comes back to the tab.
  useEffect(() => {
    if (!account) return;
    let off = false;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      countMail(role).then((m) => !off && setMail(m));
    };
    const timer = setInterval(tick, MAIL_POLL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      off = true;
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [account, role]);

  // Unread count in the browser tab title, e.g. "(2) Knotly".
  useEffect(() => {
    document.title = mail.unread ? `(${mail.unread}) Knotly` : "Knotly";
  }, [mail.unread]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  // `returning` lets the agent offer sign-in instead of sign-up to a known browser.
  const post = useCallback(
    (text: string) => sendMessage({ text }, { body: { returning } }),
    [sendMessage, returning]
  );

  // Hand-off: start the vendor agent's turn with a short, visible message.
  useEffect(() => {
    if (status !== "ready" || !handoff.current) return;
    handoff.current = false;
    post("I'd like to set up my vendor listing.");
  }, [status, post]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    post(text);
    setInput("");
  };

  function open(id: string) {
    setPick({ id, at: artifacts.length });
    setMobileView("workspace");
    setSeen(artifacts.length);
  }

  // Stable, so the Inbox pane's mark-as-read effect doesn't re-run on every render.
  const refreshMail = useCallback(async () => setMail(await countMail(role)), [role]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.reload(); // start over as a fresh guest
  }

  // Always visible (desktop and mobile) for signed-in users.
  const messagesButton = account && (
    <button
      type="button"
      onClick={() => open(INBOX)}
      aria-label={`Messages: ${mail.unread} unread${mail.review ? `, ${mail.review} to review` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      <span className="hidden sm:inline">Messages</span>
      {mail.unread > 0 && (
        <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold text-white">{mail.unread}</span>
      )}
      {mail.review > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {mail.review} to review
        </span>
      )}
    </button>
  );

  const accountBar = account && (
    <p className="text-xs text-gray-500">
      Signed in as {account}
      {role !== "couple" && ` (${role})`} ·{" "}
      <button type="button" onClick={signOut} className="underline">
        Sign out
      </button>
    </p>
  );

  const composer = (
    <form
      className="relative rounded-3xl border border-gray-300 bg-white shadow-sm focus-within:border-gray-400 dark:border-gray-700 dark:bg-gray-950"
      onSubmit={(e) => {
        e.preventDefault();
        send(input);
      }}
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter adds a new line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send(input);
          }
        }}
        rows={empty ? 3 : 1}
        placeholder={
          empty
            ? role === "vendor"
              ? "Tell me about your business: name, what you do, and where."
              : "Tell me about your wedding: date, city, guests, and what you need."
            : "Message Knotly..."
        }
        className="block w-full resize-none bg-transparent px-5 py-4 pr-16 text-base outline-none placeholder:text-gray-400"
      />
      <button
        type="submit"
        disabled={busy || !input.trim()}
        aria-label="Send"
        className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white transition disabled:bg-gray-200 disabled:text-gray-500 dark:bg-white dark:text-black dark:disabled:bg-gray-800"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </form>
  );

  // Before the first message: the centered welcome screen (unless they opened the Inbox).
  if (empty && !inboxOpen) {
    const actions = role === "vendor" ? vendorActions : coupleActions;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <div className="mb-4 flex items-center justify-end gap-3">
            {messagesButton}
            {accountBar}
          </div>
          <h1 className="mb-8 text-center text-2xl font-semibold">
            {role === "vendor"
              ? "Welcome! Let's get your business in front of couples."
              : "Congratulations on your engagement! What can I help with?"}
          </h1>
          {composer}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {actions
              .filter((a) => !(a.guestOnly && account))
              .map((a) =>
                "href" in a ? (
                  <Link key={a.label} href={a.href} className={pill}>
                    {a.label}
                  </Link>
                ) : (
                  <button key={a.label} type="button" onClick={() => send(a.prompt)} className={pill}>
                    {a.label}
                  </button>
                )
              )}
          </div>
        </div>
      </main>
    );
  }

  const chatPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-6">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            {m.parts.map((part, i) => {
              if (part.type === "text")
                return (
                  <p
                    key={i}
                    className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-left ${
                      m.role === "user" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-gray-100 dark:bg-gray-900"
                    }`}
                  >
                    {part.text}
                  </p>
                );

              if (part.type !== "dynamic-tool" && !part.type.startsWith("tool-")) return null;
              if (!("state" in part)) return null;
              const tool = part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length);

              // Failed calls (including ones whose input failed the schema, which arrive as
              // "dynamic-tool" parts and would otherwise render nothing).
              if (part.state === "output-error")
                return (
                  <p key={i} className="text-sm text-red-600">
                    ✕ {tool} failed{"errorText" in part && part.errorText ? `: ${part.errorText}` : ""}
                  </p>
                );

              const done = part.state === "output-available";

              // Sign-up / sign-in stays in the conversation.
              if ((tool === "requestSignUp" || tool === "requestSignIn") && done) {
                const out = part.output as { show?: "signup" | "signin"; reason?: string; role?: "couple" | "vendor" };
                if (!out.show) return null; // already signed in
                return (
                  <AccountCard
                    key={i}
                    initialMode={out.show}
                    initialRole={out.role}
                    reason={out.reason ?? ""}
                    onDone={async (msg, newRole) => {
                      setRole(newRole);
                      await loadAccount();
                      setReturning(true);
                      post(msg);
                    }}
                  />
                );
              }

              // Results that live in the workspace: a chip that opens them.
              if (done && isPanelTool(tool) && "toolCallId" in part)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => open(part.toolCallId)}
                    className={`my-1 mr-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                      part.toolCallId === activeId
                        ? "border-black dark:border-white"
                        : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    ✓ {summarize(tool, part.output)} <span aria-hidden>→</span>
                  </button>
                );

              // Listing changes: a chip that opens My business.
              if (done && role === "vendor" && BUSINESS_TOOLS.has(tool))
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => open(BUSINESS)}
                    className="my-1 mr-2 inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300"
                  >
                    ✓ {chipLabel(tool, done)} <span aria-hidden>→</span>
                  </button>
                );

              return (
                <span
                  key={i}
                  className="mr-2 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  {chipLabel(tool, done)}
                </span>
              );
            })}
          </div>
        ))}
        {status === "submitted" && <p className="text-gray-400">Thinking…</p>}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 pb-4">{composer}</div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <Link href="/chat" className="font-semibold">
          Knotly
        </Link>
        {/* Mobile: switch between the two panes. */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm lg:hidden dark:bg-gray-900">
          {(["chat", "workspace"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setMobileView(v);
                if (v === "workspace") setSeen(artifacts.length);
              }}
              className={`rounded-md px-3 py-1 ${mobileView === v ? "bg-white shadow-sm dark:bg-gray-800" : "text-gray-500"}`}
            >
              {v === "chat" ? "Chat" : "Workspace"}
              {v === "workspace" && unseen + mail.unread > 0 && mobileView === "chat" && (
                <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unseen + mail.unread}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {messagesButton}
          <div className="hidden lg:block">{accountBar}</div>
        </div>
      </header>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={`h-full min-h-0 ${mobileView === "chat" ? "" : "hidden"} lg:block`}>{chatPane}</div>
        <aside
          className={`h-full min-h-0 border-gray-200 lg:block lg:border-l dark:border-gray-800 ${
            mobileView === "workspace" ? "" : "hidden"
          }`}
        >
          <WorkspacePanel
            artifacts={artifacts}
            activeId={activeId}
            onSelect={open}
            onAsk={post}
            showInbox={!!account}
            showKnowledge={role === "vendor"}
            showBusiness={role === "vendor"}
            businessVersion={businessVersion}
            unread={mail.unread}
            mailVersion={mail.unread + mail.review}
            onInboxChange={refreshMail}
          />
        </aside>
      </div>
    </div>
  );
}
