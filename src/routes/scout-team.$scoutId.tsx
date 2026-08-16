import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ScoutDetailView } from "@/features/scouts/components/scout-detail-view";
import { getScout } from "@/lib/scouts";

export const Route = createFileRoute("/scout-team/$scoutId")({
  head: ({ params }) => {
    const s = getScout(params.scoutId);
    const title = s
      ? `${s.title} · Profile — Scout Team`
      : "Scout — Scout Team";
    const desc = s
      ? `${s.title} workspace: ${s.tabs.map((t) => t.label).join(", ")}.`
      : "Scout profile workspace.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  loader: ({ params }) => {
    const scout = getScout(params.scoutId);
    if (!scout) throw notFound();
    return { scoutId: scout.id };
  },
  notFoundComponent: ScoutNotFound,
  component: ScoutProfilePage,
});

function ScoutNotFound() {
  const { scoutId } = Route.useParams();
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 grid place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">
          Scout not found
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          No scout registered as “{scoutId}”
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Head back to the command floor and pick an active scout.
        </p>
        <Link
          to="/scout-team"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/20"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Scout Team
        </Link>
      </div>
    </div>
  );
}

function ScoutProfilePage() {
  const { scoutId } = Route.useParams();
  return <ScoutDetailView scoutId={scoutId} />;
}
