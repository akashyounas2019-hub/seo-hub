/**
 * Minimal Markdown → HTML for the build workspace.
 *
 * We don't pull in a heavy library (marked / unified) — the generated
 * pages have predictable structure (H1/H2/H3, paragraphs, lists, tables,
 * links, basic emphasis). 200 lines is enough.
 *
 * If we later need GFM tables / footnotes / strikethrough, swap in
 * `marked` — the call site is one function.
 */

export function markdownToHtml(md: string): string {
  if (!md) return "";

  let src = md.replace(/\r\n/g, "\n");

  // Code fences first (so we don't mangle their content)
  const codeBlocks: string[] = [];
  src = src.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(
      `<pre class="md-pre"><code class="md-code lang-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`,
    );
    return `@@CODE${i}@@`;
  });

  // Tables (GFM-flavored)
  src = src.replace(/(?:^|\n)((?:\|.*\|\s*\n)+)/g, (match) => {
    const rows = match.trim().split("\n").map((r) =>
      r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()),
    );
    if (rows.length < 2) return match;
    const isSeparator = rows[1].every((c) => /^:?-+:?$/.test(c));
    if (!isSeparator) return match;
    const header = rows[0];
    const body = rows.slice(2);
    const ths = header.map((c) => `<th>${inline(c)}</th>`).join("");
    const trs = body
      .map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>")
      .join("");
    return `\n<table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>\n`;
  });

  // Headings
  src = src.replace(/^######\s+(.+)$/gm, (_, t) => `<h6>${inline(t)}</h6>`);
  src = src.replace(/^#####\s+(.+)$/gm,  (_, t) => `<h5>${inline(t)}</h5>`);
  src = src.replace(/^####\s+(.+)$/gm,   (_, t) => `<h4>${inline(t)}</h4>`);
  src = src.replace(/^###\s+(.+)$/gm,    (_, t) => `<h3>${inline(t)}</h3>`);
  src = src.replace(/^##\s+(.+)$/gm,     (_, t) => `<h2>${inline(t)}</h2>`);
  src = src.replace(/^#\s+(.+)$/gm,      (_, t) => `<h1>${inline(t)}</h1>`);

  // Blockquotes
  src = src.replace(/^(?:>\s?.*\n?)+/gm, (block) => {
    const inner = block
      .split("\n")
      .map((l) => l.replace(/^>\s?/, ""))
      .filter(Boolean)
      .join(" ");
    return `<blockquote class="md-quote">${inline(inner)}</blockquote>\n`;
  });

  // Unordered lists (run of contiguous - * + bullets)
  src = src.replace(/(?:^|\n)((?:[-*+]\s+.+\n?)+)/g, (match, body) => {
    const items = body
      .trim()
      .split("\n")
      .map((l: string) => l.replace(/^[-*+]\s+/, "").trim())
      .filter(Boolean);
    return "\n<ul class=\"md-ul\">" + items.map((i: string) => `<li>${inline(i)}</li>`).join("") + "</ul>\n";
  });

  // Ordered lists
  src = src.replace(/(?:^|\n)((?:\d+\.\s+.+\n?)+)/g, (match, body) => {
    const items = body
      .trim()
      .split("\n")
      .map((l: string) => l.replace(/^\d+\.\s+/, "").trim())
      .filter(Boolean);
    return "\n<ol class=\"md-ol\">" + items.map((i: string) => `<li>${inline(i)}</li>`).join("") + "</ol>\n";
  });

  // Horizontal rule
  src = src.replace(/^[-*_]{3,}$/gm, "<hr class=\"md-hr\" />");

  // Paragraphs — split on blank lines + wrap raw text blocks
  const blocks = src.split(/\n{2,}/).map((block) => {
    if (/^\s*<(h[1-6]|ul|ol|table|blockquote|pre|hr)/i.test(block.trim())) return block;
    if (/^@@CODE\d+@@$/.test(block.trim())) return block;
    return `<p class="md-p">${inline(block.replace(/\n/g, " ").trim())}</p>`;
  });
  let html = blocks.join("\n");

  // Restore code blocks
  html = html.replace(/@@CODE(\d+)@@/g, (_, i) => codeBlocks[Number(i)] ?? "");

  return html;
}

function inline(text: string): string {
  if (!text) return "";
  // Order matters: escape first, then markdown.
  let s = escapeHtml(text);
  // Code spans
  s = s.replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>');
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic
  s = s.replace(/(?<![*])\*([^*\n]+)\*(?![*])/g, "<em>$1</em>");
  s = s.replace(/(?<![_])_([^_\n]+)_(?![_])/g, "<em>$1</em>");
  // Links
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, label, url, title) =>
      `<a href="${url}" class="md-link"${title ? ` title="${title}"` : ""}>${label}</a>`,
  );
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
