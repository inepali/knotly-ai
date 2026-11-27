// Guest Photo Sharing (add-on): QR sign, approve/hide, download everything.
import { requireAddon } from "@/lib/addon-access";
import { loadPhotoShare } from "@/lib/actions/photo-share";
import { requestSiteUrl } from "@/lib/site";
import { qrSvg } from "@/lib/qr";
import PhotoModeration from "@/components/photos/PhotoModeration";

export default async function PhotosPage() {
  const { sb, userId } = await requireAddon("photo_share");
  const r = await loadPhotoShare(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  const link = r.data.site ? `${await requestSiteUrl()}/w/${r.data.site.slug}/photos` : null;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Guest Photo Sharing</h1>
      <p className="mt-1 text-sm text-gray-600">Guests scan a QR code at the venue and add their photos, no app or account needed.</p>
      <PhotoModeration data={r.data} link={link} qr={link ? qrSvg(link, { size: 140 }) : null} />
    </div>
  );
}
