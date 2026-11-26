// src/components/invitations/PrintCard.tsx — one 5×7 inch card with a QR code to the website or RSVP.
import { qrSvg } from "@/lib/qr";
import { KIND_LABELS, TEMPLATES, type Kind } from "@/lib/invitations";
import { THEMES } from "@/lib/wedding-site";
import type { InvitationsData } from "@/lib/actions/invitations";

export default function PrintCard({
  kind,
  data,
  link,
  householdLabel,
  code,
}: {
  kind: Kind;
  data: InvitationsData;
  link: string;
  householdLabel: string | null;
  code: string | null;
}) {
  const design = data.designs[kind];
  const t = TEMPLATES[design.template];
  const c = THEMES[data.site?.theme ?? "classic"];
  const border = t.border === "double" ? `6px double ${c.accent}` : t.border === "thin" ? `1px solid ${c.accent}` : "none";
  return (
    <section
      className="card mx-auto my-6 flex flex-col shadow-xl"
      style={{
        width: "5in",
        height: "7in",
        background: c.bg,
        color: c.ink,
        fontFamily: t.serif ? "Georgia, 'Times New Roman', serif" : "Helvetica, Arial, sans-serif",
        textAlign: t.align,
        padding: "0.35in",
        boxSizing: "border-box",
      }}
    >
      <div className="flex flex-1 flex-col" style={{ border, padding: "0.3in" }}>
        {design.show_photo && data.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public CDN image, printed
          <img src={data.photoUrl} alt="" className="mb-4 w-full object-cover" style={{ height: "2in" }} />
        )}
        {householdLabel && <p className="text-xs opacity-80">{householdLabel}</p>}
        <p className="mt-1 text-[10px] tracking-[0.3em] uppercase" style={{ color: c.accent }}>{design.heading || KIND_LABELS[kind]}</p>
        <h1 className="mt-2 text-3xl leading-tight">{data.names}</h1>
        {data.date && <p className="mt-2 text-base">{data.date}</p>}
        {data.place && <p className="text-sm opacity-80">{data.place}</p>}
        {design.message && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{design.message}</p>}
        {design.details && <p className="mt-2 text-xs leading-relaxed whitespace-pre-line opacity-85">{design.details}</p>}
        <div className="mt-auto flex items-end gap-3 pt-3" style={{ justifyContent: t.align === "center" ? "center" : "flex-start" }}>
          <span dangerouslySetInnerHTML={{ __html: qrSvg(link, { size: 84 }) }} />
          <span className="text-left text-[10px] leading-snug opacity-80">
            {kind === "invitation" && data.rsvp ? "Scan to RSVP" : "Scan for details"}
            <br />
            {link.replace(/^https?:\/\//, "").replace(/\?t=.*/, "")}
            {code && (
              <>
                <br />
                Code: <strong>{code}</strong>
              </>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
