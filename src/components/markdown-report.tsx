import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders real Markdown (headings, tables, lists, bold/italic, code) as
 * actual HTML instead of a raw <pre> text dump. This is a pure client-side
 * parse -- react-markdown + remark-gfm turn the same outputMarkdown string
 * the model already returned into structured DOM, no extra model call and
 * no extra tokens. Asking the model itself to emit more structure (more
 * headings/tables/sections) is a separate, real cost -- see the note this
 * component's callers surface to the user.
 */
/**
 * Presentational classes below are real Tailwind utility styling applied to
 * whatever structure the model's own Markdown already contains (headings,
 * tables, lists, code) -- no data is added or altered, this only changes how
 * the existing real content is typeset so 17 tools' worth of dense reports
 * are actually readable instead of default browser Markdown styling.
 */
export function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="markdown-report max-w-none text-sm leading-relaxed text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mt-6 mb-3 border-b border-slate-800 pb-2 text-xl font-bold text-white first:mt-0" {...p} />,
          h2: (p) => <h2 className="mt-6 mb-2.5 text-lg font-semibold text-cyan-200 first:mt-0" {...p} />,
          h3: (p) => <h3 className="mt-4 mb-2 text-[15px] font-semibold text-slate-100" {...p} />,
          p: (p) => <p className="my-2.5 text-slate-300" {...p} />,
          ul: (p) => <ul className="my-2.5 ml-5 list-disc space-y-1 text-slate-300 marker:text-cyan-400" {...p} />,
          ol: (p) => <ol className="my-2.5 ml-5 list-decimal space-y-1 text-slate-300 marker:text-cyan-400" {...p} />,
          li: (p) => <li className="pl-1" {...p} />,
          strong: (p) => <strong className="font-semibold text-white" {...p} />,
          a: (p) => <a className="text-cyan-300 underline decoration-cyan-700 underline-offset-2 hover:text-cyan-200" target="_blank" rel="noreferrer" {...p} />,
          blockquote: (p) => (
            <blockquote className="my-3 rounded-r-md border-l-2 border-cyan-500/50 bg-cyan-500/5 py-2 pl-4 pr-2 text-slate-300 italic" {...p} />
          ),
          hr: () => <hr className="my-6 border-slate-800" />,
          code: (p: any) =>
            p.inline ? (
              <code className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[12px] text-cyan-200" {...p} />
            ) : (
              <code className="block overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[12px] text-slate-200" {...p} />
            ),
          pre: (p) => <pre className="my-3 overflow-x-auto rounded-lg border border-slate-800 bg-black/60" {...p} />,
          table: (p) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full border-collapse text-[13px]" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-slate-900/80" {...p} />,
          th: (p) => <th className="border-b border-slate-800 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-cyan-200" {...p} />,
          td: (p) => <td className="border-b border-slate-900 px-3 py-2 align-top text-slate-300" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
