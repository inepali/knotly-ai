// src/lib/public-chat-session.ts — server side of the public-page chat: the visitor's session
// (an httpOnly cookie holding `{sessionId}.{token}`; only the token's hash is stored) and claiming
// chats into an account after sign-up or sign-in on the same device.
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { CHAT_COOKIE_PREFIX, CLAIM_DAYS, chatCookieName, parseChatCookie } from "@/lib/public-chat";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashIp = (forwardedFor: string | null) =>
  createHash("sha256")
    .update((forwardedFor?.split(",")[0] ?? "").trim() || "unknown")
    .digest("hex")
    .slice(0, 32);

function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type ChatSession = { id: string; vendorId: string; coupleUserId: string | null; threadId: string | null };

/**
 * The visitor's chat with this vendor, if the cookie proves it's theirs. A signed-in couple also
 * owns chats linked to their account. Null when there is none (or it expired).
 */
export async function findChatSession(vendorId: string, userId: string | null): Promise<ChatSession | null> {
  const parsed = parseChatCookie((await cookies()).get(chatCookieName(vendorId))?.value);
  if (parsed) {
    const { data } = await supabaseAdmin
      .from("vendor_chat_sessions")
      .select("id, vendor_id, couple_user_id, thread_id, claim_token_hash, claim_expires_at")
      .eq("id", parsed.sessionId)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    const owned =
      data &&
      ((data.couple_user_id && data.couple_user_id === userId) ||
        (data.claim_token_hash &&
          new Date(data.claim_expires_at) > new Date() &&
          sameHash(data.claim_token_hash, hashToken(parsed.token))));
    if (owned) return { id: data.id, vendorId, coupleUserId: data.couple_user_id, threadId: data.thread_id };
  }
  if (userId) {
    const { data } = await supabaseAdmin
      .from("vendor_chat_sessions")
      .select("id, couple_user_id, thread_id")
      .eq("vendor_id", vendorId)
      .eq("couple_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { id: data.id, vendorId, coupleUserId: data.couple_user_id, threadId: data.thread_id };
  }
  return null;
}

/** Start a chat and hand the visitor its cookie. Signed-in couples own it straight away. */
export async function createChatSession(
  vendorId: string,
  opts: { userId: string | null; forwardedFor: string | null; userAgent: string | null }
): Promise<ChatSession | null> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + CLAIM_DAYS * 86_400_000);
  const { data, error } = await supabaseAdmin
    .from("vendor_chat_sessions")
    .insert({
      vendor_id: vendorId,
      couple_user_id: opts.userId,
      claim_token_hash: hashToken(token),
      claim_expires_at: expires.toISOString(),
      ip_hash: hashIp(opts.forwardedFor),
      user_agent: opts.userAgent?.slice(0, 300) ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[public-chat] session", error?.message);
    return null;
  }
  (await cookies()).set(chatCookieName(vendorId), `${data.id}.${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return { id: data.id, vendorId, coupleUserId: opts.userId, threadId: null };
}

/**
 * After a couple signs up or signs in: move every chat this device holds (and that's still
 * claimable) into their Messages. Never throws; sign-in must not fail because of a chat.
 */
export async function claimChatsFromCookies(userId: string): Promise<number> {
  try {
    const jar = await cookies();
    const candidates = jar
      .getAll()
      .filter((c) => c.name.startsWith(CHAT_COOKIE_PREFIX))
      .map((c) => ({ name: c.name, parsed: parseChatCookie(c.value) }))
      .filter((c): c is { name: string; parsed: { sessionId: string; token: string } } => !!c.parsed)
      .slice(0, 20);
    let n = 0;
    for (const c of candidates) {
      const { data } = await supabaseAdmin
        .from("vendor_chat_sessions")
        .select("id, couple_user_id, claim_token_hash, claim_expires_at")
        .eq("id", c.parsed.sessionId)
        .maybeSingle();
      if (!data || (data.couple_user_id && data.couple_user_id !== userId)) continue;
      const valid =
        data.couple_user_id === userId ||
        (data.claim_token_hash && new Date(data.claim_expires_at) > new Date() && sameHash(data.claim_token_hash, hashToken(c.parsed.token)));
      if (!valid) continue;
      const { data: thread, error } = await supabaseAdmin.rpc("claim_vendor_chat", { p_session: data.id, p_user: userId });
      if (error) console.error("[public-chat] claim", data.id, error.message);
      else if (thread) n++;
    }
    return n;
  } catch (err) {
    console.error("[public-chat] claim", err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Who is chatting, for ownership: a signed-in couple's id, otherwise null. Vendors and admins
 * (for example a vendor trying their own page) chat as anonymous visitors, so their chats are
 * never linked to their account or moved into a couple's Messages.
 */
export async function chatViewerId(): Promise<string | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return null;
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "couple" ? user.id : null;
}
