import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { ChunkingPipeline } from "../../src/chunking/chunkingPipeline.js";
import { MarkdownChunker } from "../../src/chunking/chunker.js";
import { ChunkStore } from "../../src/chunking/chunkStore.js";
import { MarkdownDocumentReader } from "../../src/chunking/markdownDocumentReader.js";
import type { TokenCounter } from "../../src/chunking/tokenCounter.js";
import { ensureDir } from "../../src/utils/fs.js";

class WordTokenCounter implements TokenCounter {
  public count(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

describe("ChunkingPipeline", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("writes chunk JSON files under data/chunks-style document directories", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-chunks-"));
    const markdownDir = join(tempDir, "markdown");
    const chunksDir = join(tempDir, "chunks");
    const markdownPath = join(markdownDir, "en", "article.md");
    await ensureDir(dirname(markdownPath));
    await writeFile(
      markdownPath,
      [
        "# Pipeline",
        "",
        "First paragraph for chunking.",
        "",
        "## Next",
        "",
        "Second paragraph."
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(markdownDir, "en", "article.metadata.json"),
      `${JSON.stringify({
        title: "Pipeline",
        url: "https://fgulen.com/en/pipeline",
        language: "en"
      })}\n`,
      "utf8"
    );

    const pipeline = new ChunkingPipeline(
      new MarkdownDocumentReader(markdownDir),
      new MarkdownChunker(
        { targetTokens: 12, maxTokens: 20, overlapTokens: 3 },
        new WordTokenCounter()
      ),
      new ChunkStore(chunksDir),
      pino({ enabled: false })
    );

    const summary = await pipeline.run();
    const outputDir = join(chunksDir, "en", "article");
    const files = await readdir(outputDir);
    const chunk = JSON.parse(await readFile(join(outputDir, files[0] ?? ""), "utf8")) as {
      metadata: Record<string, unknown>;
      markdown: string;
      plainText: string;
    };

    expect(summary.processedDocuments).toBe(1);
    expect(summary.writtenChunks).toBeGreaterThan(0);
    expect(chunk.metadata.title).toBe("Pipeline");
    expect(chunk.markdown).toContain("# Pipeline");
    expect(chunk.plainText).toContain("Pipeline");
  });
});
