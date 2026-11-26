// src/components/registry/RegistrySection.tsx — the registry on the public wedding website:
// store links, cash funds (links to Venmo/PayPal/…; Knotly never handles the money), wish items.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimItemAction, giftNoteAction } from "@/app/w/[slug]/registry/actions";
import { METHOD_LABELS, methodLink, remaining, usd } from "@/lib/registry";
import type { PublicRegistry } from "@/lib/registry-data";

const field = "w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-sm text-gray-900";
const card = "rounded-2xl p-5";
const soft = { background: "var(--ws-soft)" } as const;

export default function RegistrySection({ slug, registry }: { slug: string; registry: PublicRegistry }) {
  const [noteFor, setNoteFor] = useState<string | "general" | null>(null);
  return (
    <div className="mt-6 space-y-8">
      {registry.intro && <p className="text-center whitespace-pre-line opacity-80">{registry.intro}</p>}

      {registry.links.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-3">
          {registry.links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-block rounded-full border px-5 py-2" style={{ borderColor: "var(--ws-accent)" }}>
                {l.store}
              </a>
              {l.note && <p className="mt-1 text-center text-xs opacity-70">{l.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {registry.funds.map((f) => (
        <div key={f.id} className={card} style={soft}>
          <p className="text-lg">{f.title}</p>
          {f.description && <p className="mt-1 text-sm whitespace-pre-line opacity-80">{f.description}</p>}
          {f.goal_cents != null && <p className="mt-1 text-xs opacity-70">Goal: {usd(f.goal_cents)}</p>}
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {f.methods.map((m, i) => {
              const l = methodLink(m);
              if (!l) return null;
              return (
                <li key={i}>
                  {l.href ? (
                    <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-block rounded-full bg-white/80 px-3 py-1 text-gray-900">
                      {METHOD_LABELS[m.kind]} · {l.text}
                    </a>
                  ) : (
                    <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-gray-900">
                      {METHOD_LABELS[m.kind]}: {l.text}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {noteFor === f.id ? (
            <GiftNote slug={slug} fundId={f.id} onDone={() => setNoteFor(null)} />
          ) : (
            <button type="button" className="mt-3 text-sm underline" onClick={() => setNoteFor(f.id)}>
              I sent a gift
            </button>
          )}
        </div>
      ))}

      {registry.items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {registry.items.map((it) => (
            <Item key={it.id} slug={slug} item={it} />
          ))}
        </ul>
      )}

      <p className="text-center text-xs opacity-60">
        Gifts and payments go directly to the couple through the linked service. Knotly doesn&apos;t process payments.{" "}
        {noteFor !== "general" && (
          <button type="button" className="underline" onClick={() => setNoteFor("general")}>
            Let the couple know you sent something
          </button>
        )}
      </p>
      {noteFor === "general" && <GiftNote slug={slug} fundId={null} onDone={() => setNoteFor(null)} />}
    </div>
  );
}

function Item({ slug, item }: { slug: string; item: PublicRegistry["items"][number] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [honey, setHoney] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const left = remaining(item);
  return (
    <li className={card} style={soft}>
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- couple-provided https image
        <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="mb-3 aspect-video w-full rounded-xl bg-white/50 object-contain" />
      )}
      <p className="text-lg">{item.title}</p>
      <p className="text-sm opacity-70">
        {[usd(item.price_cents), item.quantity > 1 ? `${left} of ${item.quantity} still needed` : ""].filter(Boolean).join(" · ")}
      </p>
      {item.note && <p className="mt-1 text-sm opacity-80">{item.note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            View item
          </a>
        )}
        {left === 0 ? (
          <span className="opacity-70">✓ Taken care of</span>
        ) : !open ? (
          <button type="button" className="underline" onClick={() => setOpen(true)}>
            I&apos;ll get this
          </button>
        ) : null}
      </div>
      {open && left > 0 && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg("");
            start(async () => {
              const r = await claimItemAction(slug, item.id, name, note, honey);
              if (!r.ok) return setMsg(r.error ?? "Please try again.");
              setOpen(false);
              setMsg("Thank you! The couple will see it's taken care of.");
              router.refresh();
            });
          }}
        >
          <input aria-label="Your name" placeholder="Your name (only the couple sees it)" maxLength={60} className={field} value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Note" placeholder="Note (optional)" maxLength={300} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={honey} onChange={(e) => setHoney(e.target.value)} />
          <button type="submit" disabled={pending || !name.trim()} className="rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50" style={{ background: "var(--ws-accent)" }}>
            {pending ? "Saving…" : "Mark as mine"}
          </button>
        </form>
      )}
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
    </li>
  );
}

function GiftNote({ slug, fundId, onDone }: { slug: string; fundId: string | null; onDone: () => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [honey, setHoney] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <p role="status" className="mt-3 text-sm">Thank you! The couple will get your note.</p>;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await giftNoteAction(slug, fundId, name, note, honey);
          if (!r.ok) return setMsg(r.error ?? "Please try again.");
          setSent(true);
        });
      }}
    >
      <input aria-label="Your name" placeholder="Your name" maxLength={60} className={field} value={name} onChange={(e) => setName(e.target.value)} />
      <textarea aria-label="Note" placeholder="A note for the couple (optional)" rows={2} maxLength={500} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={honey} onChange={(e) => setHoney(e.target.value)} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !name.trim()} className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--ws-accent)" }}>
          {pending ? "Sending…" : "Send"}
        </button>
        <button type="button" className="text-sm underline" onClick={onDone}>Cancel</button>
      </div>
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
    </form>
  );
}
