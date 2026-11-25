// src/components/dashboard/WeddingForm.tsx — the My Wedding form. Every field is optional and
// partial saves are fine; "Post to vendors" saves what's on screen, then posts it.
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, labelClasses, panelClasses } from "@/components/ui/fields";
import { HOURLY_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/categories";
import { saveAndPostAction, saveWeddingAction } from "@/app/client/dashboard/actions";

export type WeddingFormInitial = {
  partnerNames: string;
  weddingDate: string;
  metro: string;
  venue: string;
  guestCount: number | null;
  budgetTotal: number | null;
  style: string;
  needs: { category: string; budget: number | null; hours: number | null }[];
  postedAt: string | null;
};

type Metro = { slug: string; name: string; state: string };

const groups = [...new Set(VENDOR_CATEGORIES.map((c) => c.group))];

export default function WeddingForm({ initial, metros }: { initial: WeddingFormInitial; metros: Metro[] }) {
  const [v, setV] = useState({
    partnerNames: initial.partnerNames,
    weddingDate: initial.weddingDate,
    metro: initial.metro,
    venue: initial.venue,
    guestCount: initial.guestCount?.toString() ?? "",
    budgetTotal: initial.budgetTotal?.toString() ?? "",
    style: initial.style,
  });
  // category -> budget text ("" = no budget); present key = needed
  const [needs, setNeeds] = useState<Record<string, string>>(
    Object.fromEntries(initial.needs.map((n) => [n.category, n.budget?.toString() ?? ""]))
  );
  // category -> hours of service text ("" = not specified); only used for hourly categories
  const [hours, setHours] = useState<Record<string, string>>(
    Object.fromEntries(initial.needs.map((n) => [n.category, n.hours?.toString() ?? ""]))
  );
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (category: string) =>
    setNeeds((s) => {
      const next = { ...s };
      if (category in next) delete next[category];
      else next[category] = "";
      return next;
    });

  const whole = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Math.round(Number(s)) : undefined);
  const payload = () => ({
    partnerNames: v.partnerNames.trim() || undefined,
    weddingDate: v.weddingDate || undefined,
    metro: v.metro || undefined,
    venue: v.venue.trim() || undefined,
    guestCount: whole(v.guestCount),
    budgetTotal: whole(v.budgetTotal),
    style: v.style.trim() || undefined,
    needs: Object.keys(needs),
    needBudgets: Object.entries(needs).map(([category, b]) => ({
      category,
      budget: whole(b) ?? null,
      hours: HOURLY_CATEGORIES.has(category) ? Math.min(whole(hours[category] ?? "") ?? 0, 24) || null : null,
    })),
  });

  const canPost = !!v.weddingDate && !!v.metro && Object.keys(needs).length > 0;
  const posted = !!initial.postedAt;

  function save() {
    setMessage(null);
    start(async () => {
      // The server action's input type is the shared Zod schema's; categories are validated there.
      const r = await saveWeddingAction(payload() as never);
      setMessage(r.ok ? { tone: "ok", text: "Saved." } : { tone: "bad", text: r.error });
    });
  }
  function post() {
    setMessage(null);
    start(async () => {
      const r = await saveAndPostAction(payload() as never);
      setMessage(
        r.ok
          ? {
              tone: "ok",
              text: "Posted. Matching vendors are being asked now; their estimates will show up under Estimates.",
            }
          : { tone: "bad", text: r.error }
      );
    });
  }

  return (
    <form
      className="mt-6 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className={`${panelClasses} grid gap-4 p-6 sm:grid-cols-2`}>
        <Field label="Partner names">
          <input className={fieldClasses} value={v.partnerNames} onChange={set("partnerNames")} placeholder="Priya & Sam" />
        </Field>
        <Field label="Wedding date">
          <input type="date" className={fieldClasses} value={v.weddingDate} onChange={set("weddingDate")} />
        </Field>
        <Field label="City">
          <select className={fieldClasses} value={v.metro} onChange={set("metro")}>
            <option value="">Choose a city</option>
            {metros.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}, {m.state}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venue">
          <input className={fieldClasses} value={v.venue} onChange={set("venue")} placeholder="Crystal Ballroom" />
        </Field>
        <Field label="Guest count">
          <input inputMode="numeric" className={fieldClasses} value={v.guestCount} onChange={set("guestCount")} placeholder="120" />
        </Field>
        <Field label="Total budget (USD)">
          <input inputMode="numeric" className={fieldClasses} value={v.budgetTotal} onChange={set("budgetTotal")} placeholder="30000" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Style">
            <input className={fieldClasses} value={v.style} onChange={set("style")} placeholder="boho, outdoor, golden hour" />
          </Field>
        </div>
      </section>

      <section className={`${panelClasses} p-6`}>
        <h2 className="text-base font-semibold">Vendors you need</h2>
        <p className="mt-1 text-sm text-gray-600">
          Tick what you still need. For services priced by the hour (photographer, videographer, DJ and so on), add how
          many hours you want, for example 6, so vendors can quote the right amount. Add a budget too if you have one;
          otherwise your total budget is used.
        </p>
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <fieldset key={g}>
              <legend className="text-xs font-semibold tracking-wide text-cyan-700 uppercase">{g}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {VENDOR_CATEGORIES.filter((c) => c.group === g).map((c) => {
                  const on = c.slug in needs;
                  return (
                    <div key={c.slug} className="flex items-center gap-3">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <input type="checkbox" checked={on} onChange={() => toggle(c.slug)} className="rounded border-gray-300 text-cyan-600" />
                        <span className="truncate">{c.name}</span>
                      </label>
                      {on && HOURLY_CATEGORIES.has(c.slug) && (
                        <div className="relative w-20 flex-none">
                          <input
                            inputMode="numeric"
                            aria-label={`${c.name} hours of service`}
                            placeholder="hrs"
                            value={hours[c.slug] ?? ""}
                            onChange={(e) =>
                              setHours((s) => ({ ...s, [c.slug]: e.target.value.replace(/\D/g, "").slice(0, 2) }))
                            }
                            className={`${fieldClasses} text-right tabular-nums`}
                          />
                        </div>
                      )}
                      {on && (
                        <div className="relative w-24 flex-none">
                          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-gray-400">
                            $
                          </span>
                          <input
                            inputMode="numeric"
                            aria-label={`${c.name} budget`}
                            placeholder="0000"
                            value={needs[c.slug]}
                            onChange={(e) => setNeeds((s) => ({ ...s, [c.slug]: e.target.value.replace(/\D/g, "") }))}
                            className={`${fieldClasses} pl-6 text-right tabular-nums`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" color="gray" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" color="cyan" disabled={pending || !canPost} onClick={post}>
          {posted ? "Update post" : "Post to vendors"}
        </Button>
        {!canPost && <p className="text-xs text-gray-500">To post, add your date, city and at least one vendor type.</p>}
        {message && (
          <p role="status" className={message.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
            {message.text}
          </p>
        )}
      </div>
      {posted && (
        <p className="text-xs text-gray-500">
          Posted {new Date(initial.postedAt!).toLocaleDateString("en-US", { dateStyle: "medium" })}. Adding a vendor type and
          updating your post asks vendors for that type only.
        </p>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClasses}>{label}</span>
      {children}
    </label>
  );
}
