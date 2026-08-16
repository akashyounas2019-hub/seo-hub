import Link from "next/link";
import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const TOOLS: { href: string; title: string; desc: string; icon: string }[] = [
  { href: "/admin/cloud-seo/audit", title: "Full SEO Audit", desc: "Comprehensive audit across all SEO categories with scoring and action plan", icon: "🔍" },
  { href: "/admin/cloud-seo/page-analysis", title: "Page Analysis", desc: "Deep on-page SEO analysis for a single URL", icon: "📄" },
  { href: "/admin/cloud-seo/technical", title: "Technical SEO", desc: "Crawlability, indexability, security, CWV, and 9 technical categories", icon: "⚙️" },
  { href: "/admin/cloud-seo/content", title: "Content & E-E-A-T", desc: "Content quality and E-E-A-T framework assessment", icon: "✍️" },
  { href: "/admin/cloud-seo/content-brief", title: "Content Brief", desc: "Generate actionable content briefs with keyword targeting", icon: "📋" },
  { href: "/admin/cloud-seo/schema", title: "Schema Markup", desc: "Structured data detection, validation, and generation", icon: "🏗️" },
  { href: "/admin/cloud-seo/local-seo", title: "Local SEO", desc: "GBP, NAP consistency, citations, reviews, and local signals", icon: "📍" },
  { href: "/admin/cloud-seo/images", title: "Image SEO", desc: "Alt text, file names, compression, formats, and lazy loading", icon: "🖼️" },
  { href: "/admin/cloud-seo/competitor", title: "Competitor Analysis", desc: "Content gaps, keyword opportunities, and competitive strategy", icon: "🎯" },
  { href: "/admin/cloud-seo/sitemap", title: "Sitemap Analysis", desc: "XML sitemap structure, coverage, and quality gates", icon: "🗺️" },
  { href: "/admin/cloud-seo/backlinks", title: "Backlink Analysis", desc: "Link profile assessment and link building opportunities", icon: "🔗" },
  { href: "/admin/cloud-seo/cluster", title: "Keyword Clustering", desc: "Semantic grouping with pillar-cluster content architecture", icon: "🧩" },
  { href: "/admin/cloud-seo/hreflang", title: "Hreflang Audit", desc: "International SEO and hreflang implementation validation", icon: "🌐" },
  { href: "/admin/cloud-seo/seo-plan", title: "SEO Strategy Plan", desc: "90-day phased SEO strategy with KPIs and milestones", icon: "📈" },
  { href: "/admin/cloud-seo/programmatic", title: "Programmatic SEO", desc: "Template-driven page analysis and scaling opportunities", icon: "🤖" },
  { href: "/admin/cloud-seo/geo", title: "AI & GEO Visibility", desc: "Generative Engine Optimization and AI crawler readiness", icon: "🧠" },
  { href: "/admin/cloud-seo/sxo", title: "Search Experience", desc: "SEO + UX intersection analysis and persona scoring", icon: "🎨" },
  { href: "/admin/cloud-seo/drift", title: "SEO Drift Monitor", desc: "Detect degradation, content staleness, and competitive shifts", icon: "📊" },
];

export default async function CloudSeoHubPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="SEO Analysis Suite"
        subtitle="AI-powered SEO analysis tools. Select a tool below to analyze any URL."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-2"
          >
            <div className="flex items-start gap-3">
              <span className="text-lg" aria-hidden>{tool.icon}</span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text group-hover:text-accent">
                  {tool.title}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  {tool.desc}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
