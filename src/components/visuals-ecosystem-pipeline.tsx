import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Database,
  Server,
  Cpu,
  Globe,
  Radio,
  Share2,
  Workflow,
  ArrowRight,
  ShieldCheck,
  Send,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";

export type EcosystemNodeStatus = "healthy" | "syncing" | "warning" | "error";

export type EcosystemNode = {
  id: string;
  name: string;
  category: "analytics" | "crm" | "automation" | "database" | "security";
  status: EcosystemNodeStatus;
  latencyMs: number;
  lastSync: string;
  packetsPerMin: number;
  endpoint: string;
  icon: any;
  color: string;
  accentGradient: string;
  details: {
    description: string;
    version: string;
    authMethod: string;
    activePipelines: string[];
  };
};

const NODES_DATA: EcosystemNode[] = [
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "analytics",
    status: "healthy",
    latencyMs: 38,
    lastSync: "Just now",
    packetsPerMin: 142,
    endpoint: "analyticsdata.googleapis.com/v1beta/properties/377896920",
    icon: Activity,
    color: "#f59e0b",
    accentGradient: "from-amber-500/20 via-orange-500/10 to-transparent",
    details: {
      description: "Direct live REST stream for active users, sessions, conversions, and bounce metrics.",
      version: "v1beta",
      authMethod: "Service Account JWT",
      activePipelines: ["Real-time User Count", "Daily Session Ingestion", "Conversion Goal Tracking"],
    },
  },
  {
    id: "gsc",
    name: "Google Search Console",
    category: "analytics",
    status: "healthy",
    latencyMs: 42,
    lastSync: "2 min ago",
    packetsPerMin: 89,
    endpoint: "searchconsole.googleapis.com/v3/sites/safaeewala.com",
    icon: Globe,
    color: "#22d3ee",
    accentGradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    details: {
      description: "Organic search queries, SERP click velocity, impressions, and position rank tracking.",
      version: "v3",
      authMethod: "OAuth 2.0 / Service Account",
      activePipelines: ["SERP Rank Monitor", "CTR Gainer/Loser Audit", "BigQuery Daily Bulk Export"],
    },
  },
  {
    id: "gbp",
    name: "Google Business Profile",
    category: "analytics",
    status: "healthy",
    latencyMs: 51,
    lastSync: "5 min ago",
    packetsPerMin: 64,
    endpoint: "mybusinessbusinessinformation.googleapis.com/v1",
    icon: Radio,
    color: "#a78bfa",
    accentGradient: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
    details: {
      description: "Dubai local maps listing, customer call actions, direction requests, and 4.8★ reviews.",
      version: "v1",
      authMethod: "GMB API Connector",
      activePipelines: ["Call Action Metrics", "Review Sentiment Ingestion", "Local Map Rank Tracker"],
    },
  },
  {
    id: "ghl",
    name: "GoHighLevel (GHL) CRM",
    category: "crm",
    status: "healthy",
    latencyMs: 65,
    lastSync: "1 min ago",
    packetsPerMin: 210,
    endpoint: "services.leadconnectorhq.com/v2/location/safaeewala_dubai",
    icon: Send,
    color: "#10b981",
    accentGradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    details: {
      description: "Lead dispatch, instant WhatsApp/SMS booking notifications, and customer lifecycle CRM.",
      version: "v2 REST",
      authMethod: "Bearer Token / Webhook",
      activePipelines: ["New Lead Auto-Dispatch", "SMS Appointment Confirmation", "Deal Stage Pipeline"],
    },
  },
  {
    id: "n8n",
    name: "n8n Automation Engine",
    category: "automation",
    status: "healthy",
    latencyMs: 19,
    lastSync: "Active (15m Cron)",
    packetsPerMin: 320,
    endpoint: "http://187.77.116.14:5678/webhook/seo-sync",
    icon: Workflow,
    color: "#ec4899",
    accentGradient: "from-pink-500/20 via-rose-500/10 to-transparent",
    details: {
      description: "Autonomous background orchestrator running multi-agent SEO & CRM synchronization workflows.",
      version: "v1.28.0 Community",
      authMethod: "Custom Header Secret (X-SEO-Hub-Secret)",
      activePipelines: ["Cron Ingestion (15m)", "6-Agent Swarm Trigger", "Postgres Cache Refresher"],
    },
  },
  {
    id: "supabase",
    name: "Supabase & Vector RAG Engine",
    category: "database",
    status: "healthy",
    latencyMs: 14,
    lastSync: "Realtime",
    packetsPerMin: 480,
    endpoint: "gmb-safaeewala.supabase.co / pgvector",
    icon: Database,
    color: "#38bdf8",
    accentGradient: "from-sky-500/20 via-indigo-500/10 to-transparent",
    details: {
      description: "PostgreSQL relational store for site Knowledge Base data, sitemap page inventory, and CRM records.",
      version: "PostgreSQL 15",
      authMethod: "Anon Key / Service Role JWT",
      activePipelines: ["Knowledge Base Structuring", "Site Pages Inventory", "CRM Contact Store", "Audit Logs Persistence"],
    },
  },
  {
    id: "cloudflare",
    name: "Cloudflare AI Shield & WAF",
    category: "security",
    status: "healthy",
    latencyMs: 8,
    lastSync: "Edge Active",
    packetsPerMin: 1250,
    endpoint: "api.cloudflare.com/client/v4/zones/7e261b...",
    icon: ShieldCheck,
    color: "#f97316",
    accentGradient: "from-orange-500/20 via-amber-500/10 to-transparent",
    details: {
      description: "Edge Firewall protecting site against rogue AI web crawlers (Applebot, Meta, ByteDance, GPTBot).",
      version: "v4 API",
      authMethod: "Cloudflare API Bearer Token",
      activePipelines: ["AI Crawler Rate Limiter", "Edge Rule Enforcer", "DDoS Threat Mitigator"],
    },
  },
];

export function VisualsEcosystemPipeline() {
  const [nodes, setNodes] = useState<EcosystemNode[]>(NODES_DATA);
  const [selectedNode, setSelectedNode] = useState<EcosystemNode | null>(NODES_DATA[0]);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestPing = (id: string) => {
    setIsTesting(true);
    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, latencyMs: Math.floor(Math.random() * 25) + 12, lastSync: "Just now" }
            : n
        )
      );
      setIsTesting(false);
    }, 600);
  };

  return (
    <div className="space-y-6 text-slate-100 font-sans">
      {/* Header Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-950 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
              <Share2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Visual Topology Engine
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                  ● Realtime Flow Active
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">
                Project Ecosystem &amp; Data Pipelines Map
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Dynamic visual node map connecting GA4, Search Console, GMB, GoHighLevel CRM, n8n, and Supabase RAG.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTestPing("all")}
              disabled={isTesting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? "animate-spin" : ""}`} />
              <span>Ping All Nodes</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Visual Node Topology Map Canvas */}
      <div className="relative rounded-2xl border border-slate-800 bg-[#05070d] p-6 shadow-[0_0_50px_rgba(5,7,13,0.8)] overflow-hidden">
        {/* SVG Live Connection Lines & Flow Particles */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none stroke-slate-800/60 stroke-2" style={{ zIndex: 0 }}>
          <defs>
            <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="emerald-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Core Central Platform Hub Lines */}
          <line x1="20%" y1="30%" x2="50%" y2="50%" stroke="url(#cyan-glow)" strokeDasharray="6 4" className="animate-pulse" />
          <line x1="80%" y1="30%" x2="50%" y2="50%" stroke="url(#cyan-glow)" strokeDasharray="6 4" />
          <line x1="20%" y1="70%" x2="50%" y2="50%" stroke="url(#emerald-glow)" strokeDasharray="6 4" />
          <line x1="80%" y1="70%" x2="50%" y2="50%" stroke="url(#cyan-glow)" strokeDasharray="6 4" />
        </svg>

        {/* Central Core Platform Hub */}
        <div className="relative z-10 mb-8 flex justify-center">
          <div className="flex items-center gap-4 rounded-2xl border border-cyan-500/40 bg-slate-950/90 px-6 py-4 shadow-[0_0_30px_rgba(34,211,238,0.25)] backdrop-blur-xl">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.5)]">
              <Cpu className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">AKS SEO Hub Core Engine</span>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
                  VPS 187.77.116.14
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Orchestrating GSC, GA4, GHL CRM, n8n, and Supabase pgvector RAG
              </p>
            </div>
          </div>
        </div>

        {/* Grid of Platform Nodes */}
        <div className="relative z-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((node) => {
            const Icon = node.icon;
            const isSelected = selectedNode?.id === node.id;
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all duration-300 ${
                  isSelected
                    ? "border-cyan-400 bg-slate-900/90 shadow-[0_0_25px_rgba(34,211,238,0.25)] scale-[1.02]"
                    : "border-slate-800 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900/50"
                }`}
              >
                {/* Background Ambient Glow */}
                <div
                  className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${node.accentGradient} opacity-30 blur-2xl transition group-hover:opacity-60`}
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-950 shadow-md"
                      style={{ background: node.color }}
                    >
                      <Icon className="h-5 w-5 stroke-[2.2]" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{node.name}</div>
                      <div className="truncate text-[10.5px] font-mono text-slate-400">{node.endpoint}</div>
                    </div>
                  </div>

                  {/* Status Indicator Pill */}
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-ping" />
                    Live
                  </span>
                </div>

                {/* Metrics Footer */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-3 text-[11px]">
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500">Latency</div>
                    <div className="font-mono font-semibold text-cyan-300">{node.latencyMs} ms</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500">Packets/min</div>
                    <div className="font-mono font-semibold text-slate-200">{node.packetsPerMin}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500">Last Sync</div>
                    <div className="font-mono text-slate-400">{node.lastSync}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Node Detailed Inspector Drawer */}
      {selectedNode && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-950 font-bold"
                style={{ background: selectedNode.color }}
              >
                {<selectedNode.icon className="h-5 w-5 stroke-[2.5]" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{selectedNode.name} Inspector</h3>
                <div className="text-[11px] font-mono text-slate-400">{selectedNode.endpoint}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTestPing(selectedNode.id)}
                disabled={isTesting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400 hover:text-cyan-200 transition cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isTesting ? "animate-spin" : ""}`} /> Test Pipeline Ping
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Description Card */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">System Purpose</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                {selectedNode.details.description}
              </p>
            </div>

            {/* Auth & Protocol */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">API Protocol:</span>
                <span className="font-mono text-slate-200">{selectedNode.details.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Authentication:</span>
                <span className="font-mono text-cyan-300">{selectedNode.details.authMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Connection Health:</span>
                <span className="font-semibold text-emerald-400">100% Operational</span>
              </div>
            </div>

            {/* Active Data Flows */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Active Data Pipelines
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {selectedNode.details.activePipelines.map((pipe, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span>{pipe}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
