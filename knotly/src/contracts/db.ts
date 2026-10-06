// src/contracts/db.ts — database shapes shared by the db, ai and ui agents.
// CONTRACT_VERSION: 1 (2026-10-05) — Phase 0 schema (bookings, agent, billing, organize, guests).
// Owned by the db agent. Row types come from the generated src/lib/supabase/types.ts
// (`pnpm types`); the enums below mirror the table check constraints.
import type { Database } from "@/lib/supabase/types";

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Insert<T extends keyof Tables> = Tables[T]["Insert"];
export type Update<T extends keyof Tables> = Tables[T]["Update"];

// bookings.status
export const BOOKING_STATUSES = [
  "requested",
  "needs_vendor",
  "held",
  "declined",
  "expired",
  "contract_sent",
  "signed",
  "booked",
  "completed",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
// Statuses that count as "open" for the one_open_booking index (one per couple + vendor).
export const CLOSED_BOOKING_STATUSES = ["declined", "expired", "cancelled", "completed"] as const;

// needs.status
export const NEED_STATUSES = ["not_started", "requested", "offer_received", "booked"] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

// contracts.status
export const CONTRACT_STATUSES = ["sent", "signed", "countersigned", "void"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

// activity_events.actor (type is free text; event names live in src/contracts/events.ts, ai agent).
// Set couple_visible = true only for couple-facing types; couples read nothing else.
export const ACTIVITY_ACTORS = ["agent", "vendor", "couple", "system"] as const;
export type ActivityActor = (typeof ACTIVITY_ACTORS)[number];

// outbox
export const CHANNELS = ["email", "sms"] as const;
export type Channel = (typeof CHANNELS)[number];
export const OUTBOX_STATUSES = ["queued", "sent", "failed", "cancelled"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

// message_templates.event values seeded as Knotly defaults (vendor_id null). A vendor row with
// the same (event, channel) overrides the default.
export const DEFAULT_TEMPLATE_EVENTS = [
  "hold_confirmed",
  "date_unavailable",
  "hold_expiring",
  "followup_1",
  "followup_2",
  "call_offer",
  "call_booked",
  "call_reminder",
  "contract_sent",
  "contract_countersigned",
  "booking_welcome",
  "booking_declined",
  "booking_expired",
  "final_details",
  "review_request",
] as const;
export type TemplateEvent = (typeof DEFAULT_TEMPLATE_EVENTS)[number];

// Billing
export const PLANS = ["basic", "pro", "payg"] as const;
export type Plan = (typeof PLANS)[number];
export const USAGE_KINDS = ["estimate_view", "sms"] as const; // vendor_usage.ref_id is text: quote uuid or outbox id
export const WALLET_KINDS = ["topup", "estimate_view", "sms", "refund", "adjust"] as const;

// budget_items.source; `estimated` and the legacy `planned` are kept in sync by a trigger.
export const BUDGET_SOURCES = ["manual", "default", "booking"] as const;
export type BudgetSource = (typeof BUDGET_SOURCES)[number];

// Organize / guests
export const CHECKLIST_STATUSES = ["open", "done", "hidden"] as const;
export const TIMELINE_VISIBILITY = ["everyone", "party", "couple"] as const;
export const DOCUMENT_TAGS = ["contract", "invoice", "venue", "inspiration", "other"] as const;
export const RSVP_STATUSES = ["awaiting", "attending", "declined"] as const;
export const REGISTRY_KINDS = ["store", "cash_fund"] as const;
export const HELP_DAILY_LIMIT = 30; // enforced in take_help_message()

// Storage buckets and path conventions (first folder is checked by policies).
export const BUCKETS = {
  documents: "documents", //       <project_id>/<file>, private; vendors via server signed URL
  contracts: "contracts", //       <booking_id>/<file>, private; server only
  vendorPhotos: "vendor-photos", // <vendor_id>/<file>, public read
  websiteCovers: "website-covers", // <project_id>/<file>, public read
} as const;
