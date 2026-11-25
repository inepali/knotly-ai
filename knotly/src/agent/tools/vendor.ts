// src/agent/tools/vendor.ts — chat tools for vendors. The logic lives in src/lib/actions/*;
// each tool is a description + schema + a call to the shared action.
import { tool } from "ai";
import { z } from "zod";
import type { ToolCtx } from "../shared";
import { accountTools } from "./account";
import { PDF_UPLOADS_ENABLED } from "@/lib/flags";
import { bare, flat } from "@/lib/actions/result";
import { addKnowledge, AddKnowledgeInput } from "@/lib/actions/knowledge";
import {
  getAgentStats,
  listRules,
  saveRule,
  SaveRuleInput,
  setAutonomy,
  SetAutonomyInput,
} from "@/lib/actions/vendor-agent-settings";
import { setAvailability, SetAvailabilityInput } from "@/lib/actions/availability";
import {
  addTestimonials,
  AddTestimonialsInput,
  getMyBusiness,
  publishProfile,
  PublishProfileInput,
  saveAddOns,
  SaveAddOnsInput,
  saveBusinessProfile,
  SaveBusinessProfileInput,
  savePackages,
  SavePackagesInput,
} from "@/lib/actions/vendor-profile";

export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 3959,
    toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat),
    dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function vendorTools({ sb, userId, isGuest }: ToolCtx) {
  return {
    ...accountTools({ sb, userId, isGuest }, "vendor"),

    addKnowledge: tool({
      description: `Add to the vendor's knowledge base, which their assistant uses to answer couples: a link (website, Instagram, Facebook, YouTube) or an FAQ.${
        PDF_UPLOADS_ENABLED
          ? " For PDFs, tell them to upload in the Knowledge tab."
          : " PDFs aren't supported yet."
      }`,
      inputSchema: AddKnowledgeInput,
      execute: async (input) => flat(await addKnowledge(sb, userId, input)),
    }),

    saveRule: tool({
      description:
        "Save ONE business rule for the vendor's AI agent. First restate the rule in plain words and get a clear yes. " +
        "Call once per rule.",
      inputSchema: SaveRuleInput,
      execute: async (input) => flat(await saveRule(sb, userId, input)),
    }),

    listRules: tool({
      description: "List the vendor's active agent rules and settings.",
      inputSchema: z.object({}),
      execute: async () => bare(await listRules(sb, userId)),
    }),

    setAvailability: tool({
      description: "Block dates, mark them booked, or free them up.",
      inputSchema: SetAvailabilityInput,
      execute: async (input) => flat(await setAvailability(sb, userId, input)),
    }),

    setAutonomy: tool({
      description:
        "Change how independently the agent works. 0 Shadow (drafts only), 1 Assist (answers alone, estimates need approval), 2 Autopilot (everything within rules), 3 Full (adds discounts within limit).",
      inputSchema: SetAutonomyInput,
      execute: async (input) => flat(await setAutonomy(sb, userId, input)),
    }),

    getMyBusiness: tool({
      description:
        "Get the vendor's current profile, packages and review count.",
      inputSchema: z.object({}),
      execute: async () => bare(await getMyBusiness(sb, userId)),
    }),

    saveBusinessProfile: tool({
      description:
        "Create or update the business profile. Call as soon as you learn any field.",
      inputSchema: SaveBusinessProfileInput,
      execute: async (input) => flat(await saveBusinessProfile(sb, userId, input)),
    }),

    getAgentStats: tool({
      description:
        "How the vendor's AI agent performed in the last 30 days, and whether it has earned more autonomy.",
      inputSchema: z.object({}),
      execute: async () => bare(await getAgentStats(sb, userId)),
    }),

    savePackages: tool({
      description:
        "Save service packages. Extract them from pasted text or an attached price sheet. Whole USD.",
      inputSchema: SavePackagesInput,
      execute: async (input) => flat(await savePackages(sb, userId, input)),
    }),

    saveAddOns: tool({
      description:
        "Save optional add-ons sold on top of a package (second shooter, extra hour, album…). Whole USD. Only add-ons the vendor states.",
      inputSchema: SaveAddOnsInput,
      execute: async (input) => flat(await saveAddOns(sb, userId, input)),
    }),

    addTestimonials: tool({
      description:
        "Save client reviews from pasted text or attached screenshots/PDFs. Copy the words exactly; skip anything that is not a real client review.",
      inputSchema: AddTestimonialsInput,
      execute: async (input) => flat(await addTestimonials(sb, userId, input)),
    }),

    publishProfile: tool({
      description:
        "Make the business visible in search. Only when the vendor clearly asks to go live.",
      inputSchema: PublishProfileInput,
      execute: async (input) => flat(await publishProfile(sb, userId, input, { isGuest })),
    }),
  };
}
