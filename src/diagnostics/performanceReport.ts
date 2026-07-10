import { join } from "node:path";
import { ensureDir, readJson, writeJson, writeTextFile } from "../utils/fs.js";

export type PerformanceStage = "crawl" | "index" | "embed" | "qdrant";

export interface PerformanceMeasurement {
  readonly stage: PerformanceStage;
  readonly generatedAt: string;
  readonly durationSeconds: number;
  readonly items: number;
  readonly unit: "pages" | "chunks" | "vectors";
  readonly throughputPerSecond: number;
}

const escapeHtml = (value: string | number): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderHtml = (measurements: readonly PerformanceMeasurement[]): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pipeline Performance Report</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f7f7f4; color: #1d1d1f; line-height: 1.45; }
    header { background: #fff; border-bottom: 1px solid #deded8; padding: 28px 40px 18px; }
    main { max-width: 1080px; margin: 0 auto; padding: 28px 40px 56px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #deded8; font-size: 13px; }
    th, td { border-bottom: 1px solid #deded8; padding: 9px 10px; text-align: left; }
    th { background: #eeeeea; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #666b73; }
  </style>
</head>
<body>
  <header>
    <h1>Pipeline Performance Report</h1>
    <p class="muted">Measured crawl, index, embed, and Qdrant throughput history.</p>
  </header>
  <main>
    <table>
      <thead><tr><th>Stage</th><th>Measured at</th><th>Items</th><th>Duration</th><th>Throughput</th></tr></thead>
      <tbody>
        ${measurements
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.stage)}</td><td>${escapeHtml(item.generatedAt)}</td><td class="num">${item.items} ${escapeHtml(item.unit)}</td><td class="num">${item.durationSeconds.toFixed(2)}s</td><td class="num">${item.throughputPerSecond.toFixed(2)} ${escapeHtml(item.unit)}/sec</td></tr>`
          )
          .join("\n")}
      </tbody>
    </table>
  </main>
</body>
</html>
`;

export class PerformanceReportWriter {
  private readonly jsonPath: string;
  private readonly htmlPath: string;

  public constructor(private readonly reportsDir = "reports") {
    this.jsonPath = join(reportsDir, "performance.json");
    this.htmlPath = join(reportsDir, "performance.html");
  }

  public async record(
    stage: PerformanceStage,
    durationMs: number,
    items: number,
    unit: PerformanceMeasurement["unit"]
  ): Promise<string> {
    await ensureDir(this.reportsDir);
    const existing = (await readJson<readonly PerformanceMeasurement[]>(this.jsonPath)) ?? [];
    const measurement: PerformanceMeasurement = {
      stage,
      generatedAt: new Date().toISOString(),
      durationSeconds: durationMs / 1000,
      items,
      unit,
      throughputPerSecond: durationMs <= 0 ? items : items / (durationMs / 1000)
    };
    const measurements = [...existing, measurement]
      .slice(-50)
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    await writeJson(this.jsonPath, measurements);
    await writeTextFile(this.htmlPath, renderHtml(measurements));
    return this.htmlPath;
  }
}
