// src/app/api/chat/route.ts
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { chatModel } from "@/agent/models";
import { coupleSystemPrompt } from "@/agent/prompts";
import { coupleTools } from "@/agent/tools/couple";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return new Response("No session", { status: 401 });

  const result = streamText({
    model: chatModel,
    system: coupleSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: coupleTools({
      sb,
      userId: user.id,
      isGuest: user.is_anonymous ?? false,
    }),
    stopWhen: stepCountIs(5), // the agent loop
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Learning aid: watch the agent think in your terminal
      if (toolCalls.length)
        console.log(JSON.stringify({ toolCalls, toolResults }, null, 2));
    },
  });

  return result.toUIMessageStreamResponse();
}
