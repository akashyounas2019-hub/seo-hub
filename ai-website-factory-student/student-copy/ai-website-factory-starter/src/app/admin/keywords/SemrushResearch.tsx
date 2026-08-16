"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  runSemrushResearch,
  saveResearchSession,
  getResearchHistory,
  getResearchSession,
  addResearchedKeywords,
} from "@/app/actions/semrush";
import {
  getKeywordLists,
  createKeywordList,
  saveKeywordsToList,
} from "@/app/actions/keyword-lists";
import {
  INTENT_META,
  INTENT_ORDER,
  type KeywordIntent,
  type SemrushKeyword,
  type SemrushResult,
} from "@/lib/semrush";

const DBS = [
  ["ae", "United Arab Emirates"],
  ["sa", "Saudi Arabia"],
  ["us", "United States"],
  ["uk", "United Kingdom"],
  ["au", "Australia"],
];

/** Arabic-speaking SEMrush markets — used by the Keyword Tracker's Arabic research tab. */
export const ARABIC_DBS = [
  ["ae", "United Arab Emirates"],
  ["sa", "Saudi Arabia"],
  ["eg", "Egypt"],
  ["qa", "Qatar"],
  ["kw", "Kuwait"],
  ["bh", "Bahrain"],
  ["om", "Oman"],
  ["jo", "Jordan"],
  ["ma", "Morocco"],
];

const TONE: Record<string, string> = {
  success: "bg-success-tint text-success border-success/30",
  warning: "bg-warning-tint text-warning border-warning/30",
  info: "bg-info-tint text-info border-info/30",
  accent: "bg-accent-tint text-accent border-accent/30",
};
const BAR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  accent: "bg-accent",
};

function IntentBadge({ intent, exact }: { intent: KeywordIntent; exact?: boolean }) {
  const m = INTENT_META[intent];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[m.tone]}`}
      title={exact === false ? "Estimated from the keyword text (SEMrush had no intent for it)" : "From SEMrush keyword intent"}
    >
      {m.label}
      {exact === false ? <span className="opacity-60">~</span> : null}
    </span>
  );
}

/** Volume-weighted dominant intent of a set of keywords. */
function dominantIntent(kws: SemrushKeyword[]): KeywordIntent {
  const score = new Map<KeywordIntent, number>();
  for (const k of kws) score.set(k.intent, (score.get(k.intent) ?? 0) + Math.max(1, k.volume ?? 1));
  let best: KeywordIntent = "transactional";
  let bestN = -1;
  for (const i of INTENT_ORDER) {
    const n = score.get(i) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  return best;
}

type HistoryItem = { id: string; seed: string; database: string; resultCount: number; createdAt: Date };

export function SemrushResearch({
  configured,
  sites,
  dbs = DBS,
  defaultDb = "ae",
  rtl = false,
  title = "Keyword research",
  subtitle = "Live SEMrush data — grouped by search intent so you plan content the right way.",
}: {
  configured: boolean;
  sites?: { id: string; name: string }[];
  dbs?: string[][];
  defaultDb?: string;
  rtl?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [seed, setSeed] = useState("");
  const [database, setDatabase] = useState(defaultDb);
  const [res, setRes] = useState<SemrushResult | null>(null);
  const [filter, setFilter] = useState<KeywordIntent | null>(null);
  const [pending, start] = useTransition();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackSiteId, setTrackSiteId] = useState("");
  const [trackMsg, setTrackMsg] = useState("");
  const [kwLists, setKwLists] = useState<{ id: string; name: string }[]>([]);
  const [saveListId, setSaveListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [listMsg, setListMsg] = useState("");

  const loadHistory = useCallback(() => {
    getResearchHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    getKeywordLists().then((lists) => setKwLists(lists.map((l) => ({ id: l.id, name: l.name })))).catch(() => {});
  }, []);

  function go() {
    if (!seed.trim()) return;
    setFilter(null);
    setSelected(new Set());
    start(async () => {
      const result = await runSemrushResearch(seed, database);
      setRes(result);
      if (result.ok) {
        await saveResearchSession(seed, database, result);
        loadHistory();
      }
    });
  }

  function loadSession(id: string) {
    start(async () => {
      const session = await getResearchSession(id);
      if (session) {
        setRes(session);
        setSeed(session.seed);
        setSelected(new Set());
      }
    });
  }

  function toggleKeyword(kw: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw); else next.add(kw);
      return next;
    });
  }

  async function trackSelected() {
    if (!trackSiteId || selected.size === 0) return;
    const kws = Array.from(selected).map((kw) => ({ keyword: kw }));
    const result = await addResearchedKeywords(trackSiteId, kws, database);
    setTrackMsg(result.ok ? `Added ${result.added} keywords for tracking` : result.error ?? "Error");
    setSelected(new Set());
    setTimeout(() => setTrackMsg(""), 3000);
  }

  async function saveToList() {
    if (selected.size === 0) return;
    let targetId = saveListId;
    if (targetId === "__new" && newListName.trim()) {
      const r = await createKeywordList(newListName.trim());
      if (!r.ok || !r.id) { setListMsg(r.error ?? "Error"); return; }
      targetId = r.id;
      setKwLists((prev) => [...prev, { id: targetId, name: newListName.trim() }]);
      setSaveListId(targetId);
      setNewListName("");
    }
    if (!targetId || targetId === "__new") return;
    const kws = Array.from(selected).map((kw) => {
      const full = res?.keywords.find((k) => k.keyword === kw);
      return { keyword: kw, volume: full?.volume ?? undefined, difficulty: full?.difficulty ?? undefined, cpc: full?.cpc ?? undefined, intent: full?.intent };
    });
    const result = await saveKeywordsToList(targetId, kws);
    setListMsg(result.ok ? `Saved ${result.added} keywords to list` : result.error ?? "Error");
    setSelected(new Set());
    setTimeout(() => setListMsg(""), 3000);
  }

  // Per-intent rollup: count + total volume + opportunity.
  const mix = useMemo(() => {
    const m = new Map<KeywordIntent, { count: number; vol: number }>();
    for (const i of INTENT_ORDER) m.set(i, { count: 0, vol: 0 });
    for (const k of res?.keywords ?? []) {
      const e = m.get(k.intent)!;
      e.count += 1;
      e.vol += k.volume ?? 0;
    }
    return m;
  }, [res]);

  const total = res?.keywords.length ?? 0;
  const shown = (res?.keywords ?? []).filter((k) => !filter || k.intent === filter);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tightish text-text">{title}</h2>
          <p className="text-xs text-text-faint">{subtitle}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${configured ? "bg-success-tint text-success" : "bg-warning-tint text-warning"}`}>
          {configured ? "SEMrush connected" : "SEMrush key not set"}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1">
          <label className="mb-1 block text-xs text-text-faint">Seed keyword</label>
          <input
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-md text-text"
            placeholder="e.g. cleaning service dubai"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-faint">Country</label>
          <select
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-md text-text"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
          >
            {dbs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button
          onClick={go}
          disabled={pending || !configured || !seed.trim()}
          className="rounded-md bg-accent px-4 py-2 text-md font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Researching…" : "Research"}
        </button>
      </div>

      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {historyOpen ? "▾ Hide past searches" : "▸ Past searches"} ({history.length})
          </button>
          {historyOpen && (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-surface-2 p-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => loadSession(h.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-surface-3"
                >
                  <span className="font-medium text-text">{h.seed}</span>
                  <span className="text-text-faint">
                    {dbs.find(([v]) => v === h.database)?.[1] ?? h.database} · {h.resultCount} kw · {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-tint p-3">
          <span className="text-sm font-medium text-text">{selected.size} keywords selected</span>
          {sites && sites.length > 0 && (
            <select
              value={trackSiteId}
              onChange={(e) => setTrackSiteId(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="">Select site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={trackSelected}
            disabled={!trackSiteId}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            Track {selected.size} keywords
          </button>
          <span className="mx-1 text-text-faint">|</span>
          <select
            value={saveListId}
            onChange={(e) => setSaveListId(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          >
            <option value="">Save to list…</option>
            {kwLists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
            <option value="__new">+ New list</option>
          </select>
          {saveListId === "__new" && (
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name"
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              onKeyDown={(e) => e.key === "Enter" && saveToList()}
            />
          )}
          <button
            type="button"
            onClick={saveToList}
            disabled={!saveListId || (saveListId === "__new" && !newListName.trim())}
            className="rounded-md bg-surface-3 px-3 py-1 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40"
          >
            Save to List
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-text-muted hover:text-text"
          >
            Clear
          </button>
          {trackMsg && <span className="text-xs text-success">{trackMsg}</span>}
          {listMsg && <span className="text-xs text-success">{listMsg}</span>}
        </div>
      )}

      {res && !res.ok && (
        <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-warning">
          {res.error || "No results."} {res.notes.length > 0 && `(${res.notes.join("; ")})`}
        </div>
      )}

      {res && res.ok && (
        <div className="space-y-5">
          <p className="text-xs text-text-faint">
            {total} keywords for “{res.seed}” ({res.db.toUpperCase()}). Opportunity = volume × (100 − difficulty) ÷ 100.
          </p>

          {/* ── Intent mix: click a card to filter ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-sm font-medium text-text">Search-intent mix</h3>
              {filter && (
                <button onClick={() => setFilter(null)} className="text-xs text-accent hover:underline">
                  Clear filter ✕
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {INTENT_ORDER.map((i) => {
                const m = INTENT_META[i];
                const e = mix.get(i)!;
                const pct = total ? Math.round((e.count / total) * 100) : 0;
                const active = filter === i;
                return (
                  <button
                    key={i}
                    onClick={() => setFilter(active ? null : i)}
                    className={`rounded-lg border p-3 text-left transition ${active ? TONE[m.tone] : "border-border bg-surface-2 hover:border-border-strong"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text">{m.label}</span>
                      <span className="text-xs tabular-nums text-text-faint">{pct}%</span>
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      {e.count} kw · {e.vol.toLocaleString()} vol
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                      <div className={`h-full ${BAR[m.tone]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 text-xs leading-snug text-text-faint">→ {m.pageType}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Keyword table (intent badge + filter) ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-text-faint">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-2 w-8" />
                  <th className="py-1.5 pr-3">Keyword</th>
                  <th className="py-1.5 pr-3 text-right">Vol</th>
                  <th className="py-1.5 pr-3 text-right">KD</th>
                  <th className="py-1.5 pr-3 text-right">CPC</th>
                  <th className="py-1.5 pr-3">Intent</th>
                  <th className="py-1.5 pr-3 text-right">Opp.</th>
                </tr>
              </thead>
              <tbody className="text-text">
                {shown.slice(0, 30).map((k) => (
                  <tr key={k.keyword} className="border-b border-border/50">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(k.keyword)}
                        onChange={() => toggleKeyword(k.keyword)}
                        className="accent-accent"
                      />
                    </td>
                    <td className="py-1.5 pr-3" dir={rtl ? "rtl" : undefined}>{k.keyword}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{k.volume ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      <span className={k.difficulty != null && k.difficulty < 35 ? "text-success" : k.difficulty != null && k.difficulty > 60 ? "text-danger" : ""}>
                        {k.difficulty ?? "—"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{k.cpc != null ? `$${k.cpc.toFixed(2)}` : "—"}</td>
                    <td className="py-1.5 pr-3"><IntentBadge intent={k.intent} exact={k.intentFromSemrush} /></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{k.opportunity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="py-4 text-center text-xs text-text-faint">No {filter ? INTENT_META[filter].label.toLowerCase() : ""} keywords in this set.</p>
            )}
          </div>

          {/* ── Clusters → page, tagged with intent + recommended page type ── */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-text">Page clusters (one cluster → one page)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {res.clusters.map((c) => {
                const di = dominantIntent(c.keywords);
                const m = INTENT_META[di];
                return (
                  <div key={c.head} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-md text-text" dir={rtl ? "rtl" : undefined}>{c.head}</span>
                      <span className="text-xs text-text-faint tabular-nums">{c.vol.toLocaleString()} vol</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <IntentBadge intent={di} />
                      <span className="text-xs text-text-muted">→ {m.pageType}</span>
                    </div>
                    <div className="mt-1.5 text-xs text-text-muted">
                      {c.keywords.slice(0, 5).map((k) => k.keyword).join(" · ")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Intent → content plan legend ── */}
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <h3 className="mb-2 text-xs font-medium text-text">How to write for each intent</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INTENT_ORDER.map((i) => {
                const m = INTENT_META[i];
                return (
                  <div key={i} className="flex gap-2.5">
                    <IntentBadge intent={i} />
                    <div className="min-w-0">
                      <div className="text-xs text-text">{m.wants}</div>
                      <div className="text-xs text-text-faint">
                        <span className="text-text-muted">{m.pageType}</span> — {m.angle}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
