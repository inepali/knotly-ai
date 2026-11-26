// src/components/registry/RegistryEditor.tsx — the couple's registry: intro, store links, funds,
// wish items (with who claimed them), and gift notes from guests.
"use client";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import {
  deleteGiftNoteAction,
  deleteRegistryFundAction,
  deleteRegistryItemAction,
  deleteRegistryLinkAction,
  removeClaimAction,
  saveRegistryFundAction,
  saveRegistryIntroAction,
  saveRegistryItemAction,
  saveRegistryLinkAction,
} from "@/app/client/dashboard/actions";
import type { loadRegistryEditor } from "@/lib/actions/registry";
import { METHOD_LABELS, methodLink, parseUsd, storeFromUrl, usd, type FundMethod, type RegistryFund, type RegistryItem } from "@/lib/registry";

type Data = Extract<Awaited<ReturnType<typeof loadRegistryEditor>>, { ok: true }>["data"];

function Msg({ a }: { a: ReturnType<typeof useAction> }) {
  if (!a.error && !a.notice) return null;
  return <p role={a.error ? "alert" : "status"} className={clsx("text-sm", a.error ? "text-red-600" : "text-emerald-700")}>{a.error || a.notice}</p>;
}

export default function RegistryEditor({ data }: { data: Data }) {
  const intro = useAction();
  const del = useAction();
  const [introText, setIntroText] = useState(data.intro ?? "");
  const [editFund, setEditFund] = useState<string | "new" | null>(null);
  const [editItem, setEditItem] = useState<string | "new" | null>(null);
  const live = !!data.site?.published_at;
  const fundName = (id: string | null) => data.funds.find((f) => f.id === id)?.title;

  return (
    <div className="mt-6 space-y-6">
      {!live && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Guests see your registry on your website. <Link href="/client/dashboard/website" className="underline">Publish your website</Link> when you&apos;re ready.
        </p>
      )}

      <section className={`${panelClasses} space-y-2 p-5`}>
        <h2 className="text-base font-semibold">A note for guests</h2>
        <textarea rows={2} maxLength={600} className={fieldClasses} placeholder="Your presence is the best gift. If you'd like to give something…" value={introText} onChange={(e) => setIntroText(e.target.value)} />
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" color="gray" disabled={intro.pending || introText === (data.intro ?? "")} onClick={() => intro.run(() => saveRegistryIntroAction({ intro: introText }), undefined, "Saved.")}>
            Save note
          </Button>
          <Msg a={intro} />
        </div>
      </section>

      <StoreLinks links={data.links} />

      <section className={`${panelClasses} space-y-3 p-5`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Cash & honeymoon funds ({data.funds.length}/10)</h2>
          {data.funds.length < 10 && editFund !== "new" && <Button type="button" variant="outline" color="gray" onClick={() => setEditFund("new")}>Add fund</Button>}
        </div>
        {editFund === "new" && <FundForm onDone={() => setEditFund(null)} />}
        {data.funds.map((f) =>
          editFund === f.id ? (
            <FundForm key={f.id} initial={f} onDone={() => setEditFund(null)} />
          ) : (
            <div key={f.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
              <div>
                <p className="font-semibold">{f.title}{f.goal_cents != null && <span className="ml-2 font-normal text-gray-500">goal {usd(f.goal_cents)}</span>}</p>
                <p className="text-gray-600">{f.methods.map((m) => `${METHOD_LABELS[m.kind]} ${methodLink(m)?.text ?? ""}`).join(" · ")}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" className="text-cyan-700 underline" onClick={() => setEditFund(f.id)}>Edit</button>
                <button type="button" className="text-red-600 underline" onClick={() => confirm(`Remove ${f.title}?`) && del.run(() => deleteRegistryFundAction({ id: f.id }))}>Remove</button>
              </div>
            </div>
          )
        )}
      </section>

      <section className={`${panelClasses} space-y-3 p-5`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Wish list ({data.items.length}/50)</h2>
          {data.items.length < 50 && editItem !== "new" && <Button type="button" variant="outline" color="gray" onClick={() => setEditItem("new")}>Add item</Button>}
        </div>
        <p className="text-sm text-gray-600">Things from anywhere. Guests tap &quot;I&apos;ll get this&quot; so nobody buys the same thing twice.</p>
        {editItem === "new" && <ItemForm onDone={() => setEditItem(null)} />}
        {data.items.map((it) => {
          const claims = data.claims.filter((c) => c.item_id === it.id);
          return editItem === it.id ? (
            <ItemForm key={it.id} initial={it} onDone={() => setEditItem(null)} />
          ) : (
            <div key={it.id} className="border-t border-gray-100 pt-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">
                  {it.title}
                  <span className="ml-2 font-normal text-gray-500">{[usd(it.price_cents), `${it.claimed}/${it.quantity} claimed`].filter(Boolean).join(" · ")}</span>
                </p>
                <div className="flex gap-3">
                  <button type="button" className="text-cyan-700 underline" onClick={() => setEditItem(it.id)}>Edit</button>
                  <button type="button" className="text-red-600 underline" onClick={() => confirm(`Remove ${it.title}?`) && del.run(() => deleteRegistryItemAction({ id: it.id }))}>Remove</button>
                </div>
              </div>
              {claims.map((c) => (
                <p key={c.id} className="mt-1 text-gray-600">
                  ✓ {c.name}{c.note ? `: “${c.note}”` : ""}{" "}
                  <button type="button" className="text-xs text-red-600 underline" onClick={() => confirm(`Un-claim this for ${c.name}?`) && del.run(() => removeClaimAction({ id: c.id }))}>undo</button>
                </p>
              ))}
            </div>
          );
        })}
      </section>

      <section className={`${panelClasses} space-y-2 p-5`}>
        <h2 className="text-base font-semibold">Gift notes from guests ({data.notes.length})</h2>
        {data.notes.length === 0 ? (
          <p className="text-sm text-gray-500">When a guest tells you they sent something, it shows up here.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {data.notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2 py-2">
                <span>
                  <strong>{n.name}</strong>{fundName(n.fund_id) ? ` · ${fundName(n.fund_id)}` : ""}
                  {n.note && <span className="block text-gray-600">“{n.note}”</span>}
                  <span className="block text-xs text-gray-400">{new Date(n.created_at).toLocaleDateString("en-US")}</span>
                </span>
                <button type="button" className="text-xs text-red-600 underline" onClick={() => del.run(() => deleteGiftNoteAction({ id: n.id }))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Msg a={del} />
    </div>
  );
}

function StoreLinks({ links }: { links: Data["links"] }) {
  const save = useAction();
  const del = useAction();
  const [url, setUrl] = useState("");
  const [store, setStore] = useState("");
  return (
    <section className={`${panelClasses} space-y-3 p-5`}>
      <h2 className="text-base font-semibold">Store registries ({links.length}/10)</h2>
      {links.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-cyan-700 underline">{l.store}</a>
          <button type="button" className="text-red-600 underline" onClick={() => del.run(() => deleteRegistryLinkAction({ id: l.id }))}>Remove</button>
        </div>
      ))}
      {links.length < 10 && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(
              () => saveRegistryLinkAction({ url, store }),
              () => {
                setUrl("");
                setStore("");
              }
            );
          }}
        >
          <label className="text-xs text-gray-600">
            Registry link
            <input className={`${fieldClasses} mt-1 w-72`} placeholder="https://www.amazon.com/wedding/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="text-xs text-gray-600">
            Name
            <input className={`${fieldClasses} mt-1 w-40`} placeholder={(url && storeFromUrl(url)) || "Amazon"} value={store} onChange={(e) => setStore(e.target.value)} />
          </label>
          <Button type="submit" color="cyan" disabled={save.pending || !url.trim()}>Add</Button>
        </form>
      )}
      <Msg a={save} />
      <Msg a={del} />
    </section>
  );
}

const KINDS = Object.keys(METHOD_LABELS) as FundMethod["kind"][];
const PLACEHOLDER: Record<FundMethod["kind"], string> = {
  venmo: "@your-venmo",
  paypal: "paypal.me name",
  cashapp: "$cashtag",
  zelle: "Email or phone for Zelle",
  honeyfund: "https://www.honeyfund.com/site/…",
  link: "https://…",
};

function FundForm({ initial, onDone }: { initial?: RegistryFund; onDone: () => void }) {
  const save = useAction();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [goal, setGoal] = useState(initial?.goal_cents != null ? String(initial.goal_cents / 100) : "");
  const [methods, setMethods] = useState<FundMethod[]>(initial?.methods.length ? initial.methods : [{ kind: "venmo", value: "" }]);
  const goalCents = parseUsd(goal);
  return (
    <form
      className="space-y-2 rounded-xl border border-gray-100 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(
          () => saveRegistryFundAction({ id: initial?.id, title, description, goal_cents: goalCents ?? null, methods: methods.filter((m) => m.value.trim()) }),
          onDone
        );
      }}
    >
      <input aria-label="Fund name" placeholder="Honeymoon in Bali" className={fieldClasses} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea aria-label="Description" placeholder="What it's for (optional)" rows={2} className={fieldClasses} value={description} onChange={(e) => setDescription(e.target.value)} />
      <input aria-label="Goal" placeholder="Goal in $ (optional)" inputMode="decimal" className={`${fieldClasses} w-48`} value={goal} onChange={(e) => setGoal(e.target.value)} />
      {methods.map((m, i) => (
        <div key={i} className="flex gap-2">
          <select aria-label="Method" className={`${fieldClasses} w-36`} value={m.kind} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, kind: e.target.value as FundMethod["kind"] } : x)))}>
            {KINDS.map((k) => <option key={k} value={k}>{METHOD_LABELS[k]}</option>)}
          </select>
          <input aria-label="Handle or link" className={fieldClasses} placeholder={PLACEHOLDER[m.kind]} value={m.value} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <button type="button" aria-label="Remove" className="text-red-600" onClick={() => setMethods(methods.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {methods.length < 6 && <button type="button" className="text-cyan-700 underline" onClick={() => setMethods([...methods, { kind: "paypal", value: "" }])}>+ Another way to send</button>}
      <div className="flex items-center gap-3">
        <Button type="submit" color="cyan" disabled={save.pending || !title.trim() || goalCents === undefined}>Save fund</Button>
        <button type="button" className="text-gray-600" onClick={onDone}>Cancel</button>
      </div>
      {goalCents === undefined && <p className="text-xs text-red-600">Enter the goal as a number, like 2500.</p>}
      <Msg a={save} />
    </form>
  );
}

function ItemForm({ initial, onDone }: { initial?: RegistryItem; onDone: () => void }) {
  const save = useAction();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [image, setImage] = useState(initial?.image_url ?? "");
  const [price, setPrice] = useState(initial?.price_cents != null ? String(initial.price_cents / 100) : "");
  const [qty, setQty] = useState(initial?.quantity ?? 1);
  const [note, setNote] = useState(initial?.note ?? "");
  const priceCents = parseUsd(price);
  return (
    <form
      className="grid gap-2 rounded-xl border border-gray-100 p-3 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(() => saveRegistryItemAction({ id: initial?.id, title, url, image_url: image, price_cents: priceCents ?? null, quantity: qty, note }), onDone);
      }}
    >
      <input aria-label="Item" placeholder="Stand mixer" className={`${fieldClasses} sm:col-span-2`} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="Link" placeholder="Link to the item (https://…)" className={fieldClasses} value={url} onChange={(e) => setUrl(e.target.value)} />
      <input aria-label="Image link" placeholder="Image link (optional, https://…)" className={fieldClasses} value={image} onChange={(e) => setImage(e.target.value)} />
      <input aria-label="Price" placeholder="Price in $ (optional)" inputMode="decimal" className={fieldClasses} value={price} onChange={(e) => setPrice(e.target.value)} />
      <label className="flex items-center gap-2 text-xs text-gray-600">
        How many
        <input type="number" min={1} max={20} className={`${fieldClasses} w-20`} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
      </label>
      <input aria-label="Note" placeholder="Note (color, size…)" className={`${fieldClasses} sm:col-span-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" color="cyan" disabled={save.pending || !title.trim() || priceCents === undefined}>Save item</Button>
        <button type="button" className="text-gray-600" onClick={onDone}>Cancel</button>
        {priceCents === undefined && <span className="text-xs text-red-600">Enter the price as a number.</span>}
      </div>
      <div className="sm:col-span-2"><Msg a={save} /></div>
    </form>
  );
}
