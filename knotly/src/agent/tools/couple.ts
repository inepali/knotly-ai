// src/agent/tools/couple.ts — chat tools for couples. The logic lives in src/lib/actions/*;
// each tool is a description + schema + a call to the shared action.
import { tool } from "ai";
import { z } from "zod";
import type { ToolCtx } from "../shared";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { accountTools } from "./account";
import { bare, flat } from "@/lib/actions/result";
import { getMyWedding, saveWeddingDetails, SaveWeddingDetailsInput } from "@/lib/actions/wedding";
import {
  getBudget,
  planBudget,
  PlanBudgetInput,
  recordBooking,
  RecordBookingInput,
} from "@/lib/actions/budget";
import {
  draftInquiry,
  DraftInquiryInput,
  getVendorDetails,
  GetVendorDetailsInput,
  searchVendors,
  SearchVendorsInput,
} from "@/lib/actions/inquiries";
import { askVendorKnowledge, AskVendorKnowledgeInput } from "@/lib/actions/knowledge";

export function coupleTools({ sb, userId, isGuest }: ToolCtx) {
  return {
    draftInquiry: tool({
      description:
        "Draft inquiry messages to 1-5 vendors. Saves DRAFTS only. The couple must tap Send on each card.",
      inputSchema: DraftInquiryInput,
      execute: async (input) => flat(await draftInquiry(sb, userId, input, { isGuest })),
    }),

    searchVendors: tool({
      description:
        "Search published vendors by meaning plus filters. Uses the saved wedding city and style by default.",
      inputSchema: SearchVendorsInput,
      execute: async (input) => flat(await searchVendors(sb, userId, input)),
    }),

    askVendorKnowledge: tool({
      description:
        "Look up a vendor's own information (their website, FAQs, brochures) to answer a couple's question about that vendor: policies, travel, deliverables, process, contact.",
      inputSchema: AskVendorKnowledgeInput,
      execute: async (input) => flat(await askVendorKnowledge(sb, userId, input)),
    }),

    getVendorDetails: tool({
      description: "Get one vendor's packages and reviews.",
      inputSchema: GetVendorDetailsInput,
      execute: async (input) => flat(await getVendorDetails(sb, userId, input)),
    }),

    getBudget: tool({
      description:
        "The couple's budget: total, each category's planned target, vendor quotes received and bookings, and what's left.",
      inputSchema: z.object({}),
      execute: async () => bare(await getBudget(sb, userId)),
    }),

    planBudget: tool({
      description:
        "Set target amounts per category (whole USD). Use to suggest an allocation from the total budget, guest count and city, or when the couple names a target. Keeps the couple's own targets unless they ask to change them.",
      inputSchema: PlanBudgetInput,
      execute: async (input) => flat(await planBudget(sb, userId, input)),
    }),

    recordBooking: tool({
      description: "Record that the couple booked a vendor or item, and for how much (whole USD).",
      inputSchema: RecordBookingInput,
      execute: async (input) => flat(await recordBooking(sb, userId, input)),
    }),

    getMyWedding: tool({
      description:
        "Get the couple's saved wedding details. Call before searching or drafting messages.",
      inputSchema: z.object({}),
      execute: async () => bare(await getMyWedding(sb, userId)),
    }),

    // Guest says they run a wedding business: hand the chat to the vendor agent.
    switchToVendor: tool({
      description:
        "Hand a GUEST who runs a wedding business (and wants to be listed) to vendor onboarding. Their next message is answered by the vendor assistant.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!isGuest)
          return {
            ok: false,
            error:
              "This account is a couple account. A vendor listing needs its own vendor account: sign out, then create one and choose 'Wedding vendor'.",
          };
        // role isn't user-editable (column grants), so the server sets it.
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ role: "vendor" })
          .eq("id", userId)
          .eq("role", "couple");
        return error ? { ok: false, error: error.message } : { ok: true, switched: "vendor" };
      },
    }),

    ...accountTools({ sb, userId, isGuest }, "couple"),

    saveWeddingDetails: tool({
      description:
        "Save wedding details. Call as soon as you learn ANY field; leave out unknown fields.",
      inputSchema: SaveWeddingDetailsInput,
      execute: async (input) => flat(await saveWeddingDetails(sb, userId, input)),
    }),
  };
}
