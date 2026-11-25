// src/lib/help-limit.ts — the daily message cap on the Help chat.
import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { HELP_DAILY_LIMIT, HELP_DAILY_LIMIT_LOGGED_OUT } from "@/agent/help";

/** Who the cap counts: the signed-in person, or a hash of the network address (never stored raw). */
export function helpSubject(userId: string | null, forwardedFor: string | null) {
  if (userId) return { subject: `u:${userId}`, limit: HELP_DAILY_LIMIT };
  const ip = (forwardedFor?.split(",")[0] ?? "").trim() || "unknown";
  return {
    subject: `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`,
    limit: HELP_DAILY_LIMIT_LOGGED_OUT,
  };
}

/** Count one message. False when today's cap is reached (or the counter is unavailable: fail closed). */
export async function takeHelpQuota(subject: string, limit: number) {
  const { data, error } = await supabaseAdmin.rpc("take_help_quota", { p_subject: subject, p_limit: limit });
  if (error) {
    console.error("[help] quota", error.message);
    return false;
  }
  return data === true;
}
