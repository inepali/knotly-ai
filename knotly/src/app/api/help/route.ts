// src/app/api/help/route.ts — the Help chat. Read-only: it answers questions and never changes data.
//   platform help  (signed in)       "How do I…?" answered from a short static help doc
//   vendor help    (body.vendorId)   one vendor's questions, answered only from that vendor's knowledge base
// Guardrails: cheaper model, cached system prompt, 2 tool steps, last 10 messages, 1,000-character
// questions, and a daily message cap per person (lower for visitors who aren't signed in).
import { convertToModelMessages, stepCountIs, streamText, tool, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { helpModel } from "@/agent/models";
import {
  HELP_MAX_STEPS,
  platformHelpPrompt,
  prepareHelpMessages,
  vendorHelpPrompt,
} from "@/agent/help";
import { supabaseServer } from "@/lib/supabase/server";
import { helpSubject, takeHelpQuota } from "@/lib/help-limit";
import { askVendorKnowledge } from "@/lib/actions/knowledge";
import { flat } from "@/lib/actions/result";

export const maxDuration = 30;

const Body = z.object({ messages: z.unknown(), vendorId: z.uuid().optional() });

const text = (message: string, status: number) => new Response(message, { status });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return text("Ask a question first.", 400);
  const { vendorId } = body.data;

  const prepared = prepareHelpMessages(body.data.messages);
  if (!prepared.ok) return text(prepared.error, 400);

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const signedIn = !!user && !user.is_anonymous;

  // Platform help is for people with an account; vendor help is also open to visitors (on a lower cap).
  if (!vendorId && !signedIn) return text("Sign in to use Help.", 401);

  const { subject, limit } = helpSubject(signedIn ? user!.id : null, req.headers.get("x-forwarded-for"));
  if (!(await takeHelpQuota(subject, limit)))
    return text("You've reached today's Help limit. Please try again tomorrow, or message the vendor directly.", 429);

  let system: string;
  let tools: ToolSet = {};

  if (vendorId) {
    // RLS decides whether this person can see the vendor at all.
    const { data: vendor } = await sb.from("vendors").select("business_name").eq("id", vendorId).maybeSingle();
    if (!vendor) return text("Vendor not found.", 404);
    const { data: thread } = signedIn
      ? await sb.from("threads").select("id").eq("vendor_id", vendorId).limit(1).maybeSingle()
      : { data: null };
    system = vendorHelpPrompt({ vendorName: vendor.business_name, threadId: thread?.id });
    // The vendor is fixed here, not chosen by the model, so it can't be pointed at anyone else's knowledge.
    tools = {
      searchKnowledge: tool({
        description: `Search ${vendor.business_name}'s own information (website, FAQs, brochures) for the answer to the couple's question.`,
        inputSchema: z.object({ question: z.string().max(500).describe("The couple's question, in their words") }),
        execute: async ({ question }) => flat(await askVendorKnowledge(sb, user?.id ?? "", { vendorId, question })),
      }),
    };
  } else {
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user!.id).single();
    system = platformHelpPrompt(profile?.role === "vendor" ? "vendor" : "couple");
  }

  const result = streamText({
    model: helpModel,
    // The system prompt is identical for every request of its kind, so the provider can cache it.
    system: { role: "system", content: system, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
    messages: await convertToModelMessages(prepared.messages as UIMessage[]),
    tools,
    stopWhen: stepCountIs(HELP_MAX_STEPS),
    maxOutputTokens: 600,
  });
  return result.toUIMessageStreamResponse();
}
