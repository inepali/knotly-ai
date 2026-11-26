// src/components/dashboard/CalendarSync.tsx — subscribe to your Knotly bookings from Google,
// Apple or Outlook calendar. Dates marked booked in Knotly then appear there on their own.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { resetCalendarLinkAction } from "@/app/vendor/dashboard/actions";
import { useAction } from "./useAction";

export default function CalendarSync({ feedUrl }: { feedUrl: string }) {
  const act = useAction();
  const [copied, setCopied] = useState(false);
  const webcal = feedUrl.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const local = /localhost|127\.0\.0\.1/.test(feedUrl);

  return (
    <section className={`${panelClasses} p-6`}>
      <h2 className="text-base font-semibold">Add to your calendar</h2>
      <p className="mt-1 text-sm text-gray-600">
        Subscribe once and every date you mark <strong>booked</strong> in Knotly shows up in your own calendar as an all-day
        event. Calendar apps check for changes every so often, so a new booking can take a few hours to appear (Google can
        take up to a day).
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={google}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
        >
          Add to Google Calendar
        </a>
        <a href={webcal} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Apple / Outlook
        </a>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input readOnly aria-label="Calendar feed link" className={`${fieldClasses} min-w-0 flex-1`} value={feedUrl} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(feedUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* the field is selectable, so copying by hand still works */
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {local && (
        <p className="mt-2 text-xs text-amber-700">
          This link points at localhost, so Google can&apos;t reach it. It works once the app has a public address (set APP_URL).
        </p>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Keep this link private: anyone who has it can see your booked dates.{" "}
        <button
          type="button"
          className="underline hover:text-gray-700 disabled:opacity-50"
          disabled={act.pending}
          onClick={() => {
            if (window.confirm("Make a new link? Calendars using the old one will stop updating.")) act.run(resetCalendarLinkAction);
          }}
        >
          Make a new link
        </button>
      </p>
      {act.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {act.error}
        </p>
      )}
    </section>
  );
}
