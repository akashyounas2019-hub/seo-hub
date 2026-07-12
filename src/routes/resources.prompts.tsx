import { createFileRoute } from "@tanstack/react-router";
import { ResourcesShell, type ResourceItem } from "@/components/resources-page";

export const Route = createFileRoute("/resources/prompts")({
  head: () => ({
    meta: [
      { title: "Prompts — Resources · AKS SEO Console" },
      { name: "description", content: "Reusable AI prompts for agents, content writing, GBP posts and QA reviews." },
    ],
  }),
  component: PromptsPage,
});

const SEED: ResourceItem[] = [
  {
    id: "prompt-1",
    title: "Service page draft — Dubai cleaning",
    updated: "1d ago",
    body: "You are the Content Scout for Safaeewala Cleaning. Write a 1,200-word service page for {{keyword}} targeting Dubai. Include: H1 with primary keyword, 6 H2 sections (Overview, What's Included, Areas Served, Pricing, FAQ, Book Now), FAQ schema-ready Q&A, and 3 local proof points.",
  },
  {
    id: "prompt-2",
    title: "GBP post — offer",
    updated: "3d ago",
    body: "Write a 1,200-character Google Business Profile post for a {{offer}} in {{area}}, Dubai. Friendly, action-oriented, one CTA, one emoji max.",
  },
];

function PromptsPage() {
  return (
    <ResourcesShell
      kind="Prompt"
      title="AI Prompt Library"
      blurb="Curated prompts your agents use across content, GBP, outreach and QA. Use {{variables}} for reusable slots."
      bodyLabel="Wrap variables in {{double_braces}}."
      bodyPlaceholder="You are a {{role}}... Task: {{task}}..."
      seed={SEED}
    />
  );
}
