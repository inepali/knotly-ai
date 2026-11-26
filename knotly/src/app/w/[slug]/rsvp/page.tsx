// /w/[slug]/rsvp — guests find their invitation (personal link or name search) and RSVP.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPublicSite } from "@/lib/public-site";
import { isUnlocked, unlockCookieName } from "@/lib/site-password";
import { loadRsvpData } from "@/lib/rsvp-data";
import { householdEvents, isClosed } from "@/lib/rsvp";
import { themeStyle } from "@/components/website/theme";
import SitePasswordGate from "@/components/website/SitePasswordGate";
import RsvpFinder from "@/components/rsvp/RsvpFinder";
import RsvpForm from "@/components/rsvp/RsvpForm";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

export const metadata: Metadata = { title: "RSVP", robots: { index: false, follow: false } };

export default async function RsvpPage({ params, searchParams }: Props) {
  const [{ slug }, { t }] = await Promise.all([params, searchParams]);
  const site = await loadPublicSite(slug);
  if (!site || !site.owned.includes("rsvp") || site.archived) notFound();
  const cookie = (await cookies()).get(unlockCookieName(site.slug))?.value;
  if (!isUnlocked(site.slug, site.passwordHash, cookie)) {
    return <SitePasswordGate slug={site.slug} title={site.title} theme={site.theme} />;
  }

  const data = await loadRsvpData(supabaseAdmin, site.projectId);
  const household = t ? data.households.find((h) => h.invite_token === t) : undefined;
  const closed = isClosed(data.settings.deadline);
  const deadline = data.settings.deadline
    ? new Date(`${data.settings.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <main style={themeStyle(site.theme)} className="min-h-dvh px-6 py-12">
      <div className="mx-auto max-w-xl">
        <Link href={`/w/${site.slug}`} className="text-sm underline opacity-80">← {site.title}</Link>
        <h1 className="mt-6 text-center text-4xl">RSVP</h1>
        {deadline && <p className="mt-2 text-center opacity-80">{closed ? `RSVPs closed on ${deadline}.` : `Please reply by ${deadline}.`}</p>}

        {closed ? (
          <p className="mt-10 text-center">Need to change something? Please contact the couple directly.</p>
        ) : household ? (
          <RsvpForm
            slug={site.slug}
            token={household.invite_token}
            household={{ label: household.label, plus_ones: household.plus_ones, guests: household.guests }}
            events={householdEvents(household, data.events)}
            settings={data.settings}
            responses={data.responses.filter((r) => household.guests.some((g) => g.id === r.guest_id))}
            answers={data.answers.get(household.id) ?? null}
          />
        ) : (
          <RsvpFinder slug={site.slug} requireCode={data.settings.require_code} invalidLink={!!t} />
        )}
      </div>
    </main>
  );
}
