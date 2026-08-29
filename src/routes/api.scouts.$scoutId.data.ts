import { createFileRoute } from "@tanstack/react-router";

// Real per-scout data, replacing lib/scouts.ts's entirely fabricated
// metrics/activity feeds. Every tab below either returns real data sourced
// from infrastructure this app already has wired (GSC, GA4, GBP, PageSpeed,
// claude_jobs, alerts, sitemap crawling) or an honest
// { available: false, reason } the UI renders as a "connect a provider"
// empty state -- never an invented number. Tabs needing a paid third-party
// API this app has no account for (rank tracking, backlink/referring-domain
// data, server log access) are always `available: false` until such a
// provider is configured.

const NEEDS_PROVIDER = (what: string) => ({
  available: false,
  reason: `${what} requires a third-party API this app isn't connected to yet (e.g. a rank-tracking or backlink data provider). No data is fabricated here.`,
});

async function getSite(siteId: string) {
  const { db, ensureSchema } = await import("@/db/client");
  const { sites } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await ensureSchema();
  const d = db();
  const [site] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  return site;
}

function dateRange(daysAgo: number) {
  const end = new Date();
  end.setDate(end.getDate() - 2);
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ---------- Keyword Scout: all real, from live GSC query data ----------
async function keywordScoutData(site: any) {
  if (!site?.gscConnected || !site?.gscPropertyUrl) {
    return {
      researcher: NEEDS_PROVIDER("Keyword research"),
      ranker: { available: false, reason: "Connect Google Search Console for this site to see real ranked queries." },
      "competitor-kw": NEEDS_PROVIDER("Competitor keyword comparison"),
      mapping: { available: false, reason: "Connect Google Search Console for this site to map queries to pages." },
      clustering: { available: false, reason: "Connect Google Search Console for this site to cluster real queries." },
    };
  }
  const { fetchGSCSearchAnalytics } = await import("@/lib/google/search-console");
  const { startDate, endDate } = dateRange(30);
  const [queryRows, pageRows] = await Promise.all([
    fetchGSCSearchAnalytics(site.gscPropertyUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 500 }).catch(() => []),
    fetchGSCSearchAnalytics(site.gscPropertyUrl, { startDate, endDate, dimensions: ["page", "query"], rowLimit: 1000 }).catch(() => []),
  ]);

  const totalQueries = queryRows.length;
  const winnable = queryRows.filter((r: any) => r.position >= 5 && r.position <= 20).length;
  const topTen = queryRows.filter((r: any) => r.position <= 10).length;
  const avgPosition = queryRows.length
    ? (queryRows.reduce((s: number, r: any) => s + (r.position || 0), 0) / queryRows.length).toFixed(1)
    : "0";

  // Real "mapping": which page each top query currently ranks on
  const byPage = new Map<string, { query: string; position: number }[]>();
  for (const r of pageRows as any[]) {
    const page = r.keys?.[1] ? r.keys[0] : r.keys?.[0];
    const query = r.keys?.[1] || r.keys?.[0];
    if (!page) continue;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push({ query, position: r.position });
  }

  return {
    researcher: {
      available: true,
      metrics: [
        { label: "Queries with impressions (30d)", value: String(totalQueries) },
        { label: "Winnable (pos 5-20)", value: String(winnable) },
        { label: "Top 10", value: String(topTen) },
      ],
      topQueries: queryRows.slice(0, 15).map((r: any) => ({ query: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
    },
    ranker: {
      available: true,
      metrics: [
        { label: "Tracked queries", value: String(totalQueries) },
        { label: "In top 10", value: String(topTen) },
        { label: "Avg. position", value: avgPosition },
      ],
      topQueries: queryRows.slice(0, 15).map((r: any) => ({ query: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
    },
    "competitor-kw": NEEDS_PROVIDER("Competitor keyword comparison"),
    mapping: {
      available: true,
      pages: Array.from(byPage.entries()).slice(0, 20).map(([page, queries]) => ({
        page,
        queryCount: queries.length,
        topQuery: queries.sort((a, b) => a.position - b.position)[0]?.query,
      })),
    },
    clustering: {
      available: false,
      reason: "Semantic clustering of queries into topic hubs isn't wired yet -- would need an embeddings pass over the real query list above.",
    },
  };
}

// ---------- Content Scout: real from kanban_tasks + claude_jobs ----------
async function contentScoutData(siteId: string) {
  const { db, ensureSchema } = await import("@/db/client");
  const { kanbanTasks } = await import("@/db/schema");
  const { desc, or, eq, like } = await import("drizzle-orm");
  await ensureSchema();
  const d = db();

  const contentTasks = await d
    .select()
    .from(kanbanTasks)
    .where(or(eq(kanbanTasks.templateId, "content"), like(kanbanTasks.assignee, "%Content%")))
    .orderBy(desc(kanbanTasks.createdAt))
    .limit(50);

  const published = contentTasks.filter((t) => t.publishedUrl);
  const inProgress = contentTasks.filter((t) => t.status === "inprogress");
  const pendingApproval = contentTasks.filter((t) => t.status === "pending_approval");

  return {
    studio: {
      available: true,
      metrics: [
        { label: "Content tasks total", value: String(contentTasks.length) },
        { label: "Published", value: String(published.length) },
        { label: "In progress", value: String(inProgress.length) },
      ],
      recent: contentTasks.slice(0, 10).map((t) => ({ title: t.title, status: t.status, createdAt: t.createdAt, publishedUrl: t.publishedUrl })),
    },
    writing: {
      available: true,
      metrics: [
        { label: "Awaiting approval", value: String(pendingApproval.length) },
        { label: "In progress", value: String(inProgress.length) },
        { label: "Published", value: String(published.length) },
      ],
      recent: pendingApproval.slice(0, 10).map((t) => ({ title: t.title, desc: t.desc, createdAt: t.createdAt })),
    },
    pipeline: {
      available: true,
      byStage: {
        todo: contentTasks.filter((t) => t.status === "todo").length,
        pending_approval: pendingApproval.length,
        inprogress: inProgress.length,
        review: contentTasks.filter((t) => t.status === "review").length,
        done: contentTasks.filter((t) => t.status === "done").length,
      },
    },
    quality: {
      available: false,
      reason: "Automated content quality scoring (E-E-A-T, freshness, thin-content detection) isn't wired yet -- the real QA Suite audits technical/on-page checks, not content quality specifically.",
    },
    gmb: NEEDS_PROVIDER("(handled under Local Business Scout's GBP tab instead)"),
  };
}

// ---------- Designing Scout: mostly no real SEO data source; a11y is real ----------
async function designScoutData(siteId: string, domain: string | null) {
  let a11y: any = { available: false, reason: "No PageSpeed run yet for this site's homepage." };
  if (domain) {
    try {
      const { fetchPageSpeedInsights } = await import("@/lib/google/pagespeed");
      const url = domain.startsWith("http") ? domain : `https://${domain}`;
      const result = await fetchPageSpeedInsights(url);
      a11y = {
        available: true,
        metrics: [
          { label: "Accessibility score", value: result.accessibilityScore != null ? String(result.accessibilityScore) : "—" },
          { label: "Best practices score", value: result.bestPracticesScore != null ? String(result.bestPracticesScore) : "—" },
        ],
        issues: result.issues.filter((i) => i.category === "accessibility"),
      };
    } catch (err: any) {
      a11y = { available: false, reason: `PageSpeed accessibility check failed: ${err.message}` };
    }
  }
  return {
    researcher: { available: false, reason: "Automated competitor-design scraping isn't built -- would require a real crawl+screenshot pipeline against named competitor URLs." },
    prototypes: { available: false, reason: "This app has no design-prototyping tool integration (e.g. Figma) to pull real prototype status from." },
    system: { available: false, reason: "No design-token/component-library system exists in this app to report on." },
    assets: { available: false, reason: "No asset management backend exists in this app." },
    variants: { available: false, reason: "No A/B testing tool is integrated in this app." },
    a11y,
  };
}

// ---------- Local Business Scout: real from GBP insights ----------
async function localScoutData(site: any) {
  if (!site?.gbpConnected) {
    const notConnected = { available: false, reason: "Sync this site's Google Business Profile from the Knowledge Base screen first." };
    return { gbp: notConnected, citations: NEEDS_PROVIDER("Citation tracking"), reviews: notConnected, "local-rank": NEEDS_PROVIDER("Local pack rank tracking"), nap: notConnected };
  }
  try {
    const { fetchGBPAccounts, fetchGBPLocations, fetchGBPReviews, fetchGBPPerformance } = await import("@/lib/google/business-profile");
    const accounts = await fetchGBPAccounts();
    if (!accounts.length) throw new Error("No GBP accounts accessible");
    const locations = await fetchGBPLocations(accounts[0].name);
    if (!locations.length) throw new Error("No GBP locations found");
    const location = locations[0];

    const [reviewsResult, perfResult] = await Promise.allSettled([
      fetchGBPReviews(accounts[0].name, location.name),
      fetchGBPPerformance(location.name),
    ]);

    const reviews = reviewsResult.status === "fulfilled" ? reviewsResult.value : null;
    const perf = perfResult.status === "fulfilled" ? perfResult.value : [];

    const sum = (metric: string) => {
      const entry = (perf as any[]).find((s) => s.dailyMetricTimeSeries?.dailyMetric === metric);
      const values = entry?.dailyMetricTimeSeries?.timeSeries?.datedValues || [];
      return values.reduce((acc: number, v: any) => acc + (parseInt(v.value || "0", 10) || 0), 0);
    };

    return {
      gbp: perfResult.status === "fulfilled"
        ? {
            available: true,
            metrics: [
              { label: "Direction requests", value: String(sum("BUSINESS_DIRECTION_REQUESTS")) },
              { label: "Calls", value: String(sum("CALL_CLICKS")) },
              { label: "Website clicks", value: String(sum("WEBSITE_CLICKS")) },
            ],
          }
        : { available: false, reason: `Business Profile Performance API: ${(perfResult as any).reason?.message || "not available"}` },
      citations: NEEDS_PROVIDER("Citation/NAP directory tracking"),
      reviews: reviews
        ? { available: true, averageRating: reviews.averageRating, totalReviewCount: reviews.totalReviewCount, reviews: reviews.reviews.slice(0, 10) }
        : { available: false, reason: `Reviews API: ${(reviewsResult as any).reason?.message || "not available"}` },
      "local-rank": NEEDS_PROVIDER("Local pack grid rank tracking"),
      nap: {
        available: true,
        businessName: location.title,
        address: location.storefrontAddress
          ? [location.storefrontAddress.addressLines?.join(", "), location.storefrontAddress.locality].filter(Boolean).join(", ")
          : null,
        phone: location.phoneNumbers?.primaryPhone || null,
      },
    };
  } catch (err: any) {
    const failed = { available: false, reason: err.message || "Failed to load Google Business Profile data" };
    return { gbp: failed, citations: NEEDS_PROVIDER("Citation tracking"), reviews: failed, "local-rank": NEEDS_PROVIDER("Local pack rank tracking"), nap: failed };
  }
}

// ---------- Competitor Scout: only sitemap-diff is real without a paid API ----------
async function competitorScoutData() {
  return {
    serp: NEEDS_PROVIDER("Daily SERP volatility tracking"),
    sitemap: {
      available: true,
      note: "Enter a competitor domain in the field below to run a real sitemap.xml crawl (uses the same crawler as Site Pages).",
    },
    backlinks: NEEDS_PROVIDER("Backlink / referring-domain monitoring"),
    gap: NEEDS_PROVIDER("Content gap analysis against named competitors"),
    sov: NEEDS_PROVIDER("Share-of-voice tracking"),
  };
}

// ---------- Audit & Reporting Scout: real from PageSpeed + alerts + jobs ----------
async function auditScoutData(site: any) {
  const { db, ensureSchema } = await import("@/db/client");
  const { alerts, claudeJobs } = await import("@/db/schema");
  const { desc, eq, and, gte } = await import("drizzle-orm");
  await ensureSchema();
  const d = db();

  const openAlerts = await d.select().from(alerts).where(eq(alerts.status, "open")).orderBy(desc(alerts.createdAt)).limit(50);
  const p1 = openAlerts.filter((a) => a.severity === "critical").length;

  let siteAudit: any = { available: false, reason: "No domain configured for this site." };
  if (site?.domain) {
    try {
      const { fetchPageSpeedInsights } = await import("@/lib/google/pagespeed");
      const url = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`;
      const result = await fetchPageSpeedInsights(url);
      siteAudit = {
        available: true,
        metrics: [
          { label: "Performance score", value: result.performanceScore != null ? String(result.performanceScore) : "—" },
          { label: "SEO score", value: result.seoScore != null ? String(result.seoScore) : "—" },
          { label: "Issues found", value: String(result.issues.length) },
        ],
        issues: result.issues.slice(0, 10),
      };
    } catch (err: any) {
      siteAudit = { available: false, reason: `PageSpeed check failed: ${err.message}` };
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const recentJobs = await d.select().from(claudeJobs).where(and(eq(claudeJobs.status, "done"), gte(claudeJobs.createdAt, thirtyDaysAgo))).orderBy(desc(claudeJobs.createdAt)).limit(200);

  return {
    "site-audit": siteAudit,
    weekly: {
      available: false,
      reason: "No scheduled weekly report generation is wired -- run the Head of SEO orchestrator manually or via the real 24h auto-trigger to get a report-equivalent output.",
    },
    kpi: {
      available: true,
      metrics: [
        { label: "Real jobs completed (30d)", value: String(recentJobs.length) },
        { label: "Open alerts", value: String(openAlerts.length) },
        { label: "Critical alerts", value: String(p1) },
      ],
    },
    issues: {
      available: true,
      metrics: [
        { label: "Open", value: String(openAlerts.length) },
        { label: "Critical", value: String(p1) },
      ],
      items: openAlerts.slice(0, 15).map((a) => ({ title: a.title, severity: a.severity, source: a.source, createdAt: a.createdAt })),
    },
    exec: {
      available: false,
      reason: "No auto-generated executive summary exists yet -- the real orchestrator's task output (Suggestions screen) is the closest equivalent today.",
    },
  };
}

// ---------- Technical Scout: real from PageSpeed + sitemap crawler ----------
async function technicalScoutData(site: any) {
  let cwv: any = { available: false, reason: "No domain configured for this site." };
  let crawl: any = { available: false, reason: "No domain configured for this site." };

  if (site?.domain) {
    const url = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`;
    try {
      const { fetchPageSpeedInsights } = await import("@/lib/google/pagespeed");
      const result = await fetchPageSpeedInsights(url);
      cwv = {
        available: true,
        metrics: [
          { label: "LCP", value: result.lcpMs != null ? `${(result.lcpMs / 1000).toFixed(1)}s` : "—" },
          { label: "CLS", value: result.clsScore != null ? String(result.clsScore) : "—" },
          { label: "INP", value: result.inpMs != null ? `${result.inpMs}ms` : "—" },
        ],
      };
    } catch (err: any) {
      cwv = { available: false, reason: `PageSpeed check failed: ${err.message}` };
    }

    try {
      const { crawlSitemap } = await import("@/lib/sitemap-crawler");
      const result = await crawlSitemap(url);
      crawl = {
        available: !result.error,
        reason: result.error || undefined,
        metrics: [
          { label: "URLs discovered", value: String(result.urls.length) },
          { label: "Sitemaps found", value: String(result.sitemapsFound.length) },
        ],
      };
    } catch (err: any) {
      crawl = { available: false, reason: err.message };
    }
  }

  return {
    crawl,
    cwv,
    schema: {
      available: false,
      reason: "Live schema/JSON-LD validation across all pages isn't wired -- the Schema Generator SEO Suite tool produces real schema from your Knowledge Base, but doesn't yet crawl and validate what's live on-site.",
    },
    logs: NEEDS_PROVIDER("Server log analysis (requires log file/CDN log access)"),
    redirects: NEEDS_PROVIDER("Redirect chain/loop auditing across the live site"),
  };
}

export const Route = createFileRoute("/api/scouts/$scoutId/data")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const url = new URL(request.url);
          const siteId = url.searchParams.get("siteId");
          if (!siteId) {
            return Response.json({ ok: false, error: "siteId is required" }, { status: 400 });
          }
          const site = await getSite(siteId);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          let data: Record<string, any>;
          switch (params.scoutId) {
            case "keyword":
              data = await keywordScoutData(site);
              break;
            case "content":
              data = await contentScoutData(siteId);
              break;
            case "design":
              data = await designScoutData(siteId, site.domain);
              break;
            case "local":
              data = await localScoutData(site);
              break;
            case "competitor":
              data = await competitorScoutData();
              break;
            case "audit":
              data = await auditScoutData(site);
              break;
            case "technical":
              data = await technicalScoutData(site);
              break;
            default:
              return Response.json({ ok: false, error: "Unknown scout" }, { status: 404 });
          }

          return Response.json({ ok: true, data });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load scout data" }, { status: 500 });
        }
      },
    },
  },
});
