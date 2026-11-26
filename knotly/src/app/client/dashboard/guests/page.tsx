// Guest List (free): households and guests, events they're invited to, CSV import/export, totals.
import Link from "next/link";
import { requireCouple } from "@/lib/couple-session";
import { loadGuestList } from "@/lib/actions/guests";
import { panelClasses } from "@/components/ui/fields";
import GuestList from "@/components/guests/GuestList";

export default async function GuestsPage() {
  const { sb, userId } = await requireCouple();
  const r = await loadGuestList(sb, userId);
  const data = r.ok ? r.data : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Guest List</h1>
      <p className="mt-1 text-sm text-gray-600">
        Free for every couple. Add households (one invitation each) and the people in them. Only you can see this list.
      </p>
      {!data?.project ? (
        <p className={`${panelClasses} mt-6 p-6 text-sm text-gray-600`}>
          Start with <Link href="/client/dashboard/my-wedding" className="text-cyan-700 underline">My Wedding</Link>, then come
          back to add guests.
        </p>
      ) : (
        <GuestList
          households={data.households}
          events={data.events}
          partnerNames={data.project.partner_names}
          guestCount={data.project.guest_count}
        />
      )}
    </div>
  );
}
