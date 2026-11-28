// src/lib/public-chat.ts — "Talk to {agent name}" on a vendor's public page: the pieces shared by
// the browser and the server (names, validation, limits). No database or secrets here.
// Spec: vendor-public-agent-chat-spec.md (Knotly project docs).
import { z } from "zod";

/** Messages a visitor can send in one chat per day, and per network address across all vendors. */
export const PUBLIC_CHAT_SESSION_LIMIT = 15;
export const PUBLIC_CHAT_IP_LIMIT = 40;
/** Messages a day for one vendor before the popup goes straight to the contact card. */
export const PUBLIC_CHAT_VENDOR_LIMIT = 300;
/** Contact-card submits per network address per vendor per day. */
export const LEAD_SUBMIT_LIMIT = 3;
/** Vendors one network address can send leads to in a day before its leads are flagged. */
export const LEAD_IP_VENDOR_LIMIT = 5;
/** Tool steps per answer: look something up, maybe offer the card, then reply. */
export const PUBLIC_CHAT_MAX_STEPS = 3;
/** The visitor's contact card appears after this many of their messages. */
export const CARD_AFTER_MESSAGES = 2;
/** How long the claim cookie (and so the chat on this device) lasts. */
export const CLAIM_DAYS = 7;

export const AGENT_NAME_MIN = 2;
export const AGENT_NAME_MAX = 30;

const RESERVED = ["knotly", "admin", "administrator", "support", "help", "staff", "moderator", "system", "owner"];

/** The vendor's assistant name: letters, spaces, apostrophes and hyphens; empty clears it. */
export const AgentName = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .min(AGENT_NAME_MIN, `Use at least ${AGENT_NAME_MIN} letters.`)
        .max(AGENT_NAME_MAX, `Keep it under ${AGENT_NAME_MAX} characters.`)
        .regex(/^[A-Za-z][A-Za-z' -]*$/, "Use letters, spaces, apostrophes and hyphens only.")
        .refine((s) => !RESERVED.some((w) => s.toLowerCase().split(/[\s'-]+/).includes(w)), "Pick a different name. That one is reserved."),
    ])
  );

/** "Talk to Maya", or "Chat with Big Day Story" when the vendor hasn't named their assistant. */
export function talkLabel(agentName: string | null | undefined, businessName: string) {
  return agentName?.trim() ? `Talk to ${agentName.trim()}` : `Chat with ${businessName}`;
}

/** "Maya · AI assistant for Big Day Story", used in the popup, Messages and emails. */
export function agentLabel(agentName: string | null | undefined, businessName: string) {
  return agentName?.trim() ? `${agentName.trim()} · AI assistant for ${businessName}` : `AI assistant for ${businessName}`;
}

/** The static first message (no model call). */
export function greeting(agentName: string | null | undefined, businessName: string) {
  const who = agentName?.trim() ? `I'm ${agentName.trim()}, ${businessName}'s assistant` : `I'm ${businessName}'s assistant`;
  return `Hi! ${who}. Ask me about packages, availability or anything else. What's your wedding date?`;
}

export const QUICK_REPLIES = ["See packages", "Check my date", "Get a quote"] as const;

export function consentText(businessName: string) {
  return `By sending, you agree ${businessName} may contact you by email or phone about your wedding. Message and data rates may apply.`;
}

/** Cookie holding `{sessionId}.{token}` for one vendor's chat on this device. */
export const chatCookieName = (vendorId: string) => `knotly_chat_${vendorId.replace(/-/g, "")}`;
export const CHAT_COOKIE_PREFIX = "knotly_chat_";

export function parseChatCookie(value: string | undefined): { sessionId: string; token: string } | null {
  if (!value) return null;
  const [sessionId, token] = value.split(".");
  if (!sessionId || !token || !z.uuid().safeParse(sessionId).success || !/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  return { sessionId, token };
}

// A short list of throwaway-inbox domains. Leads cost vendors money, so these are refused.
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
]);
export const isDisposableEmail = (email: string) => DISPOSABLE.has(email.split("@")[1]?.toLowerCase() ?? "");

/** US-first phone check: 10 digits (optionally +1), or an international +number. Returns E.164 or null. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits.startsWith("+1") && digits.length !== 12 ? null : digits;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10 && /^[2-9]/.test(d)) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1") && /^[2-9]/.test(d.slice(1))) return `+${d}`;
  return null;
}

export const LeadInput = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80, "That name is too long."),
  email: z
    .string()
    .trim()
    .max(254, "That email is too long.")
    .pipe(z.email("Please enter a valid email."))
    .refine((e) => !isDisposableEmail(e), "Please use an email you check regularly."),
  phone: z
    .string()
    .trim()
    .max(25)
    .optional()
    .transform((p, ctx) => {
      if (!p) return null;
      const e164 = toE164(p);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Please enter a valid phone number, or leave it blank." });
        return z.NEVER;
      }
      return e164;
    }),
  weddingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  need: z.string().trim().min(10, "Tell them a little more (at least 10 characters).").max(1000, "Keep it under 1,000 characters."),
  wantsMoreEstimates: z.boolean().default(false),
  /** Honeypot: people never see or fill this. */
  website: z.string().max(200).optional(),
});
export type LeadInput = z.input<typeof LeadInput>;

/** Prefill for "What do you need?": the visitor's own messages, newest last, clipped. */
export function needFromChat(visitorMessages: string[], max = 600): string {
  const text = visitorMessages
    .map((m) => m.trim())
    .filter((m) => m && !(QUICK_REPLIES as readonly string[]).includes(m))
    .join(" ")
    .replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Only our own vendor pages are allowed as the place to return to after signup. */
export function safeReturnPath(p: string | null | undefined): string | null {
  if (!p || !/^\/wedding-vendors\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(p)) return null;
  return p;
}
