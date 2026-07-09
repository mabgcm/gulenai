import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/fs.js";
import type { CitedAnswer, CitationChunkPreview } from "./types.js";

export interface CitationValidationCase {
  readonly question: string;
  readonly answer: CitedAnswer;
  readonly responseTimeMs: number;
  readonly previews: readonly CitationChunkPreview[];
}

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const previewFor = (
  previews: readonly CitationChunkPreview[],
  chunkId: string
): string => previews.find((preview) => preview.chunkId === chunkId)?.preview ?? "(preview missing)";

export const renderCitationValidationHtml = (
  cases: readonly CitationValidationCase[],
  generatedAt = new Date().toISOString()
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Citation Validation Report</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f7f7f4; color: #1d1d1f; line-height: 1.45; }
    header { background: #fff; border-bottom: 1px solid #deded8; padding: 30px 40px 18px; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 40px 56px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    section, article { background: #fff; border: 1px solid #deded8; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .muted { color: #666b73; }
    .metric { display: inline-block; margin-right: 18px; }
    pre { white-space: pre-wrap; font-family: inherit; background: #fafafa; border: 1px solid #ecece7; border-radius: 6px; padding: 12px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    a { color: #1f5f99; }
  </style>
</head>
<body>
  <header>
    <h1>Citation Validation Report</h1>
    <p class="muted">Generated ${escapeHtml(generatedAt)}. This report validates answer-to-source traceability.</p>
  </header>
  <main>
    ${cases
      .map(
        (item) => `<section>
      <h2>${escapeHtml(item.question)}</h2>
      <p><span class="metric"><strong>Confidence:</strong> ${item.answer.confidence}%</span><span class="metric"><strong>Citations:</strong> ${item.answer.citations.length}</span><span class="metric"><strong>Response time:</strong> ${item.responseTimeMs} ms</span><span class="metric"><strong>Model:</strong> ${escapeHtml(item.answer.sourceAnswer.model)}</span></p>
      <h3>Answer</h3>
      <pre>${escapeHtml(item.answer.answer)}</pre>
      <h3>Citations</h3>
      ${
        item.answer.citations.length > 0
          ? item.answer.citations
              .map(
                (citation) => `<article>
        <h4>[${citation.id}] ${escapeHtml(citation.title ?? "(untitled)")}</h4>
        <p><strong>Chunk:</strong> <code>${escapeHtml(citation.chunkId)}</code></p>
        <p><strong>Heading:</strong> ${escapeHtml(citation.headingPath.join(" -> ") || "(none)")}</p>
        <p><strong>URL:</strong> ${
          citation.url === null
            ? "(unknown)"
            : `<a href="${escapeHtml(citation.url)}">${escapeHtml(citation.url)}</a>`
        }</p>
        <p><strong>Score:</strong> ${citation.score.toFixed(4)} <strong>Chunk index:</strong> ${citation.chunkIndex} / ${citation.totalChunks}</p>
        <pre>${escapeHtml(previewFor(item.previews, citation.chunkId))}</pre>
      </article>`
              )
              .join("\n")
          : "<p>No source chunks were used.</p>"
      }
    </section>`
      )
      .join("\n")}
  </main>
</body>
</html>
`;

export class CitationValidationReportWriter {
  public constructor(private readonly reportsDir = "reports") {}

  public async write(cases: readonly CitationValidationCase[]): Promise<string> {
    await ensureDir(this.reportsDir);
    const outputPath = join(this.reportsDir, "citation-validation.html");
    await writeFile(outputPath, renderCitationValidationHtml(cases), "utf8");
    return outputPath;
  }
}
