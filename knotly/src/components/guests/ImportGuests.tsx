// src/components/guests/ImportGuests.tsx — CSV import: pick or paste a file, preview, then add.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import { importHouseholdsAction } from "@/app/client/dashboard/actions";
import { previewImport, TEMPLATE_CSV, type ImportPreview } from "@/lib/guests";

const MAX_BYTES = 1_000_000;

export default function ImportGuests({ partnerNames, onDone }: { partnerNames: string | null; onDone: () => void }) {
  const run = useAction();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState("");

  const guests = preview?.households.reduce((s, h) => s + h.guests.length, 0) ?? 0;

  return (
    <section className={`${panelClasses} space-y-3 p-4 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Import from a spreadsheet</h2>
        <a
          className="text-sm text-cyan-700 underline"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
          download="knotly-guest-template.csv"
        >
          Download the template
        </a>
      </div>
      <p className="text-sm text-gray-600">
        Export a CSV from Excel, Google Sheets or another site. One row per guest. Rows with the same Household name (or
        the same last name and street) become one household. Imported guests are added; nothing already here changes.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        className="block text-sm"
        onChange={async (e) => {
          setFileError("");
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > MAX_BYTES) return setFileError("That file is over 1 MB. Split it into smaller files.");
          const t = await f.text();
          setText(t);
          setPreview(previewImport(t, partnerNames));
        }}
      />
      <textarea
        aria-label="Or paste CSV"
        rows={4}
        placeholder="…or paste CSV here"
        className={`${fieldClasses} font-mono text-xs`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(e.target.value.trim() ? previewImport(e.target.value, partnerNames) : null);
        }}
      />
      {fileError && <p role="alert" className="text-sm text-red-600">{fileError}</p>}

      {preview && (
        <div className="space-y-2 text-sm">
          <p className="text-gray-700">
            Found <strong>{preview.households.length}</strong> households and <strong>{guests}</strong> guests.
            {preview.recognized.length > 0 && <> Columns we recognized: {preview.recognized.join(", ")}.</>}
          </p>
          {preview.problems.map((p) => (
            <p key={p} className="text-amber-700">{p}</p>
          ))}
          {preview.households.length > 0 && (
            <ul className="max-h-60 overflow-y-auto rounded-lg border border-gray-100 p-2 text-xs">
              {preview.households.slice(0, 100).map((h, i) => (
                <li key={i} className="py-0.5">
                  <strong>{h.label}</strong>: {h.guests.map((g) => `${g.first_name} ${g.last_name}`.trim()).join(", ")}
                  {h.plus_ones ? ` (+${h.plus_ones})` : ""}
                </li>
              ))}
              {preview.households.length > 100 && <li className="py-0.5 text-gray-500">…and {preview.households.length - 100} more</li>}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              color="cyan"
              disabled={run.pending || !preview.households.length}
              onClick={() =>
                run.run(
                  () => importHouseholdsAction({ households: preview.households }),
                  () => {
                    setText("");
                    setPreview(null);
                    onDone();
                  }
                )
              }
            >
              {run.pending ? "Importing…" : `Add ${guests} guests`}
            </Button>
            <button type="button" className="text-gray-600" onClick={onDone}>
              Cancel
            </button>
          </div>
          {run.error && <p role="alert" className="text-red-600">{run.error}</p>}
        </div>
      )}
    </section>
  );
}
