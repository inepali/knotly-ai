// src/app/inbox/[threadId]/page.tsx — one conversation, oldest first, with a reply box.
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewer, isMine, loadMailbox, loadThread } from "@/lib/mailbox";
import MailShell from "@/components/inbox/MailShell";
import { mailCounts } from "@/lib/mail-threads";
import { DraftReview, MarkRead, ReplyBox } from "@/components/inbox/ThreadActions";
import EstimateCard from "@/components/inbox/EstimateCard";
import { loadThreadEstimates, loadThreadUnlock, lockedReplyNotice, type VendorContact } from "@/lib/estimates";

const AGENT = new Set(["couple_agent", "vendor_agent"]);

export default async function ThreadPage(props: PageProps<"/inbox/[threadId]">) {
  const { threadId } = await props.params;

  const sb = await supabaseServer();
  const viewer = await getViewer(sb);
  if (!viewer) redirect("/signin");

  const [messages, all, estimates, unlock] = await Promise.all([
    loadThread(sb, viewer.side, threadId),
    loadMailbox(sb, viewer.side),
    loadThreadEstimates(sb, viewer.side, threadId),
    loadThreadUnlock(sb, threadId),
  ]);
  const estimateById = new Map(estimates.map((e) => [e.id, e]));
  // Estimates not attached to any message still get shown, after the conversation.
  const attached = new Set(messages.map((m) => m.quoteId).filter(Boolean));
  const loose = estimates.filter((e) => !attached.has(e.id));
  if (messages.length === 0) notFound(); // not theirs, or nothing visible yet

  const counterpart = messages[0].counterpart;
  const subject = messages.find((m) => m.status === "sent")?.subject ?? messages[0].subject;

  return (
    <MailShell counts={mailCounts(all)}>
      <MarkRead threadId={threadId} hasNew={messages.some((m) => m.isNew)} />
      <h1 className="text-xl font-semibold">{subject ?? "Conversation"}</h1>
      <p className="mb-4 text-sm text-gray-500">With {counterpart}</p>
      {viewer.side === "couple" && unlock.contact && <VendorContactCard contact={unlock.contact} />}

      <ol className="space-y-3">
        {messages.map((m) => {
          const mine = isMine(m.sender, viewer.side);
          const draft = m.status === "pending_approval";
          if (draft && mine)
            return (
              <li key={m.id}>
                <DraftReview
                  id={m.id}
                  to={counterpart}
                  subject={m.subject}
                  body={m.body}
                  warnings={m.warnings}
                  draftedAt={m.createdAt}
                />
              </li>
            );
          return (
            <li
              key={m.id}
              className={`rounded-xl border p-4 ${
                draft
                  ? "border-dashed border-amber-300 bg-amber-50/50"
                  : mine
                    ? "border-gray-200 bg-gray-50"
                    : "border-gray-200"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {mine ? "You" : counterpart}
                  {AGENT.has(m.sender) && <span className="font-normal text-gray-500"> · written with Knotly assistant</span>}
                  {draft && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Draft — not sent</span>}
                  {m.isNew && <span className="ml-2 rounded-lg bg-cyan-500 font-semibold hover:bg-cyan-600 px-2 py-0.5 text-xs text-white">New</span>}
                </span>
                <time dateTime={m.createdAt} className="text-xs text-gray-500">
                  {new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </div>
              {m.subject && <p className="mb-1 font-medium">{m.subject}</p>}
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              {!draft && m.quoteId && estimateById.has(m.quoteId) && (
                <EstimateCard estimate={estimateById.get(m.quoteId)!} side={viewer.side} />
              )}
            </li>
          );
        })}
      </ol>
      {loose.map((e) => (
        <EstimateCard key={e.id} estimate={e} side={viewer.side} />
      ))}

      {messages.some((m) => m.status === "sent") &&
        (unlock.messagingOpen ? (
          <div className="mt-6">
            <ReplyBox threadId={threadId} to={counterpart} />
          </div>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">
            {lockedReplyNotice(viewer.side)}
          </p>
        ))}
    </MailShell>
  );
}

// Shown to the couple once they've opened one of this vendor's estimates.
function VendorContactCard({ contact }: { contact: VendorContact }) {
  // Only http(s) links: the stored website is any URL the vendor typed (never javascript:).
  const site = contact.website && /^https?:\/\//i.test(contact.website) ? contact.website : null;
  const web = site?.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const ig = contact.instagram?.replace(/^@/, "");
  return (
    <section aria-label={`Contact ${contact.businessName}`} className="mb-4 rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <p className="mb-2 font-medium text-gray-900">Contact {contact.businessName}</p>
      <ul className="space-y-1 text-gray-700">
        {contact.phone && (
          <li>
            Phone: <a className="text-cyan-700 underline" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>
          </li>
        )}
        {contact.email && (
          <li>
            Email: <a className="text-cyan-700 underline" href={`mailto:${contact.email}`}>{contact.email}</a>
          </li>
        )}
        {site && web && (
          <li>
            Website:{" "}
            <a className="text-cyan-700 underline" href={site} target="_blank" rel="noopener noreferrer nofollow">
              {web}
            </a>
          </li>
        )}
        {ig && (
          <li>
            Instagram:{" "}
            <a className="text-cyan-700 underline" href={`https://instagram.com/${encodeURIComponent(ig)}`} target="_blank" rel="noopener noreferrer nofollow">
              @{ig}
            </a>
          </li>
        )}
        <li>
          <a className="text-cyan-700 underline" href={`/vendors/${contact.vendorId}`}>
            See their profile and portfolio
          </a>
        </li>
      </ul>
    </section>
  );
}
