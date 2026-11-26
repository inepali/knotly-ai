// src/components/rsvp/RsvpDashboard.tsx — the couple's RSVP page.
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { saveRsvpSettingsAction, sendRsvpRemindersAction } from "@/app/client/dashboard/actions";
import {
  MAIN_EVENT,
  householdEvents,
  responsesCsv,
  type HouseholdAnswers,
  type ResponseRow,
  type RsvpEvent,
  type RsvpHousehold,
  type RsvpSettings,
} from "@/lib/rsvp";

type Answers = Record<string, HouseholdAnswers & { reminders_sent: number }>;
type Summary = { byEvent: Record<string, { attending: number; declined: number; waiting: number }>; meals: Record<string, number>; responded: number; waiting: string[]; plusOnes: number };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export default function RsvpDashboard({
  baseUrl,
  site,
  settings,
  events,
  households,
  responses,
  answers,
  summary,
}: {
  baseUrl: string;
  site: { slug: string; published_at: string | null } | null;
  settings: RsvpSettings;
  events: RsvpEvent[];
  households: RsvpHousehold[];
  responses: ResponseRow[];
  answers: Answers;
  summary: Summary;
}) {
  const [filter, setFilter] = useState<"all" | "waiting" | "replied">("all");
  const [copied, setCopied] = useState("");
  const remind = useAction();
  const answerMap = useMemo(() => new Map(Object.entries(answers)), [answers]);
  const evs = events.length ? events : [{ id: MAIN_EVENT, name: "The wedding" }];
  const live = !!site?.published_at;
  const link = (h: RsvpHousehold) => (site ? `${baseUrl}/w/${site.slug}/rsvp?t=${h.invite_token}` : "");
  const remindable = households.filter((h) => summary.waiting.includes(h.id) && (answers[h.id]?.reminders_sent ?? 0) < 2).length;
  const shown = households.filter((h) => filter === "all" || (filter === "waiting") === summary.waiting.includes(h.id));
  const status = (guestId: string, eventId: string) => responses.find((r) => r.guest_id === guestId && (r.event_id ?? MAIN_EVENT) === eventId);

  return (
    <div className="mt-6 space-y-6">
      {!live && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Guests RSVP on your website. <Link href="/client/dashboard/website" className="underline">Publish your website</Link> to open RSVPs.
        </p>
      )}
      {households.length === 0 && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Add guests on the <Link href="/client/dashboard/guests" className="underline">Guest List</Link>. Only people on it can RSVP.
        </p>
      )}

      <section className={`${panelClasses} p-6`}>
        <div className="grid gap-4 sm:grid-cols-3">
          {evs.map((e) => {
            const c = summary.byEvent[e.id] ?? { attending: 0, declined: 0, waiting: 0 };
            return (
              <div key={e.id}>
                <p className="text-xs text-gray-500">{e.name}</p>
                <p className="mt-1 text-xl font-semibold">{c.attending} coming</p>
                <p className="text-xs text-gray-500">{c.declined} can&apos;t · {c.waiting} waiting</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-gray-600">
          {summary.responded} of {households.length} households replied{summary.plusOnes ? ` · ${summary.plusOnes} plus-ones` : ""}
          {Object.keys(summary.meals).length > 0 && ` · Meals: ${Object.entries(summary.meals).map(([m, n]) => `${m} ${n}`).join(", ")}`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" color="gray" disabled={!households.length} onClick={() => download("rsvps.csv", responsesCsv(households, events, responses, answerMap, settings))}>
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            color="gray"
            disabled={remind.pending || !live || !remindable}
            onClick={() =>
              confirm(`Email a reminder to ${remindable} household${remindable === 1 ? "" : "s"} that haven't replied (those with an email)?`) &&
              remind.run(async () => {
                const r = await sendRsvpRemindersAction();
                return r.ok ? { ok: true } : r;
              }, undefined, "Reminders sent.")
            }
          >
            Send reminders ({remindable})
          </Button>
        </div>
        {(remind.error || remind.notice) && <p role={remind.error ? "alert" : "status"} className={clsx("mt-2 text-sm", remind.error ? "text-red-600" : "text-emerald-700")}>{remind.error || remind.notice}</p>}
        <p className="mt-2 text-xs text-gray-500">Each household gets at most 2 reminders.</p>
      </section>

      <SettingsForm settings={settings} />

      <section className={`${panelClasses} p-4 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Responses</h2>
          <select aria-label="Show" className={`${fieldClasses} w-44`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Everyone</option>
            <option value="waiting">Waiting ({summary.waiting.length})</option>
            <option value="replied">Replied ({summary.responded})</option>
          </select>
        </div>
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {shown.map((h) => {
            const a = answers[h.id];
            return (
              <li key={h.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {h.label}
                    {settings.require_code && <span className="ml-2 font-mono text-xs text-gray-500">code {h.rsvp_code}</span>}
                  </p>
                  {site && (
                    <button
                      type="button"
                      className="text-xs text-cyan-700 underline"
                      onClick={() => navigator.clipboard.writeText(link(h)).then(() => setCopied(h.id))}
                    >
                      {copied === h.id ? "Link copied ✓" : "Copy RSVP link"}
                    </button>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5 text-gray-700">
                  {h.guests.map((g) => (
                    <li key={g.id}>
                      {`${g.first_name} ${g.last_name}`.trim()}:{" "}
                      {householdEvents(h, events).map((e) => {
                        const r = status(g.id, e.id);
                        return (
                          <span key={e.id} className={clsx("mr-2", !r ? "text-gray-400" : r.status === "attending" ? "text-emerald-700" : "text-red-600")}>
                            {evs.length > 1 ? `${e.name} ` : ""}
                            {!r ? "waiting" : r.status === "attending" ? `yes${r.meal ? ` (${r.meal})` : ""}` : "no"}
                          </span>
                        );
                      })}
                      {status(g.id, householdEvents(h, events)[0]?.id)?.dietary && <span className="text-xs text-gray-500">· {status(g.id, householdEvents(h, events)[0].id)?.dietary}</span>}
                    </li>
                  ))}
                  {a?.responded_at && a.plus_ones.map((p, i) => <li key={i}>{p.name} (plus-one){p.meal ? ` · ${p.meal}` : ""}</li>)}
                </ul>
                {a?.note && <p className="mt-1 text-xs text-gray-600">“{a.note}”</p>}
                {!a?.responded_at && !!a?.reminders_sent && <p className="mt-1 text-xs text-gray-500">Reminded {a.reminders_sent}×</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function SettingsForm({ settings }: { settings: RsvpSettings }) {
  const save = useAction();
  const [deadline, setDeadline] = useState(settings.deadline ?? "");
  const [meals, setMeals] = useState(settings.meal_options.join("\n"));
  const [questions, setQuestions] = useState(settings.questions);
  const [requireCode, setRequireCode] = useState(settings.require_code);
  const [askDietary, setAskDietary] = useState(settings.ask_dietary);
  const [askSong, setAskSong] = useState(settings.ask_song);

  return (
    <section className={`${panelClasses} p-6`}>
      <h2 className="text-base font-semibold">RSVP settings</h2>
      <form
        className="mt-3 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(
            () =>
              saveRsvpSettingsAction({
                deadline,
                meal_options: meals.split("\n").map((m) => m.trim()).filter(Boolean),
                questions: questions.filter((q) => q.label.trim()),
                require_code: requireCode,
                ask_dietary: askDietary,
                ask_song: askSong,
              }),
            undefined,
            "Saved."
          );
        }}
      >
        <label className="text-sm">
          Reply by
          <input type="date" className={`${fieldClasses} mt-1`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="text-sm">
          Meal choices (one per line, leave empty to skip)
          <textarea rows={3} className={`${fieldClasses} mt-1`} placeholder={"Chicken\nFish\nVegetarian"} value={meals} onChange={(e) => setMeals(e.target.value)} />
        </label>
        <div className="space-y-2 text-sm sm:col-span-2">
          <p>Extra questions (up to 3)</p>
          {questions.map((q, i) => (
            <div key={q.id} className="flex gap-2">
              <input aria-label={`Question ${i + 1}`} className={fieldClasses} value={q.label} maxLength={200} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" className="text-red-600" aria-label="Remove question" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {questions.length < 3 && (
            <button type="button" className="text-cyan-700 underline" onClick={() => setQuestions([...questions, { id: `q${Date.now().toString(36)}`, label: "" }])}>
              + Add a question (e.g. &quot;Will you need the shuttle?&quot;)
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={askDietary} onChange={(e) => setAskDietary(e.target.checked)} /> Ask about dietary needs</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={askSong} onChange={(e) => setAskSong(e.target.checked)} /> Ask for a song request</label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5" checked={requireCode} onChange={(e) => setRequireCode(e.target.checked)} />
          <span>
            Require the household code to find an invitation by name
            <span className="block text-xs text-gray-500">Codes show next to each household below. Personal links always work without one.</span>
          </span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" color="cyan" disabled={save.pending}>{save.pending ? "Saving…" : "Save settings"}</Button>
          {(save.error || save.notice) && <p role={save.error ? "alert" : "status"} className={clsx("text-sm", save.error ? "text-red-600" : "text-emerald-700")}>{save.error || save.notice}</p>}
        </div>
      </form>
    </section>
  );
}
