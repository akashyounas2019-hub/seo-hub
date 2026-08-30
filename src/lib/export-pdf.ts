// Real client-side PDF export, generated directly from the report's actual
// Markdown text -- not a DOM screenshot. An earlier version used
// html2canvas to rasterize the rendered report, but html2canvas (last
// released before oklch() existed) cannot parse the oklch()/color-mix()
// color functions Tailwind v4 emits throughout this app's CSS (src/styles.css
// defines the entire theme in oklch), so every real report hit "Could not
// generate PDF" -- confirmed via a live screenshot showing that exact
// failure on the Page Analysis tool. Laying the PDF out from the Markdown
// itself instead sidesteps CSS parsing entirely, produces a smaller/faster
// output, and gives real selectable/searchable text rather than an image.
//
// This is a small line-based Markdown renderer covering exactly the
// constructs the 17 SEO Suite tools' real outputs use (see seo-tools.ts's
// `output` field per tool: "Markdown report", "JSON-LD blocks", "Issue
// list + severity", table-shaped outputs, etc.): headings, paragraphs,
// bullet/numbered lists, fenced code blocks, GFM tables, and inline bold.
// It is not a general CommonMark implementation -- it doesn't need to be.

import type { jsPDF } from "jspdf";

const PAGE_MARGIN = 40;
const LINE_HEIGHT = 14;
const FONT_BODY = 10;
const FONT_H1 = 16;
const FONT_H2 = 13;
const FONT_H3 = 11.5;
const FONT_CODE = 8.5;

type Cursor = { y: number };

function ensureRoom(pdf: jsPDF, cursor: Cursor, needed: number, pageHeight: number) {
  if (cursor.y + needed > pageHeight - PAGE_MARGIN) {
    pdf.addPage();
    cursor.y = PAGE_MARGIN;
  }
}

/** Strips the limited inline markup we don't render specially (bold/italic markers, inline code ticks, links) down to plain text -- jsPDF's core text() has no rich-text runs, so this keeps the words without the markup noise rather than printing literal asterisks. */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function writeWrapped(pdf: jsPDF, cursor: Cursor, text: string, pageWidth: number, pageHeight: number, opts: { size?: number; color?: [number, number, number]; indent?: number } = {}) {
  const size = opts.size ?? FONT_BODY;
  const indent = opts.indent ?? 0;
  pdf.setFontSize(size);
  pdf.setTextColor(...(opts.color ?? [30, 30, 30]));
  const maxWidth = pageWidth - PAGE_MARGIN * 2 - indent;
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    ensureRoom(pdf, cursor, LINE_HEIGHT, pageHeight);
    pdf.text(line, PAGE_MARGIN + indent, cursor.y);
    cursor.y += LINE_HEIGHT * (size > FONT_BODY ? 1.15 : 1);
  }
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => stripInline(c.trim()));
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function drawTable(pdf: jsPDF, cursor: Cursor, rows: string[][], pageWidth: number, pageHeight: number) {
  if (rows.length === 0) return;
  const colCount = Math.max(...rows.map((r) => r.length));
  const tableWidth = pageWidth - PAGE_MARGIN * 2;
  const colWidth = tableWidth / colCount;
  pdf.setFontSize(FONT_BODY - 1);

  rows.forEach((row, rowIdx) => {
    const cellLines = row.map((cell) => pdf.splitTextToSize(cell, colWidth - 8) as string[]);
    const rowHeight = Math.max(...cellLines.map((l) => l.length), 1) * (LINE_HEIGHT - 3) + 6;
    ensureRoom(pdf, cursor, rowHeight, pageHeight);

    if (rowIdx === 0) {
      pdf.setFillColor(230, 230, 235);
      pdf.rect(PAGE_MARGIN, cursor.y - LINE_HEIGHT + 4, tableWidth, rowHeight, "F");
    }
    pdf.setDrawColor(200, 200, 205);
    pdf.rect(PAGE_MARGIN, cursor.y - LINE_HEIGHT + 4, tableWidth, rowHeight, "S");

    row.forEach((_, colIdx) => {
      const x = PAGE_MARGIN + colIdx * colWidth;
      if (colIdx > 0) pdf.line(x, cursor.y - LINE_HEIGHT + 4, x, cursor.y - LINE_HEIGHT + 4 + rowHeight);
      pdf.setTextColor(rowIdx === 0 ? 20 : 50, rowIdx === 0 ? 20 : 50, rowIdx === 0 ? 20 : 50);
      cellLines[colIdx].forEach((l, li) => {
        pdf.text(l, x + 4, cursor.y + li * (LINE_HEIGHT - 3));
      });
    });

    cursor.y += rowHeight;
  });
  cursor.y += 6;
}

/**
 * Renders Markdown text into a real, paginated, selectable-text PDF and
 * triggers a save. No DOM/canvas involved, so it works regardless of what
 * CSS color functions the on-screen report happens to use.
 */
export async function exportMarkdownToPdf(markdown: string, filename: string, title?: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const cursor: Cursor = { y: PAGE_MARGIN };

  if (title) {
    writeWrapped(pdf, cursor, title, pageWidth, pageHeight, { size: FONT_H1 + 2, color: [10, 10, 10] });
    cursor.y += 6;
    pdf.setDrawColor(180, 180, 190);
    pdf.line(PAGE_MARGIN, cursor.y, pageWidth - PAGE_MARGIN, cursor.y);
    cursor.y += 14;
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let tableBuffer: string[][] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableBuffer.length) drawTable(pdf, cursor, tableBuffer, pageWidth, pageHeight);
    tableBuffer = [];
    inTable = false;
  };

  const flushCode = () => {
    if (!codeBuffer.length) return;
    ensureRoom(pdf, cursor, 8, pageHeight);
    const blockText = codeBuffer.join("\n");
    pdf.setFontSize(FONT_CODE);
    const wrapped = pdf.splitTextToSize(blockText, pageWidth - PAGE_MARGIN * 2 - 16) as string[];
    const boxHeight = wrapped.length * (LINE_HEIGHT - 4) + 12;
    ensureRoom(pdf, cursor, boxHeight, pageHeight);
    pdf.setFillColor(244, 244, 247);
    pdf.setDrawColor(210, 210, 215);
    pdf.rect(PAGE_MARGIN, cursor.y - 10, pageWidth - PAGE_MARGIN * 2, boxHeight, "FD");
    pdf.setTextColor(40, 40, 45);
    let y = cursor.y;
    for (const l of wrapped) {
      pdf.text(l, PAGE_MARGIN + 8, y);
      y += LINE_HEIGHT - 4;
    }
    cursor.y = y + 8;
    codeBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (/^```/.test(line)) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(raw);
      continue;
    }

    // GFM table: a row followed by a separator row (---|---) starts a table.
    if (line.includes("|") && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      flushTable();
      inTable = true;
      tableBuffer.push(parseTableRow(line));
      i++; // skip the separator row
      continue;
    }
    if (inTable && line.includes("|")) {
      tableBuffer.push(parseTableRow(line));
      continue;
    }
    if (inTable) flushTable();

    if (line.trim() === "") {
      cursor.y += LINE_HEIGHT * 0.5;
      continue;
    }

    const h1 = /^#\s+(.*)/.exec(line);
    const h2 = /^##\s+(.*)/.exec(line);
    const h3 = /^###\s+(.*)/.exec(line);
    const hr = /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)/.exec(line);
    const blockquote = /^\s*>\s?(.*)/.exec(line);

    if (hr) {
      ensureRoom(pdf, cursor, 10, pageHeight);
      cursor.y += 4;
      pdf.setDrawColor(210, 210, 215);
      pdf.line(PAGE_MARGIN, cursor.y, pageWidth - PAGE_MARGIN, cursor.y);
      cursor.y += 10;
    } else if (h1) {
      cursor.y += 6;
      writeWrapped(pdf, cursor, stripInline(h1[1]), pageWidth, pageHeight, { size: FONT_H1, color: [15, 15, 15] });
      cursor.y += 4;
    } else if (h2) {
      cursor.y += 5;
      writeWrapped(pdf, cursor, stripInline(h2[1]), pageWidth, pageHeight, { size: FONT_H2, color: [20, 60, 90] });
      cursor.y += 3;
    } else if (h3) {
      cursor.y += 4;
      writeWrapped(pdf, cursor, stripInline(h3[1]), pageWidth, pageHeight, { size: FONT_H3, color: [30, 30, 30] });
      cursor.y += 2;
    } else if (bullet) {
      writeWrapped(pdf, cursor, `•  ${stripInline(bullet[1])}`, pageWidth, pageHeight, { indent: 12 });
    } else if (numbered) {
      writeWrapped(pdf, cursor, stripInline(line.trim()), pageWidth, pageHeight, { indent: 12 });
    } else if (blockquote) {
      writeWrapped(pdf, cursor, stripInline(blockquote[1]), pageWidth, pageHeight, { indent: 14, color: [90, 90, 95] });
    } else {
      writeWrapped(pdf, cursor, stripInline(line), pageWidth, pageHeight);
    }
  }
  flushCode();
  flushTable();

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
