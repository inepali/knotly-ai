// src/lib/wallet-view.ts — what the vendor's Account page shows for wallet data (pure, testable).
import { usd } from "@/lib/actions/wallet";

export type WalletSummary = {
  balance_cents: number;
  held_cents: number;
  available_cents: number;
  lead_fee_cents: number;
  reload_below_cents: number;
  reload_step_cents: number;
  reload_max_steps: number;
  can_reload: boolean;
  plan: string;
  sms_free_monthly: number;
  sms_used_this_month: number;
  sms_spent_this_month_cents: number;
};

export type ActivityRow = {
  id: number;
  kind: string;
  amount_cents: number;
  created_at: string;
  note: string | null;
  quote_id: string | null;
  thread_id: string | null;
  couple_first_name: string | null;
  wedding_month: string | null;
  has_receipt: boolean;
  total_count: number;
};

export const ACTIVITY_FILTERS = [
  { key: "", label: "All" },
  { key: "leads", label: "Leads" },
  { key: "reloads", label: "Reloads" },
  { key: "credits", label: "Credits" },
  { key: "sms", label: "Texts" },
] as const;
export const ACTIVITY_PAGE_SIZE = 25;

export const filterKey = (k: string | undefined) => (ACTIVITY_FILTERS.some((f) => f.key === k) ? (k as string) : "");
export const pageNumber = (p: string | undefined) => Math.max(1, Math.min(1000, Number.parseInt(p ?? "1", 10) || 1));

/** "≈ 9 leads" from what's available. */
export const leadsLeft = (s: Pick<WalletSummary, "available_cents" | "lead_fee_cents">) =>
  s.lead_fee_cents > 0 ? Math.max(0, Math.floor(s.available_cents / s.lead_fee_cents)) : 0;

/** "+$20.00" / "−$1.00" */
export const signedUsd = (cents: number) => `${cents < 0 ? "−" : "+"}$${(Math.abs(cents) / 100).toFixed(2)}`;

export function activityLabel(r: Pick<ActivityRow, "kind" | "note" | "couple_first_name" | "wedding_month">): string {
  switch (r.kind) {
    case "estimate_view": {
      const who = [r.couple_first_name, r.wedding_month].filter(Boolean).join(" · ");
      return who ? `Lead: ${who}` : "Lead: a couple opened your estimate";
    }
    case "topup":
      return "Reload";
    case "refund":
      return "Reload refunded";
    case "promo":
      return r.note === "signup" ? "Signup credit" : "Promo credit";
    case "lead_credit":
      return "Spam lead credited back";
    case "adjust":
      return r.note ? `Adjustment: ${r.note}` : "Adjustment";
    case "sms":
      return "Text message (over the monthly free texts)";
    default:
      return r.kind;
  }
}

/** The reload choices the vendor can pick: $20, $40, … up to the max. */
export const reloadChoices = (s: Pick<WalletSummary, "reload_step_cents" | "reload_max_steps">) =>
  Array.from({ length: s.reload_max_steps }, (_, i) => ({ steps: i + 1, label: usd((i + 1) * s.reload_step_cents) }));

/** Low-balance dot on the Account nav item (Pay as you go only). */
export const needsReload = (s: Pick<WalletSummary, "plan" | "available_cents" | "reload_below_cents"> | null | undefined) =>
  !!s && s.plan === "payg" && s.available_cents < s.reload_below_cents;
