import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { ArticleExtractor } from "../../src/extract/articleExtractor.js";
import { CleanDocumentStore } from "../../src/extract/cleanDocumentStore.js";
import { ExtractionPipeline } from "../../src/extract/extractionPipeline.js";
import { RawDocumentReader } from "../../src/extract/rawDocumentReader.js";
import { ensureDir } from "../../src/utils/fs.js";

describe("ExtractionPipeline", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("reads raw HTML and writes clean HTML plus metadata using the same structure", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-extract-"));
    const rawDir = join(tempDir, "raw");
    const cleanDir = join(tempDir, "clean");
    const crawlDir = join(tempDir, "crawl");
    const rawPath = join(rawDir, "en", "article.html");
    await ensureDir(dirname(rawPath));
    await ensureDir(crawlDir);
    await writeFile(
      rawPath,
      `<html lang="en"><head><title>Pipeline Article</title></head><body><article><h1>Pipeline Article</h1><p>Useful article body.</p></article><footer>drop</footer></body></html>`,
      "utf8"
    );
    await writeFile(
      join(crawlDir, "raw-index.jsonl"),
      `${JSON.stringify({
        id: "pipeline",
        url: "https://fgulen.com/en/article",
        finalUrl: "https://fgulen.com/en/article",
        canonicalUrl: null,
        status: 200,
        contentType: "text/html",
        title: "Pipeline Article",
        fetchedAt: "2026-07-09T00:00:00.000Z",
        contentHash: "raw",
        rawPath
      })}\n`,
      "utf8"
    );

    const pipeline = new ExtractionPipeline(
      new RawDocumentReader(rawDir, join(crawlDir, "raw-index.jsonl")),
      new ArticleExtractor(),
      new CleanDocumentStore(cleanDir),
      pino({ enabled: false })
    );

    const summary = await pipeline.run();
    const cleanHtml = await readFile(join(cleanDir, "en", "article.html"), "utf8");
    const metadata = JSON.parse(
      await readFile(join(cleanDir, "en", "article.metadata.json"), "utf8")
    ) as Record<string, unknown>;

    expect(summary).toEqual({ processed: 1, failed: 0 });
    expect(cleanHtml).toContain("Pipeline Article");
    expect(cleanHtml).not.toContain("drop");
    expect(metadata.url).toBe("https://fgulen.com/en/article");
    expect(metadata.crawlDate).toBe("2026-07-09T00:00:00.000Z");
  });
});
