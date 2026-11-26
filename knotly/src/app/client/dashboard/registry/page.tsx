// Gift Registry (add-on): store links, cash funds, wish items, and what guests have claimed or sent.
import { requireAddon } from "@/lib/addon-access";
import { loadRegistryEditor } from "@/lib/actions/registry";
import RegistryEditor from "@/components/registry/RegistryEditor";

export default async function RegistryPage() {
  const { sb, userId } = await requireAddon("registry");
  const r = await loadRegistryEditor(sb, userId);
  if (!r.ok) return <p className="text-sm text-red-600">{r.error}</p>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Gift Registry</h1>
      <p className="mt-1 text-sm text-gray-600">
        Shown on your wedding website. Gifts and money go straight to you through the stores and apps you link. Knotly
        never handles payments.
      </p>
      <RegistryEditor data={r.data} />
    </div>
  );
}
