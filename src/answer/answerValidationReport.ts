import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/fs.js";
import type { AnswerValidationCase } from "./types.js";

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderAnswerValidationHtml = (
  cases: readonly AnswerValidationCase[],
  generatedAt = new Date().toISOString()
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Answer Validation Report</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f7f7f4; color: #1d1d1f; line-height: 1.45; }
    header { background: #fff; border-bottom: 1px solid #deded8; padding: 30px 40px 18px; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 40px 56px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    section { background: #fff; border: 1px solid #deded8; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .muted { color: #666b73; }
    .metric { display: inline-block; margin-right: 18px; }
    pre { white-space: pre-wrap; font-family: inherit; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <header>
    <h1>Answer Validation Report</h1>
    <p class="muted">Generated ${escapeHtml(generatedAt)}. This report validates strict RAG answer generation and does not render citations.</p>
  </header>
  <main>
    ${cases
      .map(
        (item) => `<section>
      <h2>${escapeHtml(item.question)}</h2>
      <p><span class="metric"><strong>Confidence:</strong> ${item.result.confidence}%</span><span class="metric"><strong>Chunks used:</strong> ${item.result.usedChunks.length}</span><span class="metric"><strong>Response time:</strong> ${item.responseTimeMs} ms</span><span class="metric"><strong>Model:</strong> ${escapeHtml(item.result.model)}</span></p>
      <pre>${escapeHtml(item.result.answer)}</pre>
    </section>`
      )
      .join("\n")}
  </main>
</body>
</html>
`;

export class AnswerValidationReportWriter {
  public constructor(private readonly reportsDir = "reports") {}

  public async write(cases: readonly AnswerValidationCase[]): Promise<string> {
    await ensureDir(this.reportsDir);
    const outputPath = join(this.reportsDir, "answer-validation.html");
    await writeFile(outputPath, renderAnswerValidationHtml(cases), "utf8");
    return outputPath;
  }
}
