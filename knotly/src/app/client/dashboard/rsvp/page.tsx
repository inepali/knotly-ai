// RSVP (add-on): settings, live counts, who's answered, reminders, export.
import { requireAddon } from "@/lib/addon-access";
import { loadRsvpDashboard } from "@/lib/actions/rsvp";
import { siteUrl } from "@/lib/site";
import RsvpDashboard from "@/components/rsvp/RsvpDashboard";

export default async function RsvpPage() {
  const { sb, userId } = await requireAddon("rsvp");
  const r = await loadRsvpDashboard(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  const d = r.data;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">RSVP</h1>
      <p className="mt-1 text-sm text-gray-600">Guests reply on your website. Each household has its own link, so they never see anyone else.</p>
      <RsvpDashboard
        baseUrl={siteUrl()}
        site={d.site}
        settings={d.settings}
        events={d.events}
        households={d.households}
        responses={d.responses}
        answers={Object.fromEntries(d.answers)}
        summary={{ ...d.summary, waiting: d.summary.waiting.map((h) => h.id) }}
      />
    </div>
  );
}
