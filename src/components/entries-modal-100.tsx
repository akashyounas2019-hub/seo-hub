import { useState, useMemo } from "react";
import { X, Search, Download, ArrowUpRight, ArrowDownRight, Globe, Filter } from "lucide-react";

export type ModalEntry = {
  id: string;
  title: string;
  sub?: string;
  clicks: number;
  imp: number;
  ctr: number;
  pos: number;
  delta: number;
};

interface EntriesModal100Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  type: "keywords" | "pages" | "movers";
  entries: ModalEntry[];
}

export function EntriesModal100({
  isOpen,
  onClose,
  title,
  subtitle,
  type,
  entries,
}: EntriesModal100Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"clicks" | "imp" | "ctr" | "pos" | "delta">("clicks");
  const [sortAsc, setSortAsc] = useState(false);

  const filteredAndSortedEntries = useMemo(() => {
    let result = entries;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (e) => e.title.toLowerCase().includes(term) || (e.sub && e.sub.toLowerCase().includes(term))
      );
    }

    return [...result].sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (sortField === "pos") {
        // Lower position number is better
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc ? va - vb : vb - va;
    });
  }, [entries, searchTerm, sortField, sortAsc]);

  if (!isOpen) return null;

  const handleExportCSV = () => {
    const headers = ["Index", "Query/URL", "Clicks", "Impressions", "CTR (%)", "Position", "Delta (%)"];
    const rows = filteredAndSortedEntries.map((e, idx) => [
      idx + 1,
      `"${e.title.replace(/"/g, '""')}"`,
      e.clicks,
      e.imp,
      e.ctr,
      e.pos,
      e.delta,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${title.toLowerCase().replace(/ /g, "_")}_100_entries.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: "clicks" | "imp" | "ctr" | "pos" | "delta") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative flex flex-col w-full max-w-5xl max-h-[90vh] rounded-2xl border border-cyan-500/30 bg-slate-950/95 shadow-[0_0_60px_rgba(34,211,238,0.2)] backdrop-blur-2xl text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4 bg-slate-900/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300 uppercase tracking-widest">
                Expanded View · Up to 100 Recent Entries
              </span>
              <span className="text-xs text-slate-400">({filteredAndSortedEntries.length} items)</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-3 border-b border-slate-800/80 px-6 py-3 bg-slate-950/80">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder={`Search through ${entries.length} recent entries...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <tr>
                <th className="py-2.5 font-medium w-12 text-center">#</th>
                <th className="py-2.5 font-medium">{type === "pages" ? "URL Path" : "Search Query"}</th>
                <th
                  onClick={() => toggleSort("clicks")}
                  className="py-2.5 font-medium text-right cursor-pointer hover:text-cyan-300 select-none"
                >
                  Clicks {sortField === "clicks" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("imp")}
                  className="py-2.5 font-medium text-right cursor-pointer hover:text-cyan-300 select-none"
                >
                  Impressions {sortField === "imp" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("ctr")}
                  className="py-2.5 font-medium text-right cursor-pointer hover:text-cyan-300 select-none"
                >
                  CTR {sortField === "ctr" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("pos")}
                  className="py-2.5 font-medium text-right cursor-pointer hover:text-cyan-300 select-none"
                >
                  Position {sortField === "pos" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => toggleSort("delta")}
                  className="py-2.5 font-medium text-right cursor-pointer hover:text-cyan-300 select-none"
                >
                  Period Delta {sortField === "delta" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11.5px]">
              {filteredAndSortedEntries.map((e, idx) => {
                const up = e.delta >= 0;
                return (
                  <tr key={e.id || idx} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 text-center text-slate-500 font-sans text-xs">{idx + 1}</td>
                    <td className="py-2.5 font-sans font-medium text-slate-200 truncate max-w-md">
                      <div className="flex items-center gap-1.5">
                        {type === "pages" && <Globe className="h-3 w-3 shrink-0 text-slate-500" />}
                        <span>{e.title}</span>
                      </div>
                      {e.sub && <div className="text-[10px] text-slate-500 font-normal">{e.sub}</div>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-200">{e.clicks.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-400">{e.imp.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums text-cyan-300 font-semibold">{e.ctr}%</td>
                    <td className="py-2.5 text-right tabular-nums text-amber-300 font-semibold">#{e.pos}</td>
                    <td className="py-2.5 text-right tabular-nums font-sans">
                      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                        up ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                      }`}>
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {up ? "+" : ""}{e.delta}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3 bg-slate-950 text-xs text-slate-400">
          <span>Showing {filteredAndSortedEntries.length} of {entries.length} recent entries</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
