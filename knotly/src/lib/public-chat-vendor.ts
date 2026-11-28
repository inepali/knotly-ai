// src/lib/public-chat-vendor.ts — the vendor behind a public-page chat: public, and chat switched on.
import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isPublicVendor } from "@/lib/public-listing";

export type ChatVendor = {
  id: string;
  businessName: string;
  category: string;
  agentName: string | null;
  notes: string | null;
  email: string | null;
};

type Settings = { agent_display_name: string | null; public_chat_enabled: boolean | null; agent_custom_instructions: string | null };

export async function loadChatVendor(vendorId: string): Promise<ChatVendor | null> {
  if (!z.uuid().safeParse(vendorId).success) return null;
  const { data } = await supabaseAdmin
    .from("vendors")
    .select(
      "id, business_name, category, published, profiles(email), vendor_agent_settings(agent_display_name, public_chat_enabled, agent_custom_instructions)"
    )
    .eq("id", vendorId)
    .maybeSingle();
  if (!data || !isPublicVendor(data)) return null;
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;
  const s = one(data.vendor_agent_settings as Settings | Settings[] | null);
  if (s?.public_chat_enabled === false) return null;
  return {
    id: data.id,
    businessName: data.business_name,
    category: data.category,
    agentName: s?.agent_display_name?.trim() || null,
    notes: s?.agent_custom_instructions ?? null,
    email: one(data.profiles as { email: string | null } | { email: string | null }[] | null)?.email ?? null,
  };
}
