// Thank-You Tracker (add-on): gifts per household, who's been thanked, labels.
import { requireAddon } from "@/lib/addon-access";
import { loadThankYou } from "@/lib/actions/thank-you";
import ThankYouTracker from "@/components/thank-you/ThankYouTracker";

export default async function ThankYouPage() {
  const { sb, userId } = await requireAddon("thank_you");
  const r = await loadThankYou(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Thank-You Tracker</h1>
      <p className="mt-1 text-sm text-gray-600">Log every gift, tick off thank-you notes as you send them, and print address labels.</p>
      <ThankYouTracker data={r.data} />
    </div>
  );
}
