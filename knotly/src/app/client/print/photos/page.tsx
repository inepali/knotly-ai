// A printable table sign with the photo-sharing QR code.
import type { Metadata } from "next";
import { requireAddon } from "@/lib/addon-access";
import { loadPhotoShare } from "@/lib/actions/photo-share";
import { requestSiteUrl } from "@/lib/site";
import { qrSvg } from "@/lib/qr";
import PrintButton from "@/components/invitations/PrintButton";

export const metadata: Metadata = { title: "Photo sign · Knotly", robots: { index: false } };

export default async function PhotoSign() {
  const { sb, userId } = await requireAddon("photo_share");
  const r = await loadPhotoShare(sb, userId);
  const slug = r.ok ? r.data.site?.slug : null;
  if (!slug) return <p className="p-8 text-sm text-gray-700">Create your wedding website first, so the QR code has somewhere to go.</p>;
  const link = `${await requestSiteUrl()}/w/${slug}/photos`;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-10 text-center font-serif text-gray-900">
      <style>{`@page { size: 5in 7in; margin: 0.4in }`}</style>
      <div className="print:hidden"><PrintButton /></div>
      <p className="text-sm tracking-[0.3em] uppercase">Share the love</p>
      <h1 className="text-4xl">Add your photos</h1>
      <span dangerouslySetInnerHTML={{ __html: qrSvg(link, { size: 260 }) }} />
      <p className="text-lg">Scan with your phone camera</p>
      <p className="text-xs text-gray-500">{link.replace(/^https?:\/\//, "")}</p>
    </main>
  );
}
