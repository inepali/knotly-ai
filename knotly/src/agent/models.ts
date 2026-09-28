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
