import { join } from "node:path";
import { ensureDir, writeTextFile } from "../utils/fs.js";
import type {
  RetrievalDiagnosticsReport,
  RetrievalValidationHtmlReport,
  ValidationSearchReport
} from "./types.js";

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const heading = (headingPath: readonly string[]): string =>
  headingPath.length === 0 ? "(none)" : headingPath.join(" -> ");

export const formatDiagnostics = (report: RetrievalDiagnosticsReport): string =>
  [
    "Retrieval Diagnostics",
    "",
    `Queue size: ${report.queueSize}`,
    `Resume status: ${report.resumeStatus}`,
    `Remaining URLs: ${report.remainingUrls.length === 0 ? "(none)" : report.remainingUrls.join(", ")}`,
    `Filesystem concurrency: ${report.filesystemConcurrency}`,
    `Pending filesystem jobs: ${report.pendingFilesystemJobs}`,
    `Active filesystem jobs: ${report.activeFilesystemJobs}`,
    `Open file statistics: ${report.openFileStatistics}`,
    `Memory RSS: ${Math.round(report.memoryUsage.rssBytes / 1024 / 1024)} MB`,
    `Memory heap used: ${Math.round(report.memoryUsage.heapUsedBytes / 1024 / 1024)} MB`,
    "",
    `Qdrant connected: ${report.qdrantConnected ? "yes" : "no"}`,
    `Collection: ${report.collection}`,
    `Collection exists: ${report.collectionExists ? "yes" : "no"}`,
    `Vectors: ${report.vectorCount}`,
    `Embedding model: ${report.embeddingModel ?? "(unknown)"}`,
    `Embedding dimensions: ${report.embeddingDimensions ?? "(unknown)"}`,
    `Indexed documents: ${report.indexedDocuments}`,
    `Indexed chunks: ${report.indexedChunks}`,
    `Embedded chunks: ${report.embeddedChunks}`,
    `Pending chunks: ${report.pendingChunks}`,
    `Missing vectors: ${report.missingVectors.length}`,
    `Orphan vectors: ${report.orphanVectors.length}`,
    ...(report.errors.length === 0 ? [] : ["", "Errors:", ...report.errors.map((error) => `- ${error}`)])
  ].join("\n");

export const formatValidationSearch = (report: ValidationSearchReport): string => {
  const lines = [
    `Query: ${report.query}`,
    `Generated query embedding dimension: ${report.queryEmbeddingDimensions ?? "(failed)"}`,
    ""
  ];
  if (report.error !== null) {
    lines.push(`Search error: ${report.error}`, "");
  }
  if (report.hits.length === 0) {
    lines.push("No results returned.", `Likely cause: ${report.likelyCause ?? "unknown"}`);
    return lines.join("\n");
  }

  lines.push("Top 20 Retrieved Chunks", "");
  for (const hit of report.hits) {
    lines.push(
      `${hit.rank}.`,
      `Score: ${hit.similarityScore.toFixed(4)}`,
      `Title: ${hit.title ?? "(unknown)"}`,
      `Heading: ${heading(hit.headingPath)}`,
      `URL: ${hit.url ?? "(unknown)"}`,
      `Chunk ID: ${hit.chunkId}`,
      `Preview: ${hit.preview}`,
      ""
    );
  }
  return lines.join("\n").trimEnd();
};

export const renderRetrievalValidationHtml = (
  report: RetrievalValidationHtmlReport
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Retrieval Validation Report</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f7f7f4; color: #1d1d1f; line-height: 1.45; }
    header { background: #fff; border-bottom: 1px solid #deded8; padding: 30px 40px 18px; }
    main { max-width: 1280px; margin: 0 auto; padding: 28px 40px 56px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin-top: 34px; border-bottom: 1px solid #deded8; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { background: #fff; border: 1px solid #deded8; border-radius: 8px; padding: 14px; }
    .metric strong { display: block; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #deded8; font-size: 13px; }
    th, td { border-bottom: 1px solid #deded8; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #eeeeea; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #666b73; }
    a { color: #275f86; text-decoration: none; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    pre { white-space: pre-wrap; background: #f0f2f4; border: 1px solid #deded8; border-radius: 8px; padding: 14px; }
  </style>
</head>
<body>
  <header>
    <h1>Retrieval Validation Report</h1>
    <p class="muted">Generated ${escapeHtml(report.diagnostics.generatedAt)}. This report validates retrieval readiness only; it does not call a chat model.</p>
  </header>
  <main>
    <h2>Diagnostics</h2>
    <section class="grid">
      <div class="metric"><span class="muted">Qdrant connected</span><strong>${report.diagnostics.qdrantConnected ? "yes" : "no"}</strong></div>
      <div class="metric"><span class="muted">Collection exists</span><strong>${report.diagnostics.collectionExists ? "yes" : "no"}</strong></div>
      <div class="metric"><span class="muted">Vectors</span><strong>${report.diagnostics.vectorCount}</strong></div>
      <div class="metric"><span class="muted">Embedding model</span><strong>${escapeHtml(report.diagnostics.embeddingModel ?? "(unknown)")}</strong></div>
      <div class="metric"><span class="muted">Dimensions</span><strong>${escapeHtml(report.diagnostics.embeddingDimensions ?? "(unknown)")}</strong></div>
      <div class="metric"><span class="muted">Documents</span><strong>${report.diagnostics.indexedDocuments}</strong></div>
      <div class="metric"><span class="muted">Chunks</span><strong>${report.diagnostics.indexedChunks}</strong></div>
      <div class="metric"><span class="muted">Embedded chunks</span><strong>${report.diagnostics.embeddedChunks}</strong></div>
      <div class="metric"><span class="muted">Pending chunks</span><strong>${report.diagnostics.pendingChunks}</strong></div>
      <div class="metric"><span class="muted">Missing vectors</span><strong>${report.diagnostics.missingVectors.length}</strong></div>
      <div class="metric"><span class="muted">Orphan vectors</span><strong>${report.diagnostics.orphanVectors.length}</strong></div>
      <div class="metric"><span class="muted">Queue size</span><strong>${report.diagnostics.queueSize}</strong></div>
      <div class="metric"><span class="muted">Resume</span><strong>${escapeHtml(report.diagnostics.resumeStatus)}</strong></div>
      <div class="metric"><span class="muted">FS concurrency</span><strong>${report.diagnostics.filesystemConcurrency}</strong></div>
      <div class="metric"><span class="muted">Pending FS jobs</span><strong>${report.diagnostics.pendingFilesystemJobs}</strong></div>
      <div class="metric"><span class="muted">Active FS jobs</span><strong>${report.diagnostics.activeFilesystemJobs}</strong></div>
      <div class="metric"><span class="muted">Memory RSS</span><strong>${Math.round(report.diagnostics.memoryUsage.rssBytes / 1024 / 1024)} MB</strong></div>
    </section>
    <h2>Runtime</h2>
    <pre>Open file statistics: ${escapeHtml(report.diagnostics.openFileStatistics)}
Memory heap used: ${Math.round(report.diagnostics.memoryUsage.heapUsedBytes / 1024 / 1024)} MB
Remaining URLs:
${escapeHtml(report.diagnostics.remainingUrls.length === 0 ? "(none)" : report.diagnostics.remainingUrls.join("\n"))}</pre>
    ${
      report.diagnostics.errors.length === 0
        ? ""
        : `<h2>Errors</h2><ul>${report.diagnostics.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
    }
    ${
      report.validation === null
        ? ""
        : `<h2>Search Validation</h2>
    <p><strong>Query:</strong> ${escapeHtml(report.validation.query)}</p>
    <p><strong>Generated query embedding dimension:</strong> ${escapeHtml(report.validation.queryEmbeddingDimensions ?? "(failed)")}</p>
    ${
      report.validation.hits.length === 0
        ? `<pre>No results returned.\nLikely cause: ${escapeHtml(report.validation.likelyCause ?? "unknown")}</pre>`
        : `<table><thead><tr><th>#</th><th>Score</th><th>Title</th><th>Heading</th><th>URL</th><th>Chunk</th><th>Preview</th></tr></thead><tbody>${report.validation.hits
            .map(
              (hit) =>
                `<tr><td class="num">${hit.rank}</td><td class="num">${hit.similarityScore.toFixed(4)}</td><td>${escapeHtml(hit.title ?? "(unknown)")}</td><td>${escapeHtml(heading(hit.headingPath))}</td><td>${hit.url === null ? "(unknown)" : `<a href="${escapeHtml(hit.url)}">${escapeHtml(hit.url)}</a>`}</td><td><code>${escapeHtml(hit.chunkId)}</code></td><td>${escapeHtml(hit.preview)}</td></tr>`
            )
            .join("")}</tbody></table>`
    }`
    }
  </main>
</body>
</html>
`;

export class RetrievalValidationReportWriter {
  public constructor(private readonly reportsDir = "reports") {}

  public async write(report: RetrievalValidationHtmlReport): Promise<string> {
    await ensureDir(this.reportsDir);
    const outputPath = join(this.reportsDir, "retrieval-validation.html");
    await writeTextFile(outputPath, renderRetrievalValidationHtml(report));
    return outputPath;
  }
}
