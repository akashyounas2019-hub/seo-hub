import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AgentDetailView } from "@/features/agents/components/agent-detail-view";
import { EXPERTS, parseAgentId, slugify } from "@/lib/agents";

export const Route = createFileRoute("/agents/$id")({
  beforeLoad: ({ params }) => {
    const { parentId } = parseAgentId(params.id);
    if (!EXPERTS.some((e) => e.id === parentId)) throw notFound();
  },
  head: ({ params }) => {
    const { parentId, subSlug } = parseAgentId(params.id);
    const expert = EXPERTS.find((e) => e.id === parentId);
    const subName = subSlug
      ? expert?.subs.find((s) => slugify(s.name) === subSlug)?.name
      : undefined;
    const title = subName
      ? `${subName} — Sub-agent Profile`
      : expert
      ? `${expert.title} — Agent Profile`
      : "Agent Profile";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: subName
            ? `Manage skills, tasks and settings for the ${subName} sub-agent.`
            : expert
            ? `Manage skills, tasks and settings for the ${expert.title} agent.`
            : "Agent profile management.",
        },
      ],
    };
  },
  component: AgentDetailPage,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#05070d] text-slate-200">
      <div className="text-center">
        <div className="text-lg font-semibold">Agent not found</div>
        <Link to="/" className="mt-3 inline-block text-cyan-300 hover:underline">
          ← Back to console
        </Link>
      </div>
    </div>
  ),
});

function AgentDetailPage() {
  const { id } = Route.useParams();
  return <AgentDetailView id={id} />;
}
