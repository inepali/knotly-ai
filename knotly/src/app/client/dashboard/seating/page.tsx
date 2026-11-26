// Seating Chart (add-on): tables, drag guests to seats, warnings, print.
import { requireAddon } from "@/lib/addon-access";
import { loadSeating } from "@/lib/actions/seating";
import SeatingBoard from "@/components/seating/SeatingBoard";

export default async function SeatingPage() {
  const { sb, userId } = await requireAddon("seating");
  const r = await loadSeating(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Seating Chart</h1>
      <p className="mt-1 text-sm text-gray-600">
        {r.data.usesRsvp
          ? "Shows guests who RSVP'd yes (and households that haven't answered yet), with the plus-ones they named."
          : "Shows everyone on your Guest List, with a seat for each allowed plus-one. Add RSVP to seat only people who are coming."}
      </p>
      <SeatingBoard data={r.data} />
    </div>
  );
}
