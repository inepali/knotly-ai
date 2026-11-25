// src/components/help/HelpWidget.tsx — the collapsible Help button in both dashboards.
"use client";
import { useState } from "react";
import HelpChat from "./HelpChat";

const SUGGESTIONS = {
  couple: ["How do I get estimates from vendors?", "What does Post to vendors do?", "How does the budget page work?"],
  vendor: ["How do I publish my listing?", "What are the autonomy levels?", "How do I block dates?"],
};

export default function HelpWidget({ role }: { role: "couple" | "vendor" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3">
      {open && (
        <section
          aria-label="Help"
          className="flex h-[28rem] max-h-[70dvh] w-[calc(100vw-2rem)] max-w-sm flex-col rounded-2xl bg-white p-4 shadow-2xl shadow-gray-900/20 ring-1 ring-gray-900/10"
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Help</h2>
            <button type="button" className="text-xs text-gray-500 underline" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <p className="mb-3 text-xs text-gray-500">Ask how Knotly works. Help can&apos;t make changes for you; it points you to the right page.</p>
          <HelpChat suggestions={SUGGESTIONS[role]} placeholder="How do I…?" />
        </section>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-gray-900/20 hover:bg-cyan-600"
      >
        {open ? "Hide help" : "Help"}
      </button>
    </div>
  );
}
