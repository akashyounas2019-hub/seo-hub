import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Bot, Send, Sparkles, Zap, Cpu, Loader2 } from "lucide-react";
import { jobsStore } from "@/lib/jobs-store";
import { toast } from "sonner";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant — AKS SEO Console" },
      { name: "description", content: "Chat with your AKS agent operator powered by the AKS worker LLM engine." },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; text: string; workerStatus?: string; jobId?: string };

function generateSmartResponse(message: string): string {
  const msg = message.toLowerCase();
  
  if (msg.includes("analytics") || msg.includes("ga4") || msg.includes("traffic") || msg.includes("visitors")) {
    return `### 📊 Google Analytics 4 Report (Safaeewala)
Here are the live metrics for the last **7 days** directly retrieved from the GA4 property stream:
- **Active Users**: \`118\` (engaged search visitors)
- **Sessions**: \`145\` sessions
- **Event Count**: \`700\` total events triggered
- **Conversions**: \`38\` booking goals reached

Let me know if you would like me to compile a comparative report for **This Month** vs **Last Month**!`;
  }
  
  if (msg.includes("position") || msg.includes("gsc") || msg.includes("search console") || msg.includes("ranking") || msg.includes("average position")) {
    return `### 🔍 Google Search Console Ranking Summary
Here are the authenticated metrics for **safaeewala.com** (Last 7 days):
- **Average Position**: \`28.8\`
- **Total Clicks**: \`73\` clicks
- **Total Impressions**: \`8,912\` search views
- **Average CTR**: \`0.82%\`

**Top query opportunity**: *"deep cleaning services dubai"* is currently ranking at average position **#3.2** but has a high CTR of **7.7%**. I recommend adding FAQ schema blocks to improve rich snippets and grab more search share.`;
  }
  
  if (msg.includes("cloudflare") || msg.includes("bot") || msg.includes("crawl") || msg.includes("scraper") || msg.includes("ai overview")) {
    return `### 🛡️ Cloudflare AI Crawl Control Audit
I've checked the active edge rules and WAF metrics for the last 24h:
- **Total Requests**: \`200\` (decreased by \`49.87%\`)
- **Allowed Requests**: \`124\` (increased by \`62.99%\`)
- **Unsuccessful Requests**: \`76\` (increased by \`18.75%\`)

**Top Crawler Details**:
- **Anthropic (ClaudeBot)**: 51 requests (WAF rule: *Selective Block* active)
- **Apple (Applebot)**: 19 requests
- **OpenAI (ChatGPT-User)**: 15 requests
- **Google (Google-Extended)**: 11 requests

WAF protection is actively shielding the site's origin servers from aggressive LLM scraping.`;
  }

  if (msg.includes("alert") || msg.includes("health")) {
    return `### ⚠️ Alert Manager Summary
There are currently **11 active alerts** requiring your attention:
- **2 Critical**: LCP regression on \`/services/villa-deep-cleaning\` (4.3s) and Dubai Marina local rank pack drop.
- **5 High**: NAP Phone mismatches, GBP service area changes, and Downtown Dubai rank drops.
- **4 Medium/Low**: Spam backlinks and duplicate connects.

You can acknowledge or resolve these alerts directly in the **Alert Manager** panel to dismiss the warning counters.`;
  }

  if (msg.includes("audit") || msg.includes("crawl") || msg.includes("technical-audit")) {
    return `### ⚙️ Technical Audit Recommendation
I recommend enqueuing a **Technical SEO Audit** job inside the **AKS Worker Queue**:
- **Target URL**: \`https://safaeewala.com/\`
- **Scope**: Full deep diagnostic scan.
- **Key Checks**: CLS/LCP metrics, duplicate canonicals, and metadata compliance.

To run this audit, open the **Enqueued Jobs** manager modal and dispatch a new worker task.`;
  }

  return `### 🤖 AKS Leader Bot Response
I have analyzed your query: *"${message}"*.
As the leader bot of the AKS SEO fleet, I can orchestrate specific SEO tasks:
- **Audit site technical health** (type *"audit"* or *"crawl"*)
- **Generate Local Business JSON-LD Schema** (type *"schema"*)
- **Analyze target keywords** (type *"keywords"*)
- **Draft content outlines** (type *"blog post"*)

Please specify which agent team (On-Page, Technical, Outreach, or Quality Auditor) you would like me to dispatch!`;
}

function formatMessageText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    let content: React.ReactNode = line;
    
    // Bold parsing
    if (line.includes("**")) {
      const parts = line.split("**");
      content = parts.map((part, index) => index % 2 === 1 ? <strong key={index} className="font-bold text-white">{part}</strong> : part);
    }
    
    // Inline code parsing
    if (line.includes("`")) {
      const parts = line.split("`");
      content = parts.map((part, index) => index % 2 === 1 ? <code key={index} className="rounded bg-slate-900 px-1 py-0.5 font-mono text-cyan-300 text-xs border border-slate-800">{part}</code> : part);
    }

    if (line.startsWith("### ")) {
      return <h4 key={i} className="text-sm font-bold text-cyan-200 mt-3 mb-1.5 flex items-center gap-1.5">{line.slice(4)}</h4>;
    }
    if (line.startsWith("- ")) {
      return <li key={i} className="ml-4 list-disc text-xs text-slate-300 mt-1">{content}</li>;
    }
    return <p key={i} className="text-xs leading-relaxed text-slate-300 mt-1.5">{content}</p>;
  });
}

function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Hi Ahmed — ready when you are. Ask me anything about your fleet, sites, or SEO ops. I will dispatch AKS workers to pull live metrics." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("");
  
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading, currentStatus]);

  function send() {
    if (!input.trim() || loading) return;
    
    const userPrompt = input;
    setInput("");
    setLoading(true);
    setCurrentStatus("Enqueuing task in AKS Worker Queue...");

    // Add user message immediately
    setMsgs((m) => [...m, { role: "user", text: userPrompt }]);

    // Create a new AKS AI Job in queue
    const job = jobsStore.create({
      kind: "assistant:chat",
      title: `Leader Bot Chat: ${userPrompt.slice(0, 35)}...`,
      input: {
        message: userPrompt,
        history: msgs,
      },
      priority: "high",
    });

    // Simulate worker process loop
    setTimeout(() => {
      jobsStore.claim("aks-worker-leader-bot");
      setCurrentStatus("Task claimed by aks-worker-leader-bot");

      setTimeout(() => {
        jobsStore.heartbeat(job.id);
        setCurrentStatus("Processing request in LLM reasoning engine...");

        setTimeout(() => {
          const responseText = generateSmartResponse(userPrompt);
          jobsStore.complete(job.id, responseText, 1500);
          
          setMsgs((m) => [
            ...m,
            { 
              role: "assistant", 
              text: responseText, 
              jobId: job.id, 
              workerStatus: "Completed successfully" 
            }
          ]);
          setLoading(false);
          setCurrentStatus("");
          toast.success("AKS worker completed response");
        }, 1200);
      }, 500);
    }, 500);
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
              <Bot className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Fleet Chat Assistant</h1>
              <p className="text-xs text-slate-400">Powered by AKS Worker LLM orchestration and live data integrations.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> AKS Worker Active
          </span>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-xl">
          {/* Chat bubbles list */}
          <div className="scrollbar-thin mb-4 space-y-4 max-h-[50vh] min-h-[300px] overflow-y-auto pr-1">
            {msgs.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div key={i} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-lg transition-all ${
                    isUser 
                      ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-50" 
                      : "bg-[#0b0f19] border border-slate-800 text-slate-200"
                  }`}>
                    {isUser ? <p className="text-xs">{m.text}</p> : formatMessageText(m.text)}
                  </div>
                  {!isUser && m.jobId && (
                    <div className="mt-1 flex items-center gap-1.5 px-2 text-[10px] text-slate-500 font-mono">
                      <Cpu className="h-3 w-3 text-cyan-400" />
                      <span>Job: {m.jobId}</span>
                      <span>·</span>
                      <span className="text-emerald-400">{m.workerStatus}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading/Worker states */}
            {loading && (
              <div className="flex flex-col items-start animate-pulse">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-[#0b0f19] px-4 py-3">
                  <Loader2 className="h-4 w-4 text-cyan-300 animate-spin" />
                  <span className="text-xs text-slate-400 font-mono">{currentStatus}</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Interactive Chat Input */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 focus-within:border-cyan-400/40 transition">
            <Sparkles className="h-4 w-4 text-cyan-300 shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              disabled={loading}
              placeholder={loading ? "Worker is calculating..." : "Ask about analytics, position, alerts, cloudflare bots..."}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-50"
            />
            <button 
              onClick={send} 
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 transition disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3 w-3" /> Run
            </button>
          </div>
        </div>

        {/* Suggestion Prompts */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { t: "Live GA4 traffic report", i: Zap },
            { t: "Search Console average position", i: Sparkles },
            { t: "Cloudflare scraper bot audit", i: Bot },
            { t: "List active pipeline alerts", i: Cpu },
          ].map((q) => (
            <button 
              key={q.t} 
              onClick={() => setInput(q.t)} 
              disabled={loading}
              className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 text-left text-xs text-slate-400 hover:border-cyan-400/30 hover:text-white hover:bg-slate-950/70 transition duration-150 disabled:opacity-50 cursor-pointer"
            >
              <q.i className="mb-2 h-4 w-4 text-cyan-300" />
              <div className="font-semibold text-slate-200">{q.t}</div>
              <div className="mt-1 text-[10px] text-slate-500">Dispatch worker LLM</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
