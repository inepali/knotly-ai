// src/components/website/WebsiteEditor.tsx — edit the wedding website: address, theme, sections,
// photos, password, search engines, publish.
"use client";
import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { fieldClasses, panelClasses } from "@/components/ui/fields";
import { useAction } from "@/components/dashboard/useAction";
import {
  checkSlugAction,
  publishSiteAction,
  saveSiteAction,
  setSitePasswordAction,
} from "@/app/client/dashboard/actions";
import type { loadSiteEditor } from "@/lib/actions/website";
import { ADDON_SECTIONS, SECTION_LABELS, THEMES, type Section, type ThemeKey } from "@/lib/wedding-site";
import SectionFields from "./SectionFields";
import SitePhotos from "./SitePhotos";

type Data = Extract<Awaited<ReturnType<typeof loadSiteEditor>>, { ok: true }>["data"];

const ADDON_NAMES: Record<string, string> = { rsvp: "RSVP", registry: "Gift Registry", photo_share: "Photo Sharing" };

export default function WebsiteEditor({ data, baseUrl }: { data: Data; baseUrl: string }) {
  const { site } = data;
  const save = useAction();
  const slugCheck = useAction();
  const pub = useAction();
  const pw = useAction();
  const [slug, setSlug] = useState(site.slug);
  const [title, setTitle] = useState(site.title);
  const [theme, setTheme] = useState<ThemeKey>(site.theme);
  const [indexable, setIndexable] = useState(site.indexable);
  const [sections, setSections] = useState<Section[]>(site.sections);
  const [open, setOpen] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [dirty, setDirty] = useState(!site.exists);

  const touch =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setDirty(true);
    };
  const setSection = (i: number, s: Section) => touch(setSections)(sections.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    touch(setSections)(next);
  };
  const url = `${baseUrl}${site.slug}`;
  const published = !!site.publishedAt;

  return (
    <div className="mt-6 space-y-6">
      {site.exists && (
        <section className={`${panelClasses} flex flex-wrap items-center justify-between gap-3 p-5`}>
          <div className="text-sm">
            <p className="font-semibold">{published ? "Your site is live" : "Not published yet"}</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-cyan-700 underline">
              {url.replace(/^https?:\/\//, "")}
            </a>
            {published && !site.indexable && <p className="text-xs text-gray-500">Only people with the link can find it.</p>}
          </div>
          <div className="flex items-center gap-2">
            {published && (
              <Button variant="outline" color="gray" href={url} target="_blank" rel="noopener noreferrer">
                View site
              </Button>
            )}
            <Button
              type="button"
              color={published ? "gray" : "cyan"}
              disabled={pub.pending || dirty}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() => pub.run(() => publishSiteAction({ published: !published }))}
            >
              {published ? "Unpublish" : "Publish"}
            </Button>
          </div>
          {pub.error && <p role="alert" className="w-full text-sm text-red-600">{pub.error}</p>}
        </section>
      )}

      <section className={`${panelClasses} space-y-4 p-5`}>
        <h2 className="text-base font-semibold">Basics</h2>
        <label className="block text-sm">
          Web address
          <div className="mt-1 flex items-center gap-2">
            <span className="text-gray-500">{baseUrl.replace(/^https?:\/\//, "")}</span>
            <input
              className={`${fieldClasses} max-w-xs`}
              value={slug}
              onChange={(e) => touch(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              onBlur={() => slug !== site.slug && slugCheck.run(() => checkSlugAction(slug), undefined, "Available ✓")}
            />
          </div>
          {(slugCheck.error || slugCheck.notice) && (
            <span className={clsx("mt-1 block text-xs", slugCheck.error ? "text-red-600" : "text-emerald-700")}>
              {slugCheck.error || slugCheck.notice}
            </span>
          )}
          {site.exists && published && slug !== site.slug && (
            <span className="mt-1 block text-xs text-amber-700">Changing the address breaks links you&apos;ve already shared.</span>
          )}
        </label>
        <label className="block text-sm">
          Title
          <input className={`${fieldClasses} mt-1 max-w-md`} placeholder={data.partnerNames ?? "Priya & Sam"} value={title} onChange={(e) => touch(setTitle)(e.target.value)} />
        </label>
        <fieldset>
          <legend className="text-sm">Theme</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={theme === k}
                onClick={() => touch(setTheme)(k)}
                className={clsx("rounded-xl border p-2 text-xs", theme === k ? "border-cyan-500 ring-2 ring-cyan-200" : "border-gray-200")}
              >
                <span className="flex h-8 w-20 items-center justify-center rounded-lg" style={{ background: THEMES[k].bg, color: THEMES[k].ink, fontFamily: THEMES[k].font === "serif" ? "Georgia, serif" : "system-ui" }}>
                  <span style={{ color: THEMES[k].accent }}>Aa</span>
                </span>
                <span className="mt-1 block">{THEMES[k].name}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={indexable} onChange={(e) => touch(setIndexable)(e.target.checked)} />
          <span>
            Let search engines show my site
            <span className="block text-xs text-gray-500">Off by default. Password-protected sites are never shown in search.</span>
          </span>
        </label>
      </section>

      <section className={`${panelClasses} p-5`}>
        <h2 className="text-base font-semibold">Sections</h2>
        <p className="mt-1 text-sm text-gray-600">Turn sections on or off, change their order, and fill them in. Empty sections stay hidden.</p>
        <ul className="mt-3 divide-y divide-gray-100">
          {sections.map((s, i) => {
            const addon = ADDON_SECTIONS[s.type];
            const locked = addon && !data.owned.includes(addon);
            const editable = !["schedule", "gallery", "rsvp", "registry", "photos"].includes(s.type);
            return (
              <li key={s.type} className="py-2">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex flex-1 items-center gap-2">
                    <input type="checkbox" checked={s.enabled} disabled={!!locked} onChange={(e) => setSection(i, { ...s, enabled: e.target.checked } as Section)} />
                    <span className={clsx(locked && "text-gray-400")}>{SECTION_LABELS[s.type]}</span>
                    {locked && <a href={`/client/dashboard/add-ons/${addon}`} className="text-xs text-cyan-700 underline">Needs {ADDON_NAMES[addon!]}</a>}
                    {s.type === "schedule" && <span className="text-xs text-gray-500">From your events on Guest List ({data.events.length})</span>}
                    {s.type === "gallery" && <span className="text-xs text-gray-500">Uses your photos below</span>}
                  </label>
                  <button type="button" aria-label={`Move ${SECTION_LABELS[s.type]} up`} className="px-1 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" aria-label={`Move ${SECTION_LABELS[s.type]} down`} className="px-1 disabled:opacity-30" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>↓</button>
                  {editable && (
                    <button type="button" className="text-cyan-700 underline" onClick={() => setOpen(open === s.type ? null : s.type)}>
                      {open === s.type ? "Done" : "Edit"}
                    </button>
                  )}
                </div>
                {open === s.type && editable && (
                  <div className="mt-3">
                    <SectionFields section={s} onChange={(next) => setSection(i, next)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="sticky bottom-4 z-10 flex items-center gap-3">
        <Button
          type="button"
          color="cyan"
          disabled={save.pending || !dirty}
          onClick={() => save.run(() => saveSiteAction({ slug, title, theme, indexable, sections }), () => setDirty(false), "Saved.")}
        >
          {save.pending ? "Saving…" : site.exists ? "Save changes" : "Create my site"}
        </Button>
        {save.error && <p role="alert" className="text-sm text-red-600">{save.error}</p>}
        {!save.error && save.notice && !dirty && <p role="status" className="text-sm text-emerald-700">{save.notice}</p>}
      </div>

      {site.exists ? (
        <>
          <SitePhotos projectId={data.projectId} photos={site.photos} />
          <section className={`${panelClasses} space-y-3 p-5`}>
            <h2 className="text-base font-semibold">Password</h2>
            <p className="text-sm text-gray-600">
              {site.hasPassword ? "Guests need a password to see your site." : "Anyone with the link can see your site."}
            </p>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                pw.run(() => setSitePasswordAction({ password }), () => setPassword(""), "Password saved.");
              }}
            >
              <input type="text" aria-label="New password" autoComplete="off" className={`${fieldClasses} max-w-xs`} placeholder={site.hasPassword ? "New password" : "Choose a password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" variant="outline" color="gray" disabled={pw.pending || password.trim().length < 4}>
                {site.hasPassword ? "Change" : "Add password"}
              </Button>
              {site.hasPassword && (
                <button type="button" className="text-sm text-red-600 underline" disabled={pw.pending} onClick={() => pw.run(() => setSitePasswordAction({ password: null }), undefined, "Password removed.")}>
                  Remove password
                </button>
              )}
            </form>
            {(pw.error || pw.notice) && <p role={pw.error ? "alert" : "status"} className={clsx("text-sm", pw.error ? "text-red-600" : "text-emerald-700")}>{pw.error || pw.notice}</p>}
          </section>
        </>
      ) : (
        <p className="text-sm text-gray-500">Create your site to add photos and a password.</p>
      )}
    </div>
  );
}
