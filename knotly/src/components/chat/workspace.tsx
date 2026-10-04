// src/components/chat/workspace.tsx
// The right-hand pane. Tool results the user should see or act on ("artifacts") are
// drawn here instead of in the chat; the chat gets a one-line chip that links over.
"use client";
import { useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import VendorListCard from "./cards/VendorListCard";
import VendorDetailsCard from "./cards/VendorDetailsCard";
import InquiryDraftsCard from "./cards/InquiryDraftsCard";
import InboxPane from "../inbox/InboxPane";
import KnowledgePane from "../knowledge/KnowledgePane";
import BusinessPane from "../vendor/BusinessPane";
import BudgetPane from "../budget/BudgetPane";
import WeddingPane from "../couple/WeddingPane";
import VendorsPane from "../couple/VendorsPane";
import { categoryLabel } from "@/lib/categories";

// Fixed tabs are always there (for the right person) and load from the database; their
// "artifact id" is the tab name. Result tabs appear when the assistant produces something.
export const WEDDING = "wedding";
export const BUDGET = "budget";
export const VENDORS = "vendors"; // vendors the couple is in touch with
export const INBOX = "inbox";
export const BUSINESS = "business";
export const KNOWLEDGE = "knowledge";
const FIXED = [WEDDING, BUDGET, VENDORS, INBOX, BUSINESS, KNOWLEDGE] as const;
type FixedTab = (typeof FIXED)[number];
type ResultTab = "search" | "drafts";
export type Tab = FixedTab | ResultTab;

// Tab order: couples see My Wedding, Budget, Vendors, Messages; vendors see Messages,
// My business, Knowledge. Search and Drafts follow when there's something in them.
const TAB_ORDER: Tab[] = [...FIXED, "search", "drafts"];
const TAB_LABELS: Record<Tab, string> = {
  wedding: "My Wedding",
  budget: "Budget",
  vendors: "Vendors",
  inbox: "Messages",
  business: "My business",
  knowledge: "Knowledge",
  search: "Search",
  drafts: "Drafts",
};
const isFixed = (t: string | undefined): t is FixedTab => (FIXED as readonly string[]).includes(t ?? "");

// Tools whose results change a fixed tab: their chips open it, and each call reloads it.
export const WEDDING_TOOLS = new Set(["getMyWedding", "saveWeddingDetails"]);
export const BUDGET_TOOLS = new Set(["getBudget", "planBudget", "recordBooking"]);
export const BUSINESS_TOOLS = new Set([
  "getMyBusiness",
  "saveBusinessProfile",
  "savePackages",
  "saveAddOns",
  "addTestimonials",
  "publishProfile",
]);

// How many calls to these tools have finished: a fixed tab's reload key.
export function toolVersion(messages: UIMessage[], tools: Set<string>) {
  return messages
    .flatMap((m) => m.parts)
    .filter(
      (p) =>
        p.type.startsWith("tool-") &&
        tools.has(p.type.slice("tool-".length)) &&
        "state" in p &&
        p.state === "output-available"
    ).length;
}

// Loose view of a tool output; each card narrows it to what it needs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Out = any;
type PanelTool = {
  tab: ResultTab;
  summary: (o: Out) => string; // chip text in the chat and title in the panel
  render: (o: Out, onAsk: (text: string) => void) => ReactNode;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One entry per tool whose result belongs in the workspace. Add a tool here to give it a card.
const PANEL_TOOLS: Record<string, PanelTool> = {
  searchVendors: {
    tab: "search",
    summary: (o) =>
      o.ok ? `Found ${plural(o.vendors.length, categoryLabel(o.category).toLowerCase())}${o.city ? ` near ${o.city}` : ""}` : "Search failed",
    render: (o, onAsk) => <VendorListCard data={o} onAsk={onAsk} />,
  },
  getVendorDetails: {
    tab: "search",
    summary: (o) => (o.ok ? o.vendor.business_name : "Couldn't load vendor"),
    render: (o, onAsk) => <VendorDetailsCard data={o} onAsk={onAsk} />,
  },
  draftInquiry: {
    tab: "drafts",
    summary: (o) => (o.ok ? `Drafted ${plural(o.drafts.length, "inquiry", "inquiries")}` : "Drafting failed"),
    render: (o) => <InquiryDraftsCard data={o} />,
  },
};

// Chat-only tools still get a readable chip instead of their code name.
const CHIP_LABELS: Record<string, [running: string, done: string]> = {
  searchVendors: ["Searching vendors…", "Searched vendors"],
  getVendorDetails: ["Loading vendor…", "Loaded vendor"],
  draftInquiry: ["Drafting messages…", "Drafted messages"],
  getMyWedding: ["Checking your plan…", "Checked your plan"],
  saveWeddingDetails: ["Saving…", "Saved"],
  getMyBusiness: ["Checking your listing…", "Checked your listing"],
  saveBusinessProfile: ["Saving your listing…", "Saved your listing"],
  savePackages: ["Saving packages…", "Saved packages"],
  saveAddOns: ["Saving add-ons…", "Saved add-ons"],
  getBudget: ["Checking your budget…", "Checked your budget"],
  planBudget: ["Planning your budget…", "Updated your budget plan"],
  recordBooking: ["Recording booking…", "Recorded booking"],
  addKnowledge: ["Adding to your knowledge…", "Added to your knowledge"],
  addTestimonials: ["Saving reviews…", "Saved reviews"],
  publishProfile: ["Updating visibility…", "Updated visibility"],
};

export function chipLabel(tool: string, done: boolean) {
  return CHIP_LABELS[tool]?.[done ? 1 : 0] ?? (done ? `✓ ${tool}` : `${tool}…`);
}

export const isPanelTool = (tool: string) => tool in PANEL_TOOLS;
export const summarize = (tool: string, output: Out) => PANEL_TOOLS[tool]?.summary(output) ?? tool;

export type Artifact = { id: string; tool: string; tab: ResultTab; output: Out };

// Built from the messages every render, so the panel can never drift from the chat.
export function deriveArtifacts(messages: UIMessage[]): Artifact[] {
  const out: Artifact[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const part of m.parts) {
      if (!part.type.startsWith("tool-") || !("state" in part) || part.state !== "output-available") continue;
      const tool = part.type.slice("tool-".length);
      const entry = PANEL_TOOLS[tool];
      if (entry && "toolCallId" in part)
        out.push({ id: part.toolCallId, tool, tab: entry.tab, output: part.output });
    }
  }
  return out;
}

export function WorkspacePanel({
  artifacts,
  activeId,
  onSelect,
  onAsk,
  show,
  versions,
  unread,
  onInboxChange,
}: {
  artifacts: Artifact[];
  activeId: string | undefined; // an artifact id, or a fixed tab name
  onSelect: (id: string) => void;
  onAsk: (text: string) => void;
  show: Partial<Record<FixedTab, boolean>>; // which fixed tabs this person gets
  versions: { wedding: number; budget: number; business: number; mail: number }; // reload keys
  unread: number;
  onInboxChange: () => void;
}) {
  // A conversation to open when switching to Messages (from a vendor card).
  const [inboxThread, setInboxThread] = useState<string | null>(null);

  const fixedActive = isFixed(activeId) && show[activeId] ? activeId : null;
  const active = fixedActive ? undefined : artifacts.find((a) => a.id === activeId);
  if (!active && !fixedActive)
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-500">
        Search results, drafts and your plan will show up here as we chat.
      </div>
    );

  const activeTab: Tab = fixedActive ?? active!.tab;
  const tabs = TAB_ORDER.filter((t) => (isFixed(t) ? show[t] : artifacts.some((a) => a.tab === t)));
  const latestIn = (t: Tab) => (isFixed(t) ? t : artifacts.findLast((a) => a.tab === t)!.id);
  const earlier = active ? artifacts.filter((a) => a.tab === active.tab && a.id !== active.id).reverse() : [];
  const entry = active && PANEL_TOOLS[active.tool];

  const select = (t: Tab) => {
    if (t === INBOX) setInboxThread(null); // the tab itself opens the list
    onSelect(latestIn(t));
  };

  return (
    <div className="flex h-full flex-col">
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 pt-3" aria-label="Workspace">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => select(t)}
            aria-current={t === activeTab ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${
              t === activeTab
                ? "border-cyan-500 font-semibold text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {TAB_LABELS[t]}
            {t === INBOX && unread > 0 && (
              <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{unread}</span>
            )}
          </button>
        ))}
      </nav>

      <section className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6" aria-live="polite">
        {fixedActive === WEDDING ? (
          <WeddingPane refreshKey={versions.wedding} />
        ) : fixedActive === BUDGET ? (
          <BudgetPane refreshKey={versions.budget} />
        ) : fixedActive === VENDORS ? (
          <VendorsPane
            refreshKey={versions.mail}
            onAsk={onAsk}
            onOpenThread={(id) => {
              setInboxThread(id);
              onSelect(INBOX);
            }}
          />
        ) : fixedActive === INBOX ? (
          <InboxPane
            key={inboxThread ?? "list"} // a new thread to open remounts the pane on it
            initialThreadId={inboxThread}
            onChange={onInboxChange}
            refreshKey={versions.mail}
          />
        ) : fixedActive === BUSINESS ? (
          <BusinessPane refreshKey={versions.business} />
        ) : fixedActive === KNOWLEDGE ? (
          <KnowledgePane />
        ) : (
          <>
            <h2 className="mb-4 text-lg font-medium tracking-tight text-gray-900">{entry!.summary(active!.output)}</h2>
            {entry!.render(active!.output, onAsk)}
          </>
        )}

        {earlier.length > 0 && (
          <div className="mt-8 border-t border-gray-200 pt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Earlier</p>
            <ul className="space-y-1">
              {earlier.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onSelect(a.id)} className="text-sm underline-offset-2 hover:underline">
                    {summarize(a.tool, a.output)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
