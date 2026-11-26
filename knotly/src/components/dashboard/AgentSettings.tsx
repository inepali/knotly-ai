// src/components/dashboard/AgentSettings.tsx — autonomy level, rules, and the agent's stats.
"use client";
import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { describeRule } from "@/lib/actions/vendor-agent-settings";
import { CUSTOM_INSTRUCTIONS_MAX } from "@/agent/vendor/instructions";
import {
  removeRuleAction,
  saveCustomInstructionsAction,
  saveRuleAction,
  setAutonomyAction,
} from "@/app/vendor/dashboard/actions";
import { useAction, wholeNumber } from "./useAction";

export type RuleRow = { id: string; kind: string; params: Record<string, unknown>; source_text: string | null };
type Stats = {
  sentAlone: number;
  escalated: number;
  approvedAsIs: number;
  changedByHuman: number;
  approvalRate: number | null;
  suggestion: string | null;
};

const LEVELS = [
  { level: 0, name: "Shadow", text: "Drafts only. Everything waits for your approval." },
  { level: 1, name: "Assist", text: "Answers questions alone; estimates need your approval." },
  { level: 2, name: "Autopilot", text: "Handles everything within your rules." },
  { level: 3, name: "Full", text: "Also offers discounts, within your limit." },
];

export default function AgentSettings({
  level,
  rules,
  stats,
  notes,
  notesUpdatedAt,
}: {
  level: number;
  rules: RuleRow[];
  stats: Stats | null;
  notes: string | null;
  notesUpdatedAt: string | null;
}) {
  const lvl = useAction();
  const rm = useAction();
  return (
    <div className="mt-6 space-y-6">
      {stats && (
        <section className={`${panelClasses} p-6`}>
          <h2 className="text-base font-semibold">Last 30 days</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Sent on its own" value={stats.sentAlone} />
            <Stat label="Needed you" value={stats.escalated} />
            <Stat label="You approved as is" value={stats.approvedAsIs} />
            <Stat label="You changed" value={stats.changedByHuman} />
          </div>
          {stats.approvalRate != null && (
            <p className="mt-3 text-sm text-gray-600">You approved {Math.round(stats.approvalRate * 100)}% of drafts unchanged.</p>
          )}
          {stats.suggestion && <p className="mt-2 rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{stats.suggestion}</p>}
        </section>
      )}

      <section className={`${panelClasses} p-6`}>
        <h2 className="text-base font-semibold">How independently should it work?</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Autonomy level">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              role="radio"
              aria-checked={level === l.level}
              disabled={lvl.pending}
              onClick={() => level !== l.level && lvl.run(() => setAutonomyAction({ level: l.level }))}
              className={clsx(
                "rounded-xl border p-3 text-left text-sm disabled:opacity-60",
                level === l.level ? "border-cyan-500 bg-cyan-50" : "border-gray-200 hover:border-gray-300"
              )}
            >
              <span className="font-semibold">
                {l.level} · {l.name}
              </span>
              <span className="mt-0.5 block text-gray-600">{l.text}</span>
            </button>
          ))}
        </div>
        {lvl.error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {lvl.error}
          </p>
        )}
      </section>

      <section className={`${panelClasses} p-6`}>
        <h2 className="text-base font-semibold">Rules</h2>
        {rules.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No rules yet. Add the limits your agent must respect.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{describeRule(r.kind, r.params)}</span>
                <button
                  type="button"
                  className="text-red-600 underline disabled:opacity-50"
                  disabled={rm.pending}
                  onClick={() => rm.run(() => removeRuleAction({ id: r.id }))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {rm.error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {rm.error}
          </p>
        )}
        <AddRule />
      </section>

      <CustomInstructions saved={notes ?? ""} updatedAt={notesUpdatedAt} />
    </div>
  );
}

const NOTE_EXAMPLES = [
  "No ceremonies before 10am.",
  "For elopements under 20 guests, offer the Mini package first.",
  "Always ask if the venue allows flash photography.",
];

/** Plain-English rules the rule types above don't cover. */
function CustomInstructions({ saved, updatedAt }: { saved: string; updatedAt: string | null }) {
  const save = useAction();
  const [text, setText] = useState(saved);
  const [base, setBase] = useState(saved);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const count = text.trim().length;
  const tooLong = count > CUSTOM_INSTRUCTIONS_MAX;
  const changed = text.trim() !== base.trim();

  return (
    <section className={`${panelClasses} p-6`}>
      <h2 className="text-base font-semibold">Anything else your agent should know?</h2>
      <p className="mt-1 text-sm text-gray-600">
        Add rules that aren&apos;t covered above, in plain English. Your structured rules always win if they conflict.
      </p>
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed || tooLong) return;
          save.run(
            () => saveCustomInstructionsAction({ text }),
            () => {
              setBase(text);
              setSavedAt(new Date().toISOString());
            },
            text.trim() ? "Saved. Your agent will follow these notes." : "Notes cleared."
          );
        }}
      >
        <label htmlFor="agent-notes" className="sr-only">
          Notes for your agent
        </label>
        <textarea
          id="agent-notes"
          rows={5}
          className={`${fieldClasses} w-full`}
          placeholder={NOTE_EXAMPLES.map((x) => `e.g. ${x}`).join("\n")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="agent-notes-count"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span id="agent-notes-count" className={clsx(tooLong ? "text-red-600" : "text-gray-500")}>
            {count.toLocaleString("en-US")} / {CUSTOM_INSTRUCTIONS_MAX.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-gray-500">
                Last saved{" "}
                {new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <Button type="submit" color="cyan" disabled={save.pending || !changed || tooLong}>
              {save.pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {save.error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {save.error}
          </p>
        )}
        {save.notice && (
          <p role="status" className="mt-2 text-sm text-emerald-700">
            {save.notice}
          </p>
        )}
      </form>
    </section>
  );
}

const KINDS = [
  ["price_floor", "Lowest price I'll quote"],
  ["max_discount", "Biggest discount I'll give"],
  ["capacity_per_day", "Weddings per day"],
  ["blackout_weekday", "Day of the week I never work"],
  ["service_radius", "How far I'll travel"],
  ["always_review", "Ask me first when…"],
] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function AddRule() {
  const add = useAction();
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("price_floor");
  const [n, setN] = useState("");
  const [weekday, setWeekday] = useState("1");
  const [months, setMonths] = useState<number[]>([]);
  const [field, setField] = useState("guest_count");
  const [op, setOp] = useState(">");

  const value = wholeNumber(n);
  // The rule to save, in the shape RuleSchema expects (the server re-validates it); null until complete.
  const final =
    kind === "blackout_weekday"
      ? { kind, weekday: Number(weekday), ...(months.length ? { months } : {}) }
      : value == null
        ? null
        : kind === "price_floor"
          ? { kind, amount: value }
          : kind === "max_discount"
            ? { kind, percent: value }
            : kind === "capacity_per_day"
              ? { kind, max: value }
              : kind === "service_radius"
                ? { kind, miles: value }
                : { kind, field, op, value };
  const ready = final != null;

  const unit: Record<string, string> = { price_floor: "USD", max_discount: "%", capacity_per_day: "1-5", service_radius: "miles" };

  return (
    <form
      className="mt-5 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!final) return;
        add.run(
          () =>
            saveRuleAction({
              rule: final as never,
              sourceText: describeRule(final.kind, final as Record<string, unknown>),
            }),
          () => {
            setN("");
            setMonths([]);
          }
        );
      }}
    >
      <label className="block text-xs text-gray-600">
        Add a rule
        <select className={`${fieldClasses} mt-1 w-64`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {kind === "blackout_weekday" && (
        <>
          <select aria-label="Weekday" className={`${fieldClasses} w-36`} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
            <legend className="sr-only">Only in these months (none = all year)</legend>
            {MONTHS.map((m, i) => (
              <label key={m} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={months.includes(i + 1)}
                  onChange={() => setMonths((s) => (s.includes(i + 1) ? s.filter((x) => x !== i + 1) : [...s, i + 1].sort((a, b) => a - b)))}
                />
                {m}
              </label>
            ))}
          </fieldset>
        </>
      )}
      {kind === "always_review" && (
        <>
          <select aria-label="What to check" className={`${fieldClasses} w-56`} value={field} onChange={(e) => setField(e.target.value)}>
            <option value="guest_count">Guest count</option>
            <option value="days_until_wedding">Days until the wedding</option>
            <option value="budget_for_category">Budget for my category</option>
          </select>
          <select aria-label="Over or under" className={`${fieldClasses} w-24`} value={op} onChange={(e) => setOp(e.target.value)}>
            <option value=">">is over</option>
            <option value="<">is under</option>
          </select>
        </>
      )}
      {kind !== "blackout_weekday" && (
        <input
          aria-label="Value"
          inputMode="numeric"
          className={`${fieldClasses} w-32`}
          placeholder={unit[kind] ?? "Number"}
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
      )}
      <Button type="submit" color="cyan" disabled={add.pending || !ready}>
        Add rule
      </Button>
      {add.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {add.error}
        </p>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
