// src/app/api/public-chat/[vendorId]/route.ts — "Talk to {agent name}" on a vendor's public page.
//   GET   the visitor's chat so far (starts one, and sets its cookie, if there's none)
//   POST  one question → a streamed answer from the help model, read-only tools only
// The vendor is fixed by the URL, never chosen by the model. Visitors are counted per chat, per
// network address and per vendor. Spec: vendor-public-agent-chat-spec.md.
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { helpModel } from "@/agent/models";
import { prepareHelpMessages } from "@/agent/help";
import { publicChatPrompt } from "@/agent/public-chat";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { takeHelpQuota } from "@/lib/help-limit";
import { searchKnowledge } from "@/lib/knowledge";
import { loadChatVendor } from "@/lib/public-chat-vendor";
import { categoryLabel } from "@/lib/categories";
import { chatViewerId, createChatSession, findChatSession, hashIp } from "@/lib/public-chat-session";
import {
  PUBLIC_CHAT_IP_LIMIT,
  PUBLIC_CHAT_MAX_STEPS,
  PUBLIC_CHAT_SESSION_LIMIT,
  PUBLIC_CHAT_VENDOR_LIMIT,
} from "@/lib/public-chat";

export const maxDuration = 30;

type Ctx = { params: Promise<{ vendorId: string }> };
const text = (message: string, status: number) => new Response(message, { status });

export async function GET(req: Request, { params }: Ctx) {
  const { vendorId } = await params;
  const vendor = await loadChatVendor(vendorId);
  if (!vendor) return text("Chat isn't available.", 404);
  const userId = await chatViewerId();

  const session =
    (await findChatSession(vendorId, userId)) ??
    (await createChatSession(vendorId, {
      userId,
      forwardedFor: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    }));
  if (!session) return text("Couldn't start the chat. Please try again.", 500);

  const [{ data: messages }, { data: lead }] = await Promise.all([
    supabaseAdmin.from("vendor_chat_messages").select("id, role, body").eq("session_id", session.id).order("id").limit(60),
    supabaseAdmin.from("vendor_leads").select("id").eq("session_id", session.id).limit(1).maybeSingle(),
  ]);
  return Response.json({
    signedIn: !!userId,
    saved: !!session.coupleUserId,
    threadId: session.threadId,
    leadSent: !!lead,
    messages: (messages ?? []).map((m) => ({
      id: `m${m.id}`,
      role: m.role === "visitor" ? "user" : "assistant",
      parts: [{ type: "text", text: m.body }],
    })),
  });
}

const Body = z.object({ messages: z.unknown() });

export async function POST(req: Request, { params }: Ctx) {
  const { vendorId } = await params;
  const vendor = await loadChatVendor(vendorId);
  if (!vendor) {
    console.warn("[public-chat] POST: vendor not public or chat off", vendorId);
    return text("Chat isn't available for this vendor right now.", 404);
  }

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return text("Ask a question first.", 400);
  const prepared = prepareHelpMessages(body.data.messages);
  if (!prepared.ok) {
    console.warn("[public-chat] POST: bad messages", vendorId, prepared.error);
    return text(prepared.error, 400);
  }

  const userId = await chatViewerId();
  const session = await findChatSession(vendorId, userId);
  if (!session) {
    console.warn("[public-chat] POST: no chat session (cookie missing or expired)", vendorId);
    return text("Your chat expired. Please close it and open it again.", 409);
  }

  // Busy vendor first: the browser shows the contact card instead of chatting.
  if (!(await takeHelpQuota(`pc-v:${vendorId}`, PUBLIC_CHAT_VENDOR_LIMIT)))
    return Response.json({ cardOnly: true }, { status: 429 });
  const ip = hashIp(req.headers.get("x-forwarded-for"));
  if (
    !(await takeHelpQuota(`pc-s:${session.id}`, PUBLIC_CHAT_SESSION_LIMIT)) ||
    !(await takeHelpQuota(userId ? `pc-u:${userId}` : `pc-ip:${ip}`, PUBLIC_CHAT_IP_LIMIT))
  )
    return text(`You've reached today's chat limit. Share your details and ${vendor.businessName} will reply.`, 429);

  const question = prepared.messages.at(-1)!.parts[0].text ?? "";
  await supabaseAdmin.from("vendor_chat_messages").insert({ session_id: session.id, role: "visitor", body: question.slice(0, 4000) });

  const result = streamText({
    model: helpModel,
    system: {
      role: "system",
      content: publicChatPrompt({
        agentName: vendor.agentName,
        businessName: vendor.businessName,
        category: categoryLabel(vendor.category).toLowerCase(),
        customInstructions: vendor.notes,
      }),
      // Same text for every chat with this vendor, so it caches.
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    messages: await convertToModelMessages(prepared.messages as UIMessage[]),
    tools: {
      searchKnowledge: tool({
        description: `Search ${vendor.businessName}'s own information (website, FAQs, brochures).`,
        inputSchema: z.object({ question: z.string().max(500) }),
        execute: async ({ question }) => {
          const hits = await searchKnowledge(vendorId, question, 5);
          return hits.length
            ? { excerpts: hits.map((h) => ({ from: h.title ?? h.kind, text: h.text })) }
            : { excerpts: [], note: "Nothing on this. Say you're not sure and offer the contact card." };
        },
      }),
      getPackages: tool({
        description: `${vendor.businessName}'s packages and add-ons with starting prices (whole US dollars).`,
        inputSchema: z.object({}),
        execute: async () => {
          const [{ data: packages }, { data: addOns }] = await Promise.all([
            supabaseAdmin.from("vendor_packages").select("name, description, price, inclusions").eq("vendor_id", vendorId),
            supabaseAdmin.from("vendor_addons").select("name, description, price").eq("vendor_id", vendorId),
          ]);
          return { packages: packages ?? [], addOns: addOns ?? [], note: "Starting prices; the final price comes in an estimate." };
        },
      }),
      checkDate: tool({
        description: "Whether a wedding date looks open on the vendor's calendar. Never a promise or a hold.",
        inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD") }),
        execute: async ({ date }) => {
          if (date < new Date().toISOString().slice(0, 10)) return { status: "past" };
          const { data } = await supabaseAdmin
            .from("vendor_availability")
            .select("status, hold_expires_at")
            .eq("vendor_id", vendorId)
            .eq("date", date)
            .maybeSingle();
          const taken =
            data &&
            (data.status === "booked" ||
              data.status === "blocked" ||
              (data.status === "held" && (!data.hold_expires_at || new Date(data.hold_expires_at) > new Date())));
          return taken
            ? { status: "unavailable" }
            : { status: "looks_open", note: "Not a hold or a promise; the vendor confirms in an estimate." };
        },
      }),
      offerContactCard: tool({
        description: "Show the couple a short form so the vendor can reply personally with a quote.",
        inputSchema: z.object({}),
        execute: async () => ({ shown: true, note: "The form is on screen. Tell them briefly to fill it in." }),
      }),
    },
    stopWhen: stepCountIs(PUBLIC_CHAT_MAX_STEPS),
    maxOutputTokens: 500,
    onFinish: async ({ text: answer, totalUsage }) => {
      if (answer.trim())
        await supabaseAdmin.from("vendor_chat_messages").insert({ session_id: session.id, role: "assistant", body: answer.slice(0, 4000) });
      await supabaseAdmin.from("vendor_chat_sessions").update({ last_message_at: new Date().toISOString() }).eq("id", session.id);
      console.info("[public-chat] tokens", { vendorId, input: totalUsage?.inputTokens, output: totalUsage?.outputTokens });
    },
  });
  return result.toUIMessageStreamResponse();
}
