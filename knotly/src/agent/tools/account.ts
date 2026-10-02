// src/agent/tools/account.ts — sign-up / sign-in cards, shared by the couple and vendor agents.
import { tool } from "ai";
import { z } from "zod";
import type { ToolCtx } from "../shared";

export function accountTools({ isGuest }: ToolCtx, defaultRole: "couple" | "vendor") {
  return {
    requestSignUp: tool({
      description:
        "Show the create-account card (email or phone + password) to a GUEST. The chat shows the card; you can't create accounts yourself.",
      inputSchema: z.object({
        reason: z.string().describe("One short sentence shown on the card"),
        role: z
          .enum(["couple", "vendor"])
          .optional()
          .describe('"vendor" for a wedding business, "couple" for someone planning a wedding'),
      }),
      execute: async ({ reason, role }) =>
        isGuest ? { show: "signup", reason, role: role ?? defaultRole } : { alreadySignedIn: true },
    }),

    requestSignIn: tool({
      description:
        "Show the sign-in card to a GUEST who already has an account (they say so, or this browser signed in before).",
      inputSchema: z.object({
        reason: z.string().describe("One short sentence shown on the card"),
      }),
      execute: async ({ reason }) => (isGuest ? { show: "signin", reason } : { alreadySignedIn: true }),
    }),
  };
}
