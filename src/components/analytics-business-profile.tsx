import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  Phone,
  Navigation,
  Eye,
  MessageSquare,
  Camera,
  MapPin,
  Download,
  Search,
} from "lucide-react";
import { type ConnectedSite } from "@/lib/site-context";

const KPIS = [
  { label: "Profile Views", value: "28,410", delta: 16.2, icon: Eye, from: "#a78bfa", to: "#ec4899" },
  { label: "Calls", value: "482", delta: 22.1, icon: Phone, from: "#22d3ee", to: "#3b82f6" },
  { label: "Directions", value: "1,204", delta: 14.3, icon: Navigation, from: "#34d399", to: "#14b8a6" },
  { label: "Reviews (4.8★)", value: "312", delta: 5.9, icon: Star, from: "#fbbf24", to: "#f97316" },
];

const QUERIES = [
  { q: "cleaning services near me", views: 4820, action: 312 },
  { q: "deep cleaning dubai marina", views: 3910, action: 268 },
  { q: "aks cleaning", views: 2840, action: 421 },
  { q: "sofa shampoo dubai", views: 2120, action: 148 },
  { q: "maid service difc", views: 1780, action: 122 },
  { q: "villa cleaning jvc", views: 1420, action: 98 },
];

const ACTIONS = [
  { name: "Website visits", value: 1840, pct: 62 },
  { name: "Calls", value: 482, pct: 22 },
  { name: "Direction requests", value: 1204, pct: 41 },
  { name: "Messages", value: 168, pct: 12 },
];

const REVIEWS = [
  { author: "Sara A.", rating: 5, text: "Team was punctual, thorough and left our villa spotless. Booking again!", when: "2d ago" },
  { author: "Omar H.", rating: 5, text: "Great sofa shampoo service — stains completely gone.", when: "5d ago" },
  { author: "Priya R.", rating: 4, text: "Very professional. Would love a slightly earlier morning slot next time.", when: "1w ago" },
  { author: "Ahmed K.", rating: 5, text: "Booked move-out cleaning, landlord returned full deposit. Highly recommend.", when: "2w ago" },
];

const PHOTOS = [
  { name: "Owner photos", views: 6420, delta: 12.1 },
  { name: "Customer photos", views: 3810, delta: 24.6 },
];

const TREND = [
  { w: "W1", views: 1620, calls: 24 },
  { w: "W2", views: 1810, calls: 28 },
  { w: "W3", views: 1740, calls: 26 },
  { w: "W4", views: 2010, calls: 32 },
  { w: "W5", views: 2180, calls: 36 },
  { w: "W6", views: 2340, calls: 40 },
  { w: "W7", views: 2410, calls: 42 },
  { w: "W8", views: 2620, calls: 46 },
  { w: "W9", views: 2510, calls: 44 },
  { w: "W10", views: 2740, calls: 48 },
  { w: "W11", views: 2910, calls: 52 },
  { w: "W12", views: 3120, calls: 58 },
];

export function BusinessProfileDrilldown({ site }: { site?: ConnectedSite }) {
  return (
    <div className="space-y-6">
      {/* Consolidated GBP Header Banner Widget */}
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-950/40 via-slate-900/60 to-slate-950 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-violet-400/30 bg-violet-400/10 text-violet-300">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">
                  Google Business Profile
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                  GMB Location Active
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">
                Local Presence &amp; Customer Actions
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Maps impressions, direct phone calls, direction requests, and review sentiment for{" "}
                <span className="font-semibold text-slate-200">{site?.label || "Safaeewala Cleaning Services"} (Dubai, UAE)</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 font-semibold focus:outline-none cursor-pointer">
              <option>Last 28 days</option>
              <option>Last 7 days</option>
              <option>Last 90 days</option>
            </select>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition cursor-pointer">
              <Download className="h-3.5 w-3.5" /> Export Report
            </button>
          </div>
        </div>
      </div>

        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {KPIS.map((k) => {
            const Icon = k.icon;
            const up = k.delta >= 0;
            return (
              <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px"
                  style={{ background: `linear-gradient(to right, ${k.from}, ${k.to})` }}
                />
                <div className="flex items-center justify-between">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-950"
                    style={{ background: `linear-gradient(135deg, ${k.from}, ${k.to})` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-emerald-300" : "text-rose-300"}`}>
                    {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(k.delta)}%
                  </div>
                </div>
                <div className="mt-3 text-xs uppercase tracking-wider text-slate-500">{k.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-white">{k.value}</div>
              </div>
            );
          })}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Profile Views vs Calls</div>
              <div className="text-[11px] text-slate-500">Weekly trend · last 12 weeks</div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Views</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Calls</span>
            </div>
          </div>
          <DualChart data={TREND} />
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Top Search Queries</div>
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Query</th>
                    <th className="px-3 py-2 text-right font-medium">Profile Views</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {QUERIES.map((q) => (
                    <tr key={q.q} className="hover:bg-slate-900/60 transition">
                      <td className="px-3 py-2 text-slate-200">{q.q}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{q.views.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{q.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="text-sm font-semibold text-white">Customer Actions</div>
            <div className="mt-4 space-y-3">
              {ACTIONS.map((a) => (
                <div key={a.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-200">{a.name}</span>
                    <span className="tabular-nums text-slate-400">{a.value.toLocaleString()}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${a.pct}%`, background: "linear-gradient(to right, #a78bfa, #ec4899)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <Camera className="h-3.5 w-3.5 text-slate-400" /> Photo Views
              </div>
              <div className="space-y-2 text-xs">
                {PHOTOS.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-slate-300">
                    <span>{p.name}</span>
                    <span className="tabular-nums text-slate-400">
                      {p.views.toLocaleString()} <span className="text-emerald-300 font-medium">+{p.delta}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Recent Reviews</div>
              <div className="text-[11px] text-slate-500">Overall rating 4.8 · 312 reviews</div>
            </div>
            <MessageSquare className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {REVIEWS.map((r) => (
              <div key={r.author} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-slate-200">{r.author}</div>
                  <div className="text-[10px] text-slate-500">{r.when}</div>
                </div>
                <div className="mt-1 flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-slate-700"}`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MapPin className="h-4 w-4 text-fuchsia-300" /> Location
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Business Bay, Dubai · Serving Dubai Marina, JLT, DIFC, JVC and surrounding areas.
          </p>
        </section>

      </div>
  );
}

function DualChart({ data }: { data: { w: string; views: number; calls: number }[] }) {
  const w = 800;
  const h = 220;
  const pad = 30;
  const maxV = Math.max(...data.map((d) => d.views));
  const maxC = Math.max(...data.map((d) => d.calls));
  const step = (w - pad * 2) / (data.length - 1);
  const yV = (v: number) => h - pad - (v / maxV) * (h - pad * 2);
  const yC = (v: number) => h - pad - (v / maxC) * (h - pad * 2);
  const lineV = data.map((d, i) => `${i === 0 ? "M" : "L"} ${pad + i * step},${yV(d.views)}`).join(" ");
  const lineC = data.map((d, i) => `${i === 0 ? "M" : "L"} ${pad + i * step},${yC(d.calls)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full">
      <defs>
        <linearGradient id="bp-v" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e879f9" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#e879f9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${lineV} L ${pad + (data.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`} fill="url(#bp-v)" />
      <path d={lineV} fill="none" stroke="#e879f9" strokeWidth="2" />
      <path d={lineC} fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 3" />
      {data.map((d, i) => (
        <text key={d.w} x={pad + i * step} y={h - 8} textAnchor="middle" fontSize="9" fill="#64748b">
          {d.w}
        </text>
      ))}
    </svg>
  );
}
