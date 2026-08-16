import { TEMPLATES } from "../constants";
import type { Flow } from "../types";
import { Modal } from "./flow-editor";

export function TemplatesModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (t: (typeof TEMPLATES)[number]) => void;
}) {
  return (
    <Modal onClose={onClose} title="Start from a template">
      <p className="text-xs text-slate-400">Pick a starting point tuned for a Dubai cleaning business.</p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.name}>
              <button
                onClick={() => onPick(t)}
                className="group flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-900"
              >
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br ${t.accent} text-slate-950`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white leading-tight">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{t.desc}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
