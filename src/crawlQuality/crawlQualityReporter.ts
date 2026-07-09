import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/fs.js";
import type { CrawlQualityDecision, CrawlQualitySummary } from "./types.js";

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;

export const summarizeCrawlQuality = (
  decisions: readonly CrawlQualityDecision[]
): CrawlQualitySummary => {
  const indexed = decisions.filter((decision) => decision.status === "indexed");
  const languageDistribution = decisions.reduce<Record<string, number>>((acc, decision) => {
    const language = decision.language ?? "unknown";
    acc[language] = (acc[language] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalPagesVisited: decisions.length,
    indexedPages: indexed.length,
    skippedPages: decisions.filter((decision) => decision.status === "skipped").length,
    duplicatePages: decisions.filter((decision) => decision.status === "duplicate").length,
    categoryPages: decisions.filter((decision) =>
      ["category", "tag", "archive", "table-of-contents", "index"].includes(decision.classification)
    ).length,
    lowQualityPages: decisions.filter(
      (decision) => decision.status !== "indexed" && decision.classification === "low-quality"
    ).length,
    averageQualityScore: average(decisions.map((decision) => decision.qualityScore)),
    averageWordCount: average(decisions.map((decision) => decision.metrics.wordCount)),
    averageTokenCount: average(decisions.map((decision) => decision.metrics.tokenCount)),
    languageDistribution,
    lowestQualityPages: [...decisions]
      .sort(
        (left, right) => left.qualityScore - right.qualityScore || left.url.localeCompare(right.url)
      )
      .slice(0, 20),
    highestQualityPages: [...decisions]
      .sort(
        (left, right) => right.qualityScore - left.qualityScore || left.url.localeCompare(right.url)
      )
      .slice(0, 20)
  };
};

const pageTable = (decisions: readonly CrawlQualityDecision[]): string => `<table>
  <thead><tr><th>Score</th><th>Status</th><th>Class</th><th>Words</th><th>Tokens</th><th>Links</th><th>Reason</th><th>URL</th></tr></thead>
  <tbody>
    ${decisions
      .map(
        (decision) => `<tr>
      <td class="num">${decision.qualityScore}</td>
      <td>${escapeHtml(decision.status)}</td>
      <td>${escapeHtml(decision.classification)}</td>
      <td class="num">${decision.metrics.wordCount}</td>
      <td class="num">${decision.metrics.tokenCount}</td>
      <td class="num">${decision.metrics.linkCount}</td>
      <td>${escapeHtml(decision.reason)}</td>
      <td><a href="${escapeHtml(decision.url)}">${escapeHtml(decision.title ?? decision.url)}</a><br><code>${escapeHtml(decision.url)}</code></td>
    </tr>`
      )
      .join("\n")}
  </tbody>
</table>`;

export const renderCrawlQualityHtml = (
  decisions: readonly CrawlQualityDecision[],
  generatedAt = new Date().toISOString()
): string => {
  const summary = summarizeCrawlQuality(decisions);
  const languages = Object.entries(summary.languageDistribution)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([language, count]) => `<li><strong>${escapeHtml(language)}</strong>: ${count}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crawl Quality Report</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #1d1d1f; background: #f7f7f4; line-height: 1.45; }
    header { background: #fff; border-bottom: 1px solid #deded8; padding: 30px 40px 18px; }
    main { max-width: 1320px; margin: 0 auto; padding: 28px 40px 56px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin-top: 34px; padding-bottom: 8px; border-bottom: 1px solid #deded8; font-size: 22px; }
    .muted { color: #666b73; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .metric { background: #fff; border: 1px solid #deded8; border-radius: 8px; padding: 14px; }
    .metric strong { display: block; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #deded8; font-size: 13px; }
    th, td { border-bottom: 1px solid #deded8; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #eeeeea; position: sticky; top: 0; }
    .num { text-align: right; white-space: nowrap; }
    a { color: #275f86; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Crawl Quality Report</h1>
    <p class="muted">Generated ${escapeHtml(generatedAt)}. Category and low-value pages may still be visited for link discovery, but are excluded from raw indexing.</p>
  </header>
  <main>
    <section class="grid">
      <div class="metric"><span class="muted">Total pages visited</span><strong>${summary.totalPagesVisited}</strong></div>
      <div class="metric"><span class="muted">Indexed pages</span><strong>${summary.indexedPages}</strong></div>
      <div class="metric"><span class="muted">Skipped pages</span><strong>${summary.skippedPages}</strong></div>
      <div class="metric"><span class="muted">Duplicate pages</span><strong>${summary.duplicatePages}</strong></div>
      <div class="metric"><span class="muted">Category pages</span><strong>${summary.categoryPages}</strong></div>
      <div class="metric"><span class="muted">Low-quality pages</span><strong>${summary.lowQualityPages}</strong></div>
      <div class="metric"><span class="muted">Average quality score</span><strong>${summary.averageQualityScore}</strong></div>
      <div class="metric"><span class="muted">Average word count</span><strong>${summary.averageWordCount}</strong></div>
      <div class="metric"><span class="muted">Average token count</span><strong>${summary.averageTokenCount}</strong></div>
    </section>
    <h2>Language Distribution</h2>
    <ul>${languages}</ul>
    <h2>Top 20 Lowest-Quality Pages</h2>
    ${pageTable(summary.lowestQualityPages)}
    <h2>Top 20 Highest-Quality Pages</h2>
    ${pageTable(summary.highestQualityPages)}
  </main>
</body>
</html>
`;
};

export const renderCrawlQualityMarkdown = (
  decisions: readonly CrawlQualityDecision[],
  generatedAt = new Date().toISOString()
): string => {
  const summary = summarizeCrawlQuality(decisions);
  const lines = [
    "# Crawl Quality Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    `- Total pages visited: ${summary.totalPagesVisited}`,
    `- Indexed pages: ${summary.indexedPages}`,
    `- Skipped pages: ${summary.skippedPages}`,
    `- Duplicate pages: ${summary.duplicatePages}`,
    `- Category pages: ${summary.categoryPages}`,
    `- Low-quality pages: ${summary.lowQualityPages}`,
    `- Average quality score: ${summary.averageQualityScore}`,
    `- Average word count: ${summary.averageWordCount}`,
    `- Average token count: ${summary.averageTokenCount}`,
    "",
    "## Language Distribution",
    "",
    ...Object.entries(summary.languageDistribution)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([language, count]) => `- ${language}: ${count}`),
    "",
    "## Top 20 Lowest-Quality Pages",
    "",
    ...summary.lowestQualityPages.map(
      (decision, index) =>
        `${index + 1}. ${decision.qualityScore} - ${decision.status} - ${decision.classification} - ${decision.title ?? decision.url} - ${decision.url}`
    ),
    "",
    "## Top 20 Highest-Quality Pages",
    "",
    ...summary.highestQualityPages.map(
      (decision, index) =>
        `${index + 1}. ${decision.qualityScore} - ${decision.status} - ${decision.classification} - ${decision.title ?? decision.url} - ${decision.url}`
    )
  ];
  return `${lines.join("\n")}\n`;
};

export class CrawlQualityReporter {
  public constructor(private readonly reportsDir = "reports") {}

  public async write(decisions: readonly CrawlQualityDecision[]): Promise<CrawlQualitySummary> {
    await ensureDir(this.reportsDir);
    const generatedAt = new Date().toISOString();
    await Promise.all([
      writeFile(
        join(this.reportsDir, "crawl-quality.html"),
        renderCrawlQualityHtml(decisions, generatedAt),
        "utf8"
      ),
      writeFile(
        join(this.reportsDir, "crawl-quality.md"),
        renderCrawlQualityMarkdown(decisions, generatedAt),
        "utf8"
      )
    ]);
    return summarizeCrawlQuality(decisions);
  }
}
