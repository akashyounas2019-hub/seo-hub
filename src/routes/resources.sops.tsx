import { createFileRoute } from "@tanstack/react-router";
import { ResourcesShell, type ResourceItem } from "@/components/resources-page";

export const Route = createFileRoute("/resources/sops")({
  head: () => ({
    meta: [
      { title: "SOPs — Resources · AKS SEO Console" },
      { name: "description", content: "Standard operating procedures for the SEO, content and local ops team." },
    ],
  }),
  component: SopsPage,
});

const SEED: ResourceItem[] = [
  {
    id: "sop-1",
    title: "New service-area page SOP",
    updated: "2d ago",
    body: "1) Confirm intent in GSC + local pack.\n2) Draft with 8 unique H2s + local proof (project photos, GBP reviews).\n3) Add FAQ schema, hreflang ar-AE / en-AE, breadcrumb.\n4) Internal-link from Dubai hub + 2 nearest area pages.\n5) Push to CMS, request indexing.",
  },
  {
    id: "sop-2",
    title: "Weekly rank & GBP review SOP",
    updated: "5d ago",
    body: "Every Monday 09:00 GST: pull GSC + GA4 deltas, GBP calls/direction requests, top 10 area grid. Flag drops > 20% for triage.",
  },
];

function SopsPage() {
  return (
    <ResourcesShell
      kind="SOP"
      title="Standard Operating Procedures"
      blurb="Step-by-step playbooks the agents and human ops team follow. Keep each SOP short and executable."
      bodyLabel="Numbered steps work best."
      bodyPlaceholder={"1) Step one\n2) Step two\n3) Step three"}
      seed={SEED}
    />
  );
}
