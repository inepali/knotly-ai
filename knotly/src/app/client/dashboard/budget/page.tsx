// Budget: targets per category, estimates as they arrive, bookings.
import { requireCouple } from "@/lib/couple-session";
import { loadBudget } from "@/lib/budget";
import BudgetEditor from "@/components/dashboard/BudgetEditor";

export default async function BudgetPage() {
  const { sb, userId } = await requireCouple();
  const budget = await loadBudget(sb, userId);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
      <p className="mt-1 text-sm text-gray-600">
        Set a target for each category, and mark a vendor as booked when you commit. Estimates from vendors show up on
        their category.
      </p>
      <BudgetEditor budget={budget} />
    </div>
  );
}
