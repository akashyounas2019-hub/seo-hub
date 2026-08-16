/**
 * NeedsConfigTable — quarantined agents that aren't ready for the hero row.
 *
 * An agent is "configured" iff isActive && skill_instructions is non-empty
 * && capabilityCount > 0. Anything failing lands here with reason chips so
 * the operator can see exactly what to fix and click through to fix it.
 *
 * Rendered directly under the Agent Jobs hero on /admin/agent/jobs.
 */
import Link from "next/link";
import { AlertTriangle, PowerOff, FileWarning, Link2Off, ArrowUpRight } from "lucide-react";

export interface NeedsConfigRow {
  id: string;
  name: string;
  title: string;
  focus: string;
  isCustom: boolean;
  off: boolean;
  noSkills: boolean;
  noCapabilities: boolean;
}

export function NeedsConfigTable({ rows }: { rows: NeedsConfigRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-amber-400/25 bg-slate-950/40 p-5">
      <header className="mb-3 flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-md border border-amber-400/40 bg-amber-400/10 text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">
            Needs configuration ({rows.length})
          </h2>
          <p className="text-[11px] text-slate-500">
            Agents hidden from the hero until active, given skill instructions, and wired to at least one capability.
          </p>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_120px] items-center gap-3 border-b border-slate-800/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <div>Agent</div>
          <div>Reason</div>
          <div className="text-center">Type</div>
          <div className="text-right">Open</div>
        </div>
        <ul className="divide-y divide-slate-800/70">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_120px] items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-100">{r.title}</div>
                {r.focus ? (
                  <div className="truncate text-[11px] text-slate-500">{r.focus}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.off ? <ReasonChip icon={PowerOff}    label="OFF"                tone="rose"   /> : null}
                {r.noSkills ? <ReasonChip icon={FileWarning} label="No skills"      tone="amber"  /> : null}
                {r.noCapabilities ? <ReasonChip icon={Link2Off} label="No capabilities" tone="cyan"   /> : null}
              </div>
              <div className="text-center">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    r.isCustom
                      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                      : "border-slate-700 bg-slate-900/60 text-slate-300"
                  }`}
                >
                  {r.isCustom ? "Custom" : "Built-in"}
                </span>
              </div>
              <div className="text-right">
                <Link
                  href={`/admin/agent/roster/${r.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/20"
                >
                  Configure <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ReasonChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof PowerOff;
  label: string;
  tone: "rose" | "amber" | "cyan";
}) {
  const cls =
    tone === "rose"  ? "border-rose-400/40 bg-rose-500/10 text-rose-200"   :
    tone === "amber" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" :
                       "border-cyan-400/40 bg-cyan-400/10 text-cyan-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
