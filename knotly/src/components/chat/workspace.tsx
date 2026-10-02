// src/components/chat/workspace.tsx
// The right-hand pane. Tool results the user should see or act on ("artifacts") are
// drawn here instead of in the chat; the chat gets a one-line chip that links over.
"use client";
import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import VendorListCard from "./cards/VendorListCard";
import VendorDetailsCard from "./cards/VendorDetailsCard";
import InquiryDraftsCard from "./cards/InquiryDraftsCard";
import WeddingCard from "./cards/WeddingCard";
import BusinessCard from "./cards/BusinessCard";
import InboxPane from "../inbox/InboxPane";

export type Tab = "inbox" | "vendors" | "drafts" | "wedding" | "business";

// The Inbox tab isn't a tool result; it's always there for signed-in users.
export const INBOX = "inbox";

const TAB_LABELS: Record<Tab, string> = {
  inbox: "Messages",
  wedding: "My wedding",
  vendors: "Vendors",
  drafts: "Drafts",
  business: "My business",
};
const TAB_ORDER: Tab[] = ["inbox", "wedding", "vendors", "drafts", "business"];

// Loose view of a tool output; each card narrows it to what it needs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Out = any;
type PanelTool = {
  tab: Tab;
  summary: (o: Out) => string; // chip text in the chat and title in the panel
  render: (o: Out, onAsk: (text: string) => void) => ReactNode;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One entry per tool whose result belongs in the workspace. Add a tool here to give it a card.
const PANEL_TOOLS: Record<string, PanelTool> = {
  searchVendors: {
    tab: "vendors",
    summary: (o) =>
      o.ok ? `Found ${plural(o.vendors.length, o.category.replace("_", " & "))}${o.city ? ` near ${o.city}` : ""}` : "Search failed",
    render: (o, onAsk) => <VendorListCard data={o} onAsk={onAsk} />,
  },
  getVendorDetails: {
    tab: "vendors",
    summary: (o) => (o.ok ? o.vendor.business_name : "Couldn't load vendor"),
    render: (o, onAsk) => <VendorDetailsCard data={o} onAsk={onAsk} />,
  },
  draftInquiry: {
    tab: "drafts",
    summary: (o) => (o.ok ? `Drafted ${plural(o.drafts.length, "inquiry", "inquiries")}` : "Drafting failed"),
    render: (o) => <InquiryDraftsCard data={o} />,
  },
  getMyWedding: {
    tab: "wedding",
    summary: () => "Your wedding",
    render: (o) => <WeddingCard data={o} />,
  },
  saveWeddingDetails: {
    tab: "wedding",
    summary: (o) => (o.ok ? "Updated your wedding" : "Couldn't save"),
    render: (o) => <WeddingCard data={o} />,
  },
  getMyBusiness: {
    tab: "business",
    summary: () => "Your listing",
    render: (o) => <BusinessCard data={o} />,
  },
  saveBusinessProfile: {
    tab: "business",
    summary: (o) => (o.ok ? "Updated your listing" : "Couldn't save"),
    render: (o) => <BusinessCard data={o} />,
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
  addTestimonials: ["Saving reviews…", "Saved reviews"],
  publishProfile: ["Updating visibility…", "Updated visibility"],
};

export function chipLabel(tool: string, done: boolean) {
  return CHIP_LABELS[tool]?.[done ? 1 : 0] ?? (done ? `✓ ${tool}` : `${tool}…`);
}

export const isPanelTool = (tool: string) => tool in PANEL_TOOLS;
export const summarize = (tool: string, output: Out) => PANEL_TOOLS[tool]?.summary(output) ?? tool;

export type Artifact = { id: string; tool: string; tab: Tab; output: Out };

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
  showInbox,
  unread,
  onInboxChange,
}: {
  artifacts: Artifact[];
  activeId: string | undefined; // an artifact id, or INBOX
  onSelect: (id: string) => void;
  onAsk: (text: string) => void;
  showInbox: boolean; // signed-in users only; guests have no mailbox
  unread: number;
  onInboxChange: () => void;
}) {
  const inboxActive = showInbox && activeId === INBOX;
  const active = inboxActive ? undefined : artifacts.find((a) => a.id === activeId);
  if (!active && !inboxActive)
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-500">
        Search results, drafts and your plan will show up here as we chat.
      </div>
    );

  const activeTab: Tab = inboxActive ? "inbox" : active!.tab;
  const tabs = TAB_ORDER.filter((t) => (t === "inbox" ? showInbox : artifacts.some((a) => a.tab === t)));
  const latestIn = (t: Tab) => (t === "inbox" ? INBOX : artifacts.findLast((a) => a.tab === t)!.id);
  const earlier = active ? artifacts.filter((a) => a.tab === active.tab && a.id !== active.id).reverse() : [];
  const entry = active && PANEL_TOOLS[active.tool];

  return (
    <div className="flex h-full flex-col">
      <nav className="flex gap-1 border-b border-gray-200 px-4 pt-3 dark:border-gray-800" aria-label="Workspace">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(latestIn(t))}
            aria-current={t === activeTab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              t === activeTab
                ? "border-black font-medium dark:border-white"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            {TAB_LABELS[t]}
            {t === "inbox" && unread > 0 && (
              <span className="ml-1 rounded-full bg-black px-1.5 text-xs text-white dark:bg-white dark:text-black">{unread}</span>
            )}
          </button>
        ))}
      </nav>

      <section className="flex-1 overflow-y-auto p-4" aria-live="polite">
        {inboxActive ? (
          <InboxPane onChange={onInboxChange} />
        ) : (
          <>
            <h2 className="mb-3 font-semibold">{entry!.summary(active!.output)}</h2>
            {entry!.render(active!.output, onAsk)}
          </>
        )}

        {earlier.length > 0 && (
          <div className="mt-8 border-t border-gray-200 pt-4 dark:border-gray-800">
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
