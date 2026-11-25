// src/components/help/HelpChat.tsx — the Help conversation: a few messages, answers with links to
// Knotly pages. Talks to /api/help, which can only read. Used in the floating widget (platform help)
// and inline on a vendor's profile ("Ask this vendor").
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { fieldClasses } from "@/components/ui/fields";
import { HELP_MAX_INPUT_CHARS } from "@/agent/help";
import { linkify } from "@/lib/linkify";

export default function HelpChat({
  vendorId,
  placeholder = "Ask a question…",
  suggestions = [],
}: {
  vendorId?: string;
  placeholder?: string;
  suggestions?: string[];
}) {
  // One transport per vendor, so the conversation isn't reset by re-renders.
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/help", body: { vendorId } }), [vendorId]);
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-left text-xs text-gray-700 hover:border-gray-400"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          if (!text) return null;
          return m.role === "user" ? (
            <p key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-cyan-500 px-3 py-2 text-white">
              {text}
            </p>
          ) : (
            <p key={m.id} className="mr-4 rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 whitespace-pre-wrap text-gray-900">
              {linkify(text).map((s, i) =>
                s.type === "link" ? (
                  <Link key={i} href={s.href} className="font-medium text-cyan-700 underline">
                    {s.text}
                  </Link>
                ) : (
                  <span key={i}>{s.text}</span>
                )
              )}
            </p>
          );
        })}
        {status === "submitted" && <p className="text-xs text-gray-500">Thinking…</p>}
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error.message || "Something went wrong. Please try again."}
          </p>
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className={fieldClasses}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, HELP_MAX_INPUT_CHARS))}
          placeholder={placeholder}
          aria-label="Your question"
          maxLength={HELP_MAX_INPUT_CHARS}
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
