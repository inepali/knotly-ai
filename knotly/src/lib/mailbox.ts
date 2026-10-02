// src/lib/mailbox.ts — Inbox / Sent / Drafts for couples and vendors.
// All reads go through the signed-in user's client, so RLS decides what they see:
// couples see their threads (including drafts); vendors only see sent messages.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Side = "couple" | "vendor";
export type Folder = "inbox" | "sent" | "drafts";

const SIDE_OF: Record<string, Side | "system"> = {
  couple: "couple",
  couple_agent: "couple",
  vendor: "vendor",
  vendor_agent: "vendor",
  system: "system",
};

export type MailItem = {
  id: string;
  threadId: string;
  sender: string;
  status: "sent" | "pending_approval";
  subject: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
  counterpart: string; // the other party's display name
  folder: Folder;
  isNew: boolean; // received and not opened yet
};

type Row = {
  id: string;
  thread_id: string;
  sender: string;
  status: "sent" | "pending_approval";
  subject: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  threads: {
    vendor_id: string;
    vendors: { business_name: string } | null;
    couple_projects: { partner_names: string | null } | null;
  } | null;
};

const SELECT =
  "id, thread_id, sender, status, subject, body, created_at, read_at, threads(vendor_id, vendors(business_name), couple_projects(partner_names))";

export async function getViewer(sb: SupabaseClient) {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return null;
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  // Admins use the couple view for now; they have no conversations of their own.
  const side: Side = profile?.role === "vendor" ? "vendor" : "couple";
  return { id: user.id, side, email: user.email ?? user.phone ?? "" };
}

function toItem(r: Row, side: Side): MailItem {
  const from = SIDE_OF[r.sender] ?? "system";
  const mine = from === side;
  const folder: Folder = r.status === "pending_approval" ? "drafts" : mine ? "sent" : "inbox";
  return {
    id: r.id,
    threadId: r.thread_id,
    sender: r.sender,
    status: r.status,
    subject: r.subject,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
    counterpart:
      side === "couple"
        ? (r.threads?.vendors?.business_name ?? "Vendor")
        : (r.threads?.couple_projects?.partner_names ?? "A couple"),
    folder,
    isNew: folder === "inbox" && !r.read_at,
  };
}

export async function loadMailbox(sb: SupabaseClient, side: Side) {
  const { data, error } = await sb
    .from("messages")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data as unknown as Row[]).map((r) => toItem(r, side));
}

export async function loadThread(sb: SupabaseClient, side: Side, threadId: string) {
  const { data, error } = await sb
    .from("messages")
    .select(SELECT)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as unknown as Row[]).map((r) => toItem(r, side));
}

export function isMine(sender: string, side: Side) {
  return SIDE_OF[sender] === side;
}
