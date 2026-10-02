// src/components/chat/Chat.tsx
"use client";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Pills under the composer: links go to a page, prompts start a conversation.
const actions: ({ label: string } & ({ href: string } | { prompt: string }))[] =
  [
    { label: "Register", href: "/register" },
    { label: "Vendor Listing", href: "/vendors" },
    { label: "Search Vendors", href: "/search" },
    {
      label: "Plan my budget",
      prompt: "Help me plan a budget for my wedding.",
    },
    {
      label: "Find a photographer",
      prompt: "Find me a wedding photographer near Charlotte.",
    },
  ];

const pill =
  "rounded-full border border-gray-300 px-5 py-2.5 text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900";

export default function Chat() {
  const { messages, sendMessage, status } = useChat(); // talks to /api/chat by default
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false); // true once a (guest) session exists
  const busy = !ready || status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  // Every visitor gets a session so chats can be tied to a profile; guests upgrade later.
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) console.error("Guest sign-in failed:", error.message);
      }
      setReady(true);
    });
  }, []);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

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
            ? "Tell me about your wedding: date, city, guests, and what you need."
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
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </form>
  );

  if (empty) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <h1 className="mb-8 text-center text-2xl font-semibold sm:text-2xl">
            Congratulations on your engagement! What can I help with?
          </h1>
          {composer}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {actions.map((a) =>
              "href" in a ? (
                <Link key={a.label} href={a.href} className={pill}>
                  {a.label}
                </Link>
              ) : (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => send(a.prompt)}
                  className={pill}
                >
                  {a.label}
                </button>
              )
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <div className="flex-1 space-y-3 overflow-y-auto py-6">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <p
                    key={i}
                    className={`inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 ${
                      m.role === "user" ? "bg-black text-white" : "bg-gray-100"
                    }`}
                  >
                    {part.text}
                  </p>
                );
              }
              if (part.type.startsWith("tool-")) {
                const name = part.type.slice(5);
                const done =
                  "state" in part && part.state === "output-available";
                return (
                  <span
                    key={i}
                    className="mr-2 inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                  >
                    {done ? `✓ ${name}` : `${name}…`}
                  </span>
                );
              }
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && <p className="text-gray-400">Thinking…</p>}
      </div>
      <div className="pb-4">{composer}</div>
    </div>
  );
}
