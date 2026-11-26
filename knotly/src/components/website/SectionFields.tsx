// src/components/website/SectionFields.tsx — the content fields for one website section.
"use client";
import { fieldClasses } from "@/components/ui/fields";
import type { Section } from "@/lib/wedding-site";

type Props = { section: Section; onChange: (s: Section) => void };

/** Editable list of small records (travel items, party members, FAQs). */
function ListEditor<T extends Record<string, string>>({
  items,
  blank,
  max,
  fields,
  onChange,
  addLabel,
}: {
  items: T[];
  blank: T;
  max: number;
  fields: { key: keyof T & string; label: string; long?: boolean }[];
  onChange: (items: T[]) => void;
  addLabel: string;
}) {
  const set = (i: number, k: keyof T, v: string) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-gray-100 p-3">
          {fields.map((f) =>
            f.long ? (
              <textarea key={f.key} aria-label={f.label} placeholder={f.label} rows={3} className={fieldClasses} value={item[f.key]} onChange={(e) => set(i, f.key, e.target.value)} />
            ) : (
              <input key={f.key} aria-label={f.label} placeholder={f.label} className={fieldClasses} value={item[f.key]} onChange={(e) => set(i, f.key, e.target.value)} />
            )
          )}
          <button type="button" className="text-xs text-red-600 underline" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="text-sm text-cyan-700 underline" onClick={() => onChange([...items, { ...blank }])}>
          + {addLabel}
        </button>
      )}
    </div>
  );
}

export default function SectionFields({ section: s, onChange }: Props) {
  switch (s.type) {
    case "hero":
      return (
        <label className="block text-sm">
          Line under your names
          <input className={`${fieldClasses} mt-1`} maxLength={120} value={s.subtitle} onChange={(e) => onChange({ ...s, subtitle: e.target.value })} />
        </label>
      );
    case "story":
      return (
        <label className="block text-sm">
          Your story
          <textarea className={`${fieldClasses} mt-1`} rows={6} maxLength={4000} value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
        </label>
      );
    case "travel":
      return (
        <ListEditor
          items={s.items}
          blank={{ title: "", details: "", url: "" }}
          max={10}
          addLabel="Add a hotel, airport or tip"
          fields={[
            { key: "title", label: "Title (e.g. Hotel block at The Westin)" },
            { key: "details", label: "Details (code, dates, parking…)", long: true },
            { key: "url", label: "Link (https://…)" },
          ]}
          onChange={(items) => onChange({ ...s, items })}
        />
      );
    case "party":
      return (
        <ListEditor
          items={s.members}
          blank={{ name: "", role: "" }}
          max={30}
          addLabel="Add a person"
          fields={[
            { key: "name", label: "Name" },
            { key: "role", label: "Role (e.g. Maid of honor)" },
          ]}
          onChange={(members) => onChange({ ...s, members })}
        />
      );
    case "faq":
      return (
        <ListEditor
          items={s.items}
          blank={{ q: "", a: "" }}
          max={20}
          addLabel="Add a question"
          fields={[
            { key: "q", label: "Question (e.g. Is there a dress code?)" },
            { key: "a", label: "Answer", long: true },
          ]}
          onChange={(items) => onChange({ ...s, items })}
        />
      );
    default:
      return null;
  }
}
