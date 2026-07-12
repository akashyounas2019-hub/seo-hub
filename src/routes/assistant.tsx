import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Send, Sparkles, Zap } from "lucide-react";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant — AKS SEO Console" },
      { name: "description", content: "Chat with your AKS agent operator." },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; text: string };

function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Hi Ahmed — ready when you are. Ask me anything about your fleet, sites, or SEO ops." },
  ]);
  const [input, setInput] = useState("");

  function send() {
    if (!input.trim()) return;
    setMsgs((m) => [
      ...m,
      { role: "user", text: input },
      { role: "assistant", text: "Got it. I'll route that to the right scout and report back." },
    ]);
    setInput("");
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <Bot className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Assistant</h1>
            <p className="text-sm text-slate-400">Role-aware · reads memory · dispatches agents</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
          </span>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="mb-4 space-y-3 max-h-[52vh] overflow-y-auto pr-1">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "bg-cyan-500/20 text-cyan-50 ring-1 ring-cyan-400/30" : "bg-slate-900 text-slate-200 ring-1 ring-slate-800"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about a site, a rank drop, an agent…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
            />
            <button onClick={send} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { t: "Explain today's traffic dip", i: Zap },
            { t: "Draft outreach for 5 prospects", i: Sparkles },
            { t: "Audit the newest site", i: Bot },
          ].map((q) => (
            <button key={q.t} onClick={() => setInput(q.t)} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left text-xs text-slate-300 hover:border-cyan-400/40 hover:text-white">
              <q.i className="mb-1.5 h-4 w-4 text-cyan-300" />
              {q.t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
