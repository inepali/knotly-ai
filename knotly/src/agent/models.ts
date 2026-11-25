// src/agent/models.ts
import { createAnthropic } from "@ai-sdk/anthropic";

// Keys not scoped to a workspace must name one on every request.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
if (!workspaceId) {
  console.warn(
    "[models] ANTHROPIC_WORKSPACE_ID is not set; requests fail unless ANTHROPIC_API_KEY is workspace-scoped."
  );
}

const anthropic = createAnthropic({
  headers: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
});

export const chatModel = anthropic("claude-sonnet-5");

// Help chat: a cheaper, faster Haiku-class model. chatModel stays for the Vendor Agent
// and the chat that step 6 retires. HELP_MODEL overrides the id without a deploy.
export const helpModel = anthropic(process.env.HELP_MODEL ?? "claude-haiku-5-5");
