import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, MessageSquareQuote, LayoutTemplate, Plus, Trash2, type LucideIcon } from "lucide-react";

const TABS: { to: "/resources/sops" | "/resources/prompts" | "/resources/templates"; label: string; icon: LucideIcon }[] = [
  { to: "/resources/sops", label: "SOPs", icon: BookOpen },
  { to: "/resources/prompts", label: "Prompts", icon: MessageSquareQuote },
  { to: "/resources/templates", label: "Templates", icon: LayoutTemplate },
];

export type ResourceItem = { id: string; title: string; body: string; updated: string };

export function ResourcesShell({
  kind,
  title,
  blurb,
  bodyLabel,
  bodyPlaceholder,
  seed,
}: {
  kind: string;
  title: string;
  blurb: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  seed: ResourceItem[];
}) {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const [items, setItems] = useState<ResourceItem[]>(seed);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const add = () => {
    if (!draftTitle.trim()) {
      toast.error("Give it a title first");
      return;
    }
    const item: ResourceItem = {
      id: `${kind}-${Date.now()}`,
      title: draftTitle.trim(),
      body: draftBody.trim(),
      updated: "just now",
    };
    setItems((prev) => [item, ...prev]);
    setDraftTitle("");
    setDraftBody("");
    toast.success(`Added ${kind}: ${item.title}`);
  };

  const remove = (id: string, itemTitle: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    toast(`Removed ${itemTitle}`);
  };

  return (
    <div className="min-h-full space-y-5 text-slate-200">
      <header className="rounded-2xl border border-cyan-500/25 bg-slate-950/70 p-5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">Resources</div>
        <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-slate-400">{blurb}</p>
        <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-800">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = currentPath === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-[12px] font-medium transition ${
                  active ? "border-cyan-400 text-cyan-200" : "border-transparent text-slate-400 hover:text-cyan-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Composer */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Add new {kind}
        </div>
        <div className="mt-3 grid gap-3">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder={`${kind} title`}
            className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder={bodyPlaceholder}
            rows={6}
            className="w-full resize-y rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{bodyLabel}</span>
            <button
              onClick={add}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-400 to-blue-500 px-3.5 py-1.5 text-[12px] font-semibold text-slate-950 hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> Add {kind}
            </button>
          </div>
        </div>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
            {title} library
          </div>
          <span className="text-[11px] text-slate-500">{items.length} total</span>
        </header>
        <ul className="divide-y divide-slate-800/80">
          {items.map((it) => (
            <li key={it.id} className="group flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-semibold text-white">{it.title}</div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {it.updated}
                  </span>
                </div>
                {it.body && (
                  <p className="mt-1 whitespace-pre-line text-[12px] text-slate-400 line-clamp-4">
                    {it.body}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(it.id, it.title)}
                className="grid h-7 w-7 place-items-center rounded-md border border-slate-800 bg-slate-900/60 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:border-rose-400/40 hover:text-rose-300"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-[12px] text-slate-500">
              No {kind}s yet — add your first above.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
