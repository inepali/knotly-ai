// src/app/api/chat/route.ts
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { chatModel } from "@/agent/models";
import { coupleSystemPrompt, vendorSystemPrompt } from "@/agent/prompts";
import { coupleTools } from "@/agent/tools/couple";
import { supabaseServer } from "@/lib/supabase/server";
import { vendorTools } from "@/agent/tools/vendor";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    returning,
  }: { messages: UIMessage[]; returning?: boolean } = await req.json();

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return new Response("No session", { status: 401 });
  // Supabase's own flag: it clears when a guest verifies an email/phone.
  // (profiles.is_guest can lag behind, so don't use it for this.)
  const isGuest = user.is_anonymous ?? false;

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isVendor = profile?.role === "vendor";
  const ctx = { sb, userId: user.id, isGuest };

  const result = streamText({
    model: chatModel,
    system: isVendor
      ? vendorSystemPrompt()
      : coupleSystemPrompt({
          isGuest,
          returning: isGuest && returning === true,
          userTurns: messages.filter((m) => m.role === "user").length,
        }),
    messages: await convertToModelMessages(messages),
    tools: isVendor ? vendorTools(ctx) : coupleTools(ctx), // different hands per role
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
