// src/components/dashboard/OfferEditor.tsx — list, edit, add and delete packages or add-ons.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import {
  addAddOnsAction,
  addPackagesAction,
  deleteAddOnAction,
  deletePackageAction,
  updateAddOnAction,
  updatePackageAction,
} from "@/app/vendor/dashboard/actions";
import { useAction, wholeNumber } from "./useAction";

type Item = { id: string; name: string; description: string | null; price: number; inclusions?: string[] | null };
type Kind = "package" | "addon";

const COPY = {
  package: { title: "Packages", noun: "package", empty: "No packages yet. Add your first one below." },
  addon: { title: "Add-ons", noun: "add-on", empty: "No add-ons. These are optional extras sold on top of a package." },
} as const;

export default function OfferEditor({ kind, items }: { kind: Kind; items: Item[] }) {
  const copy = COPY[kind];
  return (
    <section>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      {items.length === 0 && <p className="mt-2 text-sm text-gray-500">{copy.empty}</p>}
      <ul className="mt-3 space-y-4">
        {items
          .toSorted((a, b) => a.price - b.price)
          .map((it) => (
            <li key={it.id}>
              <Row kind={kind} item={it} />
            </li>
          ))}
        <li>
          <Row kind={kind} item={null} />
        </li>
      </ul>
    </section>
  );
}

function Row({ kind, item }: { kind: Kind; item: Item | null }) {
  const noun = COPY[kind].noun;
  const [f, setF] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: item ? String(item.price) : "",
    inclusions: (item?.inclusions ?? []).join("\n"),
  });
  const save = useAction();
  const del = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const price = wholeNumber(f.price);
  const inclusions = f.inclusions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const description = f.description.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (price == null) return;
    const clear = () => !item && setF({ name: "", description: "", price: "", inclusions: "" });
    if (kind === "package") {
      save.run(
        () =>
          item
            ? updatePackageAction({ id: item.id, name: f.name.trim(), description: description || null, price, inclusions })
            : addPackagesAction({ packages: [{ name: f.name.trim(), description: description || undefined, price, inclusions }] }),
        clear,
        item ? "Saved." : ""
      );
    } else {
      save.run(
        () =>
          item
            ? updateAddOnAction({ id: item.id, name: f.name.trim(), description: description || null, price })
            : addAddOnsAction({ addOns: [{ name: f.name.trim(), description: description || undefined, price }] }),
        clear,
        item ? "Saved." : ""
      );
    }
  }

  return (
    <form onSubmit={submit} className={`${panelClasses} grid gap-3 p-4 sm:grid-cols-[1fr_8rem]`}>
      <input aria-label={`${noun} name`} className={fieldClasses} placeholder={item ? "Name" : `New ${noun} name`} value={f.name} onChange={set("name")} required maxLength={80} />
      <input aria-label={`${noun} price`} className={fieldClasses} inputMode="numeric" placeholder="Price (USD)" value={f.price} onChange={set("price")} required />
      <textarea aria-label={`${noun} description`} className={`${fieldClasses} sm:col-span-2`} rows={2} placeholder="Description (optional)" value={f.description} onChange={set("description")} maxLength={kind === "package" ? 800 : 400} />
      {kind === "package" && (
        <textarea aria-label="What's included" className={`${fieldClasses} sm:col-span-2`} rows={3} placeholder="What's included, one per line" value={f.inclusions} onChange={set("inclusions")} />
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" color={item ? "gray" : "cyan"} disabled={save.pending || price == null}>
          {item ? "Save" : `Add ${noun}`}
        </Button>
        {item && (
          <button
            type="button"
            className="text-sm text-red-600 underline disabled:opacity-50"
            disabled={del.pending}
            onClick={() =>
              del.run(() => (kind === "package" ? deletePackageAction({ id: item.id }) : deleteAddOnAction({ id: item.id })))
            }
          >
            Delete
          </button>
        )}
        {(save.error || del.error) && (
          <p role="alert" className="text-sm text-red-600">
            {save.error || del.error}
          </p>
        )}
        {save.notice && <p className="text-sm text-emerald-700">{save.notice}</p>}
      </div>
    </form>
  );
}
