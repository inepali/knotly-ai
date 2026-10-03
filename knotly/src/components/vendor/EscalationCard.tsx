// src/components/vendor/EscalationCard.tsx
"use client";
import { useState } from "react";

export default function EscalationCard({
  esc,
  coupleMessage,
}: {
  esc: {
    id: string;
    reason: string;
    decision: any;
    total: number | null;
    status: string;
  };
  coupleMessage: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "guide">("view");
  const [text, setText] = useState(esc.decision.message);
  const [done, setDone] = useState("");

  async function resolve(body: object, label: string) {
    const res = await fetch(`/api/escalations/${esc.id}/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setDone(res.ok ? label : "Something went wrong");
  }
  if (done)
    return (
      <div className="rounded-2xl border p-4 text-sm text-emerald-700">
        ✓ {done}
      </div>
    );

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <p className="text-xs font-medium text-amber-700">
        {esc.status === "reminded" ? "⏰ Waiting over 2h · " : ""}
        {esc.reason}
      </p>
      <blockquote className="border-l-2 pl-3 text-sm text-gray-600">
        {coupleMessage}
      </blockquote>
      <div className="rounded-xl bg-gray-50 p-3 text-sm">
        <p className="mb-1 text-xs text-gray-500">
          Your agent suggests ({esc.decision.responseType}
          {esc.total != null && `, estimate $${esc.total.toLocaleString()}`}):
        </p>
        {mode === "view" ? (
          <p className="whitespace-pre-wrap">{esc.decision.message}</p>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={
              mode === "guide"
                ? "e.g. Offer 6 hours at $3,600 without the album"
                : ""
            }
            className="w-full rounded border p-2"
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {mode === "view" && (
          <>
            <button
              className="rounded-full bg-black px-3 py-1 text-white"
              onClick={() => resolve({ action: "approve" }, "Sent")}
            >
              Approve & send
            </button>
            <button
              className="rounded-full border px-3 py-1"
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
            <button
              className="rounded-full border px-3 py-1"
              onClick={() => {
                setText("");
                setMode("guide");
              }}
            >
              Guide the agent
            </button>
            <button
              className="rounded-full border px-3 py-1"
              onClick={() =>
                resolve({ action: "take_over" }, "You're handling this thread")
              }
            >
              Take over
            </button>
            <button
              className="rounded-full px-3 py-1 text-red-600"
              onClick={() => resolve({ action: "reject" }, "Dismissed")}
            >
              Reject
            </button>
          </>
        )}
        {mode === "edit" && (
          <button
            className="rounded-full bg-black px-3 py-1 text-white"
            onClick={() =>
              resolve({ action: "edit", message: text }, "Sent your version")
            }
          >
            Send edited
          </button>
        )}
        {mode === "guide" && (
          <button
            className="rounded-full bg-black px-3 py-1 text-white"
            onClick={() =>
              resolve(
                { action: "guide", guidance: text },
                "Agent is rewriting with your guidance"
              )
            }
          >
            Send guidance
          </button>
        )}
        {mode !== "view" && (
          <button className="px-3 py-1" onClick={() => setMode("view")}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
