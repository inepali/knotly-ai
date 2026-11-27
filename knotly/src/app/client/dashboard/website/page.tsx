// Wedding Website editor (add-on). Locked weddings are sent to the add-on's preview page.
import { requireAddon } from "@/lib/addon-access";
import { loadSiteEditor } from "@/lib/actions/website";
import { requestSiteUrl } from "@/lib/site";
import WebsiteEditor from "@/components/website/WebsiteEditor";

export default async function WebsitePage() {
  const { sb, userId } = await requireAddon("website");
  const r = await loadSiteEditor(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Wedding Website</h1>
      <p className="mt-1 text-sm text-gray-600">
        One page for your guests. It&apos;s hidden from search engines unless you turn that on, and you can add a password.
      </p>
      <WebsiteEditor data={r.data} baseUrl={`${await requestSiteUrl()}/w/`} />
    </div>
  );
}
