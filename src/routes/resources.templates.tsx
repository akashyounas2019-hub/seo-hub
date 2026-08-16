import { createFileRoute } from "@tanstack/react-router";
import { ResourcesShell, type ResourceItem } from "@/components/resources-page";

export const Route = createFileRoute("/resources/templates")({
  head: () => ({
    meta: [
      { title: "Templates — Resources · AKS SEO Console" },
      { name: "description", content: "Reusable content templates: service pages, area pages, blog posts, outreach emails." },
    ],
  }),
  component: TemplatesPage,
});

const SEED: ResourceItem[] = [
  {
    id: "tpl-1",
    title: "Area landing page template",
    updated: "1d ago",
    body: "H1: {{Service}} in {{Area}}, Dubai\nIntro: 2 sentences, mention response time + coverage.\nSections: What's included · Why {{Area}} · Recent jobs · Pricing · FAQ · Book now\nSchema: LocalBusiness + FAQPage + BreadcrumbList",
  },
  {
    id: "tpl-2",
    title: "Outreach email — unlinked mention",
    updated: "6d ago",
    body: "Subject: quick fix on your {{topic}} article\n\nHi {{name}},\nSaw you mentioned {{brand}} in your recent piece on {{topic}} — thanks! Would you mind linking the mention to {{url}}? Takes 30 seconds and helps readers find us. Happy to return the favour any time.\n\nCheers,\n{{sender}}",
  },
];

function TemplatesPage() {
  return (
    <ResourcesShell
      kind="Template"
      title="Content Templates"
      blurb="Skeleton templates for service pages, area landing pages, blog posts and outreach emails. Duplicate, fill and ship."
      bodyLabel="Use {{Slots}} for dynamic fields."
      bodyPlaceholder="H1: {{Title}}\nIntro: ...\nSections: ..."
      seed={SEED}
    />
  );
}
