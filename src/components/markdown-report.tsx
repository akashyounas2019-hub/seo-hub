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
export function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="markdown-report max-w-none text-sm text-slate-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
