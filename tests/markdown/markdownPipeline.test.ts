import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { CleanHtmlReader } from "../../src/markdown/cleanHtmlReader.js";
import { MarkdownConverter } from "../../src/markdown/markdownConverter.js";
import { MarkdownPipeline } from "../../src/markdown/markdownPipeline.js";
import { MarkdownStore } from "../../src/markdown/markdownStore.js";
import { ensureDir } from "../../src/utils/fs.js";

describe("MarkdownPipeline", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("writes Markdown and copies metadata using the same relative structure", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-markdown-"));
    const cleanDir = join(tempDir, "clean");
    const markdownDir = join(tempDir, "markdown");
    const htmlPath = join(cleanDir, "en", "article.html");
    await ensureDir(dirname(htmlPath));
    await writeFile(
      htmlPath,
      `<article><h1>Pipeline Page</h1><p>Useful <strong>content</strong>.</p></article>`,
      "utf8"
    );
    await writeFile(
      join(cleanDir, "en", "article.metadata.json"),
      `${JSON.stringify({
        title: "Pipeline Page",
        url: "https://fgulen.com/en/article",
        language: "en"
      })}\n`,
      "utf8"
    );

    const pipeline = new MarkdownPipeline(
      new CleanHtmlReader(cleanDir),
      new MarkdownConverter(),
      new MarkdownStore(markdownDir),
      pino({ enabled: false })
    );

    const summary = await pipeline.run();
    const markdown = await readFile(join(markdownDir, "en", "article.md"), "utf8");
    const metadata = JSON.parse(
      await readFile(join(markdownDir, "en", "article.metadata.json"), "utf8")
    ) as Record<string, unknown>;

    expect(summary).toEqual({ processed: 1, failed: 0 });
    expect(markdown).toContain("# Pipeline Page");
    expect(markdown).toContain("**content**");
    expect(metadata.title).toBe("Pipeline Page");
    expect(metadata.url).toBe("https://fgulen.com/en/article");
  });
});
