// src/components/website/WeddingSite.tsx — the public wedding website (server-rendered).
// Also used for the editor's preview link; everything shown comes from PublicSite only.
import type { PublicSite } from "@/lib/public-site";
import {
  SECTION_LABELS,
  formatWeddingDate,
  mapUrl,
  safeUrl,
  sitePhotoUrl,
  visibleSections,
  type Section,
} from "@/lib/wedding-site";
import { themeStyle } from "./theme";

// Knotly's launch metros are all on Eastern time; store a per-wedding zone when that changes.
const TZ = "America/New_York";
const PENDING = new Set<Section["type"]>(["rsvp", "registry", "photos"]);
const time = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-center text-2xl tracking-wide sm:text-3xl" style={{ color: "var(--ws-accent)" }}>{children}</h2>;
}

function Block({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-2xl scroll-mt-16 px-6 py-14">
      {children}
    </section>
  );
}

export default function WeddingSite({ site }: { site: PublicSite }) {
  const date = formatWeddingDate(site.weddingDate);
  const cover = site.photos[0];

  if (site.archived) {
    return (
      <main style={themeStyle(site.theme)} className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl">{site.title}</h1>
        {date && <p className="mt-3 opacity-80">{date}</p>}
        <p className="mt-8 max-w-md text-lg">Thank you for celebrating with us.</p>
      </main>
    );
  }

  const sections = visibleSections(site.sections, {
    owned: site.owned,
    hasEvents: site.events.length > 0,
    hasPhotos: site.photos.length > 1 || (site.photos.length === 1 && !site.sections.find((s) => s.type === "hero")?.enabled),
  });
  // RSVP, Registry and Photo Sharing render nothing until their own add-on pages ship.
  const shown = sections.filter((s) => !PENDING.has(s.type));
  const nav = shown.filter((s) => s.type !== "hero");

  return (
    <main style={themeStyle(site.theme)} className="min-h-dvh">
      {nav.length > 1 && (
        <nav aria-label="Sections" className="sticky top-0 z-10 flex justify-center gap-4 overflow-x-auto px-4 py-3 text-sm backdrop-blur" style={{ background: "color-mix(in srgb, var(--ws-bg) 85%, transparent)" }}>
          {nav.map((s) => (
            <a key={s.type} href={`#${s.type}`} className="whitespace-nowrap opacity-80 hover:opacity-100">
              {SECTION_LABELS[s.type]}
            </a>
          ))}
        </nav>
      )}
      {shown.map((s) => (
        <SectionView key={s.type} s={s} site={site} date={date} cover={cover} />
      ))}
      <footer className="px-6 py-10 text-center text-xs opacity-60">
        Made with <a href="/" className="underline">Knotly</a>
      </footer>
    </main>
  );
}

function SectionView({ s, site, date, cover }: { s: Section; site: PublicSite; date: string; cover?: PublicSite["photos"][number] }) {
  switch (s.type) {
    case "hero":
      return (
        <header id="hero" className="px-6 pt-16 pb-10 text-center">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- public CDN image with known size
            <img
              src={sitePhotoUrl(cover.path)}
              alt={cover.caption || site.title}
              width={cover.width}
              height={cover.height}
              fetchPriority="high"
              className="mx-auto mb-10 max-h-[70vh] w-full max-w-3xl rounded-2xl object-cover"
            />
          )}
          <h1 className="text-4xl sm:text-6xl">{site.title}</h1>
          {s.subtitle && <p className="mt-4 text-lg opacity-80">{s.subtitle}</p>}
          {(date || site.place) && <p className="mt-6 text-sm tracking-widest uppercase">{[date, site.place].filter(Boolean).join(" · ")}</p>}
        </header>
      );
    case "story":
      return (
        <Block id="story">
          <Heading>{SECTION_LABELS.story}</Heading>
          <p className="mt-6 text-lg leading-relaxed whitespace-pre-line">{s.text}</p>
        </Block>
      );
    case "schedule":
      return (
        <Block id="schedule">
          <Heading>{SECTION_LABELS.schedule}</Heading>
          <ol className="mt-6 space-y-6">
            {site.events.map((e) => {
              const where = [e.venue, e.address].filter(Boolean).join(", ");
              return (
                <li key={e.id} className="rounded-2xl p-5 text-center" style={{ background: "var(--ws-soft)" }}>
                  <p className="text-xl">{e.name}</p>
                  {e.starts_at && <p className="mt-1 opacity-80">{time(e.starts_at)}</p>}
                  {where && (
                    <a className="mt-1 block underline" href={mapUrl(where)} target="_blank" rel="noopener noreferrer">
                      {where}
                    </a>
                  )}
                  {e.notes && <p className="mt-2 text-sm whitespace-pre-line opacity-80">{e.notes}</p>}
                </li>
              );
            })}
          </ol>
        </Block>
      );
    case "travel":
      return (
        <Block id="travel">
          <Heading>{SECTION_LABELS.travel}</Heading>
          <ul className="mt-6 space-y-4">
            {s.items.map((t, i) => {
              const href = safeUrl(t.url);
              return (
                <li key={i} className="rounded-2xl p-5" style={{ background: "var(--ws-soft)" }}>
                  <p className="text-lg">{t.title}</p>
                  {t.details && <p className="mt-1 text-sm whitespace-pre-line opacity-80">{t.details}</p>}
                  {href && (
                    <a className="mt-2 inline-block text-sm underline" href={href} target="_blank" rel="noopener noreferrer nofollow">
                      Details & booking
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Block>
      );
    case "party":
      return (
        <Block id="party">
          <Heading>{SECTION_LABELS.party}</Heading>
          <ul className="mt-6 grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
            {s.members.map((m, i) => (
              <li key={i}>
                <p className="text-lg">{m.name}</p>
                {m.role && <p className="text-sm opacity-70">{m.role}</p>}
              </li>
            ))}
          </ul>
        </Block>
      );
    case "faq":
      return (
        <Block id="faq">
          <Heading>{SECTION_LABELS.faq}</Heading>
          <dl className="mt-6 space-y-5">
            {s.items.map((f, i) => (
              <div key={i}>
                <dt className="text-lg">{f.q}</dt>
                <dd className="mt-1 whitespace-pre-line opacity-80">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Block>
      );
    case "gallery": {
      const hero = site.sections.find((x) => x.type === "hero")?.enabled;
      const photos = hero ? site.photos.slice(1) : site.photos;
      return (
        <Block id="gallery">
          <Heading>{SECTION_LABELS.gallery}</Heading>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.path}>
                {/* eslint-disable-next-line @next/next/no-img-element -- public CDN image */}
                <img src={sitePhotoUrl(p.path)} alt={p.caption || `${site.title} photo`} loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" />
              </li>
            ))}
          </ul>
        </Block>
      );
    }
    case "rsvp":
    case "registry":
    case "photos":
      // Filled in by the RSVP, Registry and Photo Sharing add-ons.
      return null;
  }
}
