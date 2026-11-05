"use client";

import React from "react";
import { Code2, Table as TableIcon, Image as ImageIcon, ExternalLink } from "lucide-react";
import { API_BASE } from "../lib/api";

export interface TableBlock {
  type: "table";
  headers: string[];
  alignments: ("left" | "center" | "right")[];
  rows: string[][];
}

export interface CodeBlock {
  type: "code";
  lang?: string;
  code: string;
}

export interface McqBlock {
  type: "mcq";
  leadText?: string;
  options: { label: string; text: string }[];
}

export interface ImageBlock {
  type: "image";
  alt: string;
  src: string;
}

export interface ParagraphBlock {
  type: "paragraph";
  text: string;
}

export type ContentBlock = TableBlock | CodeBlock | McqBlock | ImageBlock | ParagraphBlock;

export function renderInline(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-[11px] border border-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function parseMarkdownBlocks(text: string): ContentBlock[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const blocks: ContentBlock[] = [];
  let i = 0;

  const isTableRow = (l: string) => {
    const trimmed = l.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
  };

  const isSeparatorRow = (l: string) => {
    const trimmed = l.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
    const parts = trimmed.split("|").slice(1, -1);
    return parts.length > 0 && parts.every((p) => /^[\s:-]+$/.test(p) && p.includes("-"));
  };

  while (i < lines.length) {
    const line = lines[i];

    // 1. Code block ```
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        type: "code",
        lang,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // 2. Standalone Markdown Image: ![Alt text](image_url)
    const imgMatch = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      blocks.push({
        type: "image",
        alt: imgMatch[1] || "Question Diagram",
        src: imgMatch[2],
      });
      i++;
      continue;
    }

    // 3. Table detection (header line + separator line)
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headerLine = line;
      const sepLine = lines[i + 1];
      const headers = headerLine.trim().split("|").slice(1, -1).map((s) => s.trim());
      const sepParts = sepLine.trim().split("|").slice(1, -1).map((s) => s.trim());
      const alignments = sepParts.map((part) => {
        const left = part.startsWith(":");
        const right = part.endsWith(":");
        if (left && right) return "center" as const;
        if (right) return "right" as const;
        return "left" as const;
      });

      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const rowCells = lines[i].trim().split("|").slice(1, -1).map((s) => s.trim());
        rows.push(rowCells);
        i++;
      }

      blocks.push({
        type: "table",
        headers,
        alignments,
        rows,
      });
      continue;
    }

    // 4. Normal paragraph or list
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().match(/^!\[(.*?)\]\((.*?)\)$/) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    const paraText = paraLines.join("\n").trim();
    if (paraText) {
      // Check if this paragraph contains MCQ options: (A), (B), (C), (D)
      const mcqMatch = paraText.match(/\([A-D]\)\s+[^\(\n]+/g);
      if (mcqMatch && mcqMatch.length >= 2) {
        const firstOptionIdx = paraText.search(/\([A-D]\)\s+/);
        const lead = paraText.slice(0, firstOptionIdx).trim();
        const optionsRaw = paraText.slice(firstOptionIdx).trim();
        const matches = optionsRaw.match(/\([A-D]\)\s*[^()]+/g) || [];
        const options = matches.map((opt, idx) => {
          const m = opt.match(/^\(([A-D])\)\s*(.*)/s);
          return {
            label: m ? m[1] : String.fromCharCode(65 + idx),
            text: (m ? m[2] : opt).trim(),
          };
        });
        blocks.push({
          type: "mcq",
          leadText: lead,
          options,
        });
      } else {
        blocks.push({
          type: "paragraph",
          text: paraText,
        });
      }
    }
  }

  return blocks;
}

export function FormattedQuestionContent({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks = parseMarkdownBlocks(text);

  if (blocks.length === 0) {
    return <div className={`text-slate-800 text-sm leading-relaxed whitespace-pre-wrap ${className}`}>{text}</div>;
  }

  return (
    <div className={`space-y-3.5 text-slate-800 ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === "paragraph") {
          return (
            <p key={idx} className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === "image") {
          const resolvedSrc =
            block.src.startsWith("/") && !block.src.startsWith("http")
              ? `${API_BASE}${block.src}`
              : block.src;

          return (
            <div
              key={idx}
              className="my-3 rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50 shadow-xs"
            >
              <div className="p-2.5 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-600 bg-slate-100/70 px-3.5">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                  {block.alt || "Question Diagram / Figure"}
                </span>
                <a
                  href={resolvedSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1 hover:underline"
                >
                  <span>Open Full Diagram</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="p-3 flex justify-center bg-white">
                <img
                  src={resolvedSrc}
                  alt={block.alt}
                  className="max-h-[380px] w-auto object-contain rounded-lg border border-slate-100 cursor-zoom-in hover:opacity-95 transition"
                  onClick={() => window.open(resolvedSrc, "_blank")}
                />
              </div>
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={idx}
              className="overflow-x-auto my-3 rounded-xl border border-slate-200/90 shadow-xs bg-white"
            >
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-800">
                    {block.headers.map((h, hIdx) => {
                      const align = block.alignments[hIdx] || "left";
                      const alignClass =
                        align === "center"
                          ? "text-center"
                          : align === "right"
                          ? "text-right"
                          : "text-left";
                      return (
                        <th
                          key={hIdx}
                          className={`px-3.5 py-2.5 font-bold text-slate-800 uppercase tracking-wider text-[11px] border-r border-slate-200 last:border-r-0 ${alignClass}`}
                        >
                          {renderInline(h)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-blue-50/40 transition-colors even:bg-slate-50/50"
                    >
                      {row.map((cell, cIdx) => {
                        const align = block.alignments[cIdx] || "left";
                        const alignClass =
                          align === "center"
                            ? "text-center"
                            : align === "right"
                            ? "text-right"
                            : "text-left";
                        return (
                          <td
                            key={cIdx}
                            className={`px-3.5 py-2 font-mono text-[11px] md:text-xs text-slate-700 border-r border-slate-200/70 last:border-r-0 whitespace-nowrap ${alignClass}`}
                          >
                            {renderInline(cell)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "code") {
          return (
            <div
              key={idx}
              className="my-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs md:text-sm overflow-x-auto border border-slate-800 shadow-md p-3.5"
            >
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-2 pb-1.5 border-b border-slate-800/80 font-sans">
                <Code2 className="w-3.5 h-3.5 text-blue-400" />
                <span>{block.lang ? block.lang.toUpperCase() : "Code"} Snippet</span>
              </div>
              <pre className="whitespace-pre-wrap">{block.code}</pre>
            </div>
          );
        }

        if (block.type === "mcq") {
          return (
            <div key={idx} className="space-y-3 my-2">
              {block.leadText && (
                <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                  {renderInline(block.leadText)}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {block.options.map((opt, oIdx) => (
                  <div
                    key={oIdx}
                    className="flex items-start space-x-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-blue-50/40 hover:border-blue-200 transition"
                  >
                    <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      {opt.label}
                    </span>
                    <span className="text-xs md:text-sm font-medium text-slate-800">
                      {renderInline(opt.text)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

export function hasDiagramReference(text: string): boolean {
  if (!text) return false;
  return (
    /(!\[|\b(diagram|figure|circuit|schematic|automata|graph|parse tree|binary tree|flowchart|truth table|state diagram|architecture|timing diagram)\b|\b(refer to (the )?(figure|diagram|circuit))\b|\b(shown below)\b)/i.test(
      text
    )
  );
}

export const SAMPLE_TABLE_TEMPLATE = `
| Process / Parameter | Arrival Time | Burst Time | Priority |
| :--- | :--- | :--- | :--- |
| P1 | 0 ms | 6 ms | 2 |
| P2 | 2 ms | 4 ms | 1 |
| P3 | 4 ms | 8 ms | 3 |
`;

export const SAMPLE_DIAGRAM_REF_TEMPLATE = `
*(Refer to the diagram / figure in the original question paper — click "View in Paper" below)*
`;

export const SAMPLE_DIAGRAM_IMAGE_TEMPLATE = `
![Figure: Question Diagram](/api/v1/documents/{DOCUMENT_ID}/pages/1/image)
`;
