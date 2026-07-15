import { join } from "node:path";
import { ensureDir, writeJson, writeTextFile } from "../utils/fs.js";
import type { RisaleValidationReport } from "./types.js";

export class RisaleValidationReportWriter {
  public constructor(
    private readonly reportsDir = join(process.cwd(), "reports", "risale-ingestion")
  ) {}

  public async write(
    report: RisaleValidationReport
  ): Promise<{ jsonPath: string; markdownPath: string }> {
    await ensureDir(this.reportsDir);
    const jsonPath = join(this.reportsDir, "validation.json");
    const markdownPath = join(this.reportsDir, "validation.md");
    const markdown = [
      "# Risale-i Nur Ingestion Validation",
      "",
      `Generated: ${report.generatedAt}`,
      "",
      `- Knowledge source: ${report.knowledgeSource}`,
      `- Qdrant collection: ${report.collection}`,
      `- Books discovered: ${report.booksDiscovered}`,
      `- Pages downloaded: ${report.pagesDownloaded}`,
      `- Pages parsed: ${report.pagesParsed}`,
      `- Chunks created: ${report.chunksCreated}`,
      `- Embeddings generated: ${report.embeddingsGenerated}`,
      `- Vectors inserted: ${report.vectorsInserted}`,
      `- Skipped pages: ${report.skippedPages}`,
      `- Failed pages: ${report.failedPages}`,
      ""
    ].join("\n");
    await Promise.all([writeJson(jsonPath, report), writeTextFile(markdownPath, markdown)]);
    return { jsonPath, markdownPath };
  }
}
