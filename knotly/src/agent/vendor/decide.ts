// src/agent/vendor/decide.ts
import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "../models";
import type { VendorCtx } from "./context";
import { vendorSystemPrompt } from "./prompt";

export const DecisionSchema = z.object({
  responseType: z.enum([
    "answer",
    "quote",
    "hold",
    "clarify",
    "decline",
    "escalate",
  ]),
  message: z
    .string()
    .describe(
      "Reply to the couple in the vendor's voice, like an experienced wedding consultant. Specific to their wedding, under 120 words."
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How sure you are this reply is correct and allowed"),
  sources: z
    .array(z.string())
    .describe(
      'What the reply relies on: "profile", "package:<id>", "addon:<id>", "calendar", "rule:<kind>", "kb:<id>"'
    ),
  quote: z
    .object({
      packageId: z.string(),
      addOnIds: z
        .array(z.string())
        .describe("ids from <vendor_context>.addOns the couple asked for or clearly needs; never invent one"),
      discountPercent: z.number().min(0).max(50),
    })
    .nullable()
    .describe("Required when responseType is quote"),
  escalationReason: z
    .string()
    .nullable()
    .describe("Required when responseType is escalate"),
  citedInstruction: z
    .string()
    .nullable()
    .describe(
      "The exact sentence from <vendor_custom_instructions> that drove this decision, copied word for word (under 300 characters); null if none did. Shown only to the vendor."
    ),
});
export type Decision = z.infer<typeof DecisionSchema>;

export async function decide(
  ctx: VendorCtx,
  guidance?: string
): Promise<Decision> {
  const { object } = await generateObject({
    model: chatModel,
    schema: DecisionSchema,
    // Same text for every thread of this vendor, so the provider caches it.
    system: {
      role: "system",
      content: vendorSystemPrompt(ctx),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    prompt: `<vendor_context>
${JSON.stringify(
  {
    vendor: ctx.vendor,
    packages: ctx.packages,
    addOns: ctx.addOns,
    rules: ctx.rules,
    wedding: ctx.wedding,
    categoryBudget: ctx.categoryBudget,
    categoryNeed: ctx.categoryNeed,
    dateStatus: ctx.dateStatus,
    distanceMiles: ctx.distanceMiles,
    signature: ctx.settings.signature,
    knowledge: ctx.knowledge,
  },
  null,
  2
)}
</vendor_context>

<couple_messages>
${ctx.history.map((m) => `${m.from}: ${m.text}`).join("\n\n")}
</couple_messages>

${guidance ? `\n<vendor_guidance>\nThe vendor's guidance for this reply (follow it): ${guidance}\n</vendor_guidance>\n` : ""}
Decide how to reply to the latest couple message.`,
  });
  return object;
}
