import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AKS SEO Console" },
      { name: "description", content: "Workspace, billing, and integration settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Manage your workspace preferences.</p>
        <div className="mt-8 space-y-4">
          {[
            { l: "Workspace name", v: "AKS SEO" },
            { l: "Timezone", v: "UTC" },
            { l: "Default model", v: "gpt-4o" },
            { l: "Notifications", v: "Email + Slack" },
          ].map((r) => (
            <div key={r.l} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
              <div className="text-sm text-slate-300">{r.l}</div>
              <div className="text-sm text-white">{r.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
