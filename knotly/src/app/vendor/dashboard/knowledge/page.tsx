// Knowledge: links, FAQs and PDFs your assistant learns from. KnowledgePane is already a form.
import { requireVendor } from "@/lib/vendor-session";
import KnowledgePane from "@/components/knowledge/KnowledgePane";

export default async function KnowledgePage() {
  await requireVendor();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Add your website, social links and FAQs. Your assistant answers couples&apos; questions from these.
      </p>
      <KnowledgePane />
    </div>
  );
}
