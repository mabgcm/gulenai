import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { ChunkIndexReader } from "../../src/indexing/chunkIndexReader.js";
import { IndexPipeline } from "../../src/indexing/indexPipeline.js";
import { ManifestStore } from "../../src/indexing/manifestStore.js";
import { formatIndexStatus } from "../../src/indexing/statusFormatter.js";
import { ensureDir } from "../../src/utils/fs.js";

describe("IndexPipeline", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("reads chunk JSON and writes document and chunk manifests", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-index-"));
    const chunksDir = join(tempDir, "chunks");
    const indexDir = join(tempDir, "index");
    const chunkPath = join(chunksDir, "en", "article", "0000-abc.json");
    await ensureDir(dirname(chunkPath));
    await writeFile(
      chunkPath,
      `${JSON.stringify({
        metadata: {
          id: "abc",
          sourceFile: "en/article.md",
          title: "Article",
          url: "https://fgulen.com/en/article",
          language: "en",
          crawlDate: "2026-07-09T00:00:00.000Z",
          chunkIndex: 0,
          totalChunks: 1,
          tokenCount: 42,
          contentHash: "hash"
        },
        markdown: "# Article",
        plainText: "Article"
      })}\n`,
      "utf8"
    );

    const pipeline = new IndexPipeline(
      new ChunkIndexReader(chunksDir),
      new ManifestStore(indexDir),
      pino({ enabled: false }),
      () => new Date("2026-07-09T01:02:03.000Z")
    );

    const summary = await pipeline.run();
    const documents = JSON.parse(
      await readFile(join(indexDir, "documents.json"), "utf8")
    ) as unknown[];
    const chunks = JSON.parse(await readFile(join(indexDir, "chunks.json"), "utf8")) as unknown[];

    expect(summary).toEqual({
      totalDocuments: 1,
      totalChunks: 1,
      pendingEmbeddings: 1,
      changedDocuments: 0,
      deletedDocuments: 0
    });
    expect(documents).toHaveLength(1);
    expect(chunks).toHaveLength(1);
  });

  it("formats status output", () => {
    expect(
      formatIndexStatus({
        totalDocuments: 1428,
        totalChunks: 24562,
        pendingEmbeddings: 37,
        changedDocuments: 5,
        deletedDocuments: 1
      })
    ).toBe(
      [
        "Documents: 1428",
        "Chunks: 24562",
        "Pending embeddings: 37",
        "Changed documents: 5",
        "Deleted documents: 1"
      ].join("\n")
    );
  });
});
