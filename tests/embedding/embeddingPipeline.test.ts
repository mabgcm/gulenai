import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingClient } from "../../src/embedding/embeddingClient.js";
import { EmbeddingPipeline } from "../../src/embedding/embeddingPipeline.js";
import { EmbeddingVectorStore } from "../../src/embedding/embeddingVectorStore.js";
import { EmbeddingIndexManifestStore } from "../../src/embedding/indexManifestStore.js";
import { ChunkPayloadReader } from "../../src/embedding/chunkPayloadReader.js";
import type { EmbeddingChunkManifestEntry } from "../../src/embedding/types.js";
import { ensureDir } from "../../src/utils/fs.js";

class FakeEmbeddingClient implements EmbeddingClient {
  public calls = 0;

  public constructor(private readonly failAfterCalls: number | null = null) {}

  public async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    await Promise.resolve();
    this.calls += 1;
    if (this.failAfterCalls !== null && this.calls > this.failAfterCalls) {
      throw new Error("interrupted");
    }

    return texts.map((text) => [text.length, text.charCodeAt(0) || 0, 1]);
  }
}

const manifest = (
  chunkId: string,
  contentHash: string,
  embeddingStatus: "pending" | "embedded" = "pending"
): EmbeddingChunkManifestEntry => ({
  chunkId,
  documentId: "doc-1",
  chunkIndex: Number.parseInt(chunkId.replace(/\D/g, ""), 10) || 0,
  tokenCount: 10,
  contentHash,
  embeddingStatus,
  embeddedAt: embeddingStatus === "embedded" ? "2026-07-09T00:00:00.000Z" : null,
  vectorId: null,
  embeddingModel: embeddingStatus === "embedded" ? "test-model" : null,
  embeddingDimensions: embeddingStatus === "embedded" ? 3 : null
});

const writeFixture = async (
  root: string,
  manifests: readonly EmbeddingChunkManifestEntry[]
): Promise<void> => {
  const indexDir = join(root, "index");
  const chunksDir = join(root, "chunks", "en", "article");
  await ensureDir(indexDir);
  await ensureDir(chunksDir);
  await writeFile(join(indexDir, "chunks.json"), `${JSON.stringify(manifests, null, 2)}\n`, "utf8");
  await writeFile(
    join(indexDir, "summary.json"),
    `${JSON.stringify({
      totalDocuments: 1,
      totalChunks: manifests.length,
      pendingEmbeddings: manifests.filter((item) => item.embeddingStatus === "pending").length,
      changedDocuments: 0,
      deletedDocuments: 0
    })}\n`,
    "utf8"
  );

  await Promise.all(
    manifests.map(async (item) => {
      await writeFile(
        join(chunksDir, `${item.chunkIndex}-${item.chunkId}.json`),
        `${JSON.stringify({
          metadata: {
            id: item.chunkId,
            sourceFile: "en/article.md",
            contentHash: item.contentHash
          },
          markdown: `# Article\n\nMarkdown for ${item.chunkId}`,
          plainText: `Article Markdown for ${item.chunkId}`
        })}\n`,
        "utf8"
      );
    })
  );
};

const runPipeline = async (
  root: string,
  client: FakeEmbeddingClient,
  resume = false,
  batchSize = 2
) => {
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const pipeline = new EmbeddingPipeline(
      new EmbeddingIndexManifestStore(join(root, "index")),
      new ChunkPayloadReader(join(root, "chunks")),
      new EmbeddingVectorStore(join(root, "embeddings")),
      client,
      { model: "test-model", batchSize, concurrency: 1, retries: 0, resume },
      pino({ enabled: false }),
      () => new Date("2026-07-09T01:02:03.000Z")
    );
    return await pipeline.run();
  } finally {
    writeSpy.mockRestore();
  }
};

describe("EmbeddingPipeline", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("embeds pending chunks successfully and updates the index", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [manifest("chunk-1", "hash-1"), manifest("chunk-2", "hash-2")]);

    const summary = await runPipeline(tempDir, new FakeEmbeddingClient());
    const updated = JSON.parse(
      await readFile(join(tempDir, "index", "chunks.json"), "utf8")
    ) as EmbeddingChunkManifestEntry[];
    const vector = JSON.parse(
      await readFile(join(tempDir, "embeddings", "chunk-1.json"), "utf8")
    ) as Record<string, unknown>;

    expect(summary.completed).toBe(2);
    expect(updated.every((item) => item.embeddingStatus === "embedded")).toBe(true);
    expect(updated[0]?.embeddingModel).toBe("test-model");
    expect(updated[0]?.embeddingDimensions).toBe(3);
    expect(updated[0]?.vectorId).toBeNull();
    expect(vector.embedding).toEqual([61, 35, 1]);
  });

  it("skips chunks that are already embedded", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [manifest("chunk-1", "hash-1", "embedded")]);
    const client = new FakeEmbeddingClient();

    const summary = await runPipeline(tempDir, client);

    expect(summary.completed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(client.calls).toBe(0);
  });

  it("resumes from existing vector files", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [manifest("chunk-1", "hash-1")]);
    const vectorPath = join(tempDir, "embeddings", "chunk-1.json");
    await ensureDir(dirname(vectorPath));
    await writeFile(
      vectorPath,
      `${JSON.stringify({
        chunkId: "chunk-1",
        contentHash: "hash-1",
        model: "test-model",
        dimensions: 3,
        embedding: [1, 2, 3],
        embeddedAt: "2026-07-09T00:00:00.000Z"
      })}\n`,
      "utf8"
    );
    const client = new FakeEmbeddingClient();

    const summary = await runPipeline(tempDir, client, true);
    const updated = JSON.parse(
      await readFile(join(tempDir, "index", "chunks.json"), "utf8")
    ) as EmbeddingChunkManifestEntry[];

    expect(summary.completed).toBe(1);
    expect(client.calls).toBe(0);
    expect(updated[0]?.embeddingStatus).toBe("embedded");
    expect(updated[0]?.embeddedAt).toBe("2026-07-09T00:00:00.000Z");
  });

  it("does not resume changed chunks when saved vector hash differs", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [manifest("chunk-1", "new-hash")]);
    const vectorPath = join(tempDir, "embeddings", "chunk-1.json");
    await ensureDir(dirname(vectorPath));
    await writeFile(
      vectorPath,
      `${JSON.stringify({
        chunkId: "chunk-1",
        contentHash: "old-hash",
        model: "test-model",
        dimensions: 3,
        embedding: [1, 2, 3],
        embeddedAt: "2026-07-09T00:00:00.000Z"
      })}\n`,
      "utf8"
    );
    const client = new FakeEmbeddingClient();

    const summary = await runPipeline(tempDir, client, true);

    expect(summary.completed).toBe(1);
    expect(client.calls).toBe(1);
  });

  it("persists completed batches when a later batch is interrupted", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [
      manifest("chunk-1", "hash-1"),
      manifest("chunk-2", "hash-2"),
      manifest("chunk-3", "hash-3")
    ]);

    const summary = await runPipeline(tempDir, new FakeEmbeddingClient(1), false, 1);
    const updated = JSON.parse(
      await readFile(join(tempDir, "index", "chunks.json"), "utf8")
    ) as EmbeddingChunkManifestEntry[];

    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(2);
    expect(updated.find((item) => item.chunkId === "chunk-1")?.embeddingStatus).toBe("embedded");
    expect(updated.find((item) => item.chunkId === "chunk-2")?.embeddingStatus).toBe("pending");
  });

  it("reports every failed batch without stopping later work", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [manifest("chunk-1", "hash-1"), manifest("chunk-2", "hash-2")]);
    const failures: string[][] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const summary = await new EmbeddingPipeline(
        new EmbeddingIndexManifestStore(join(tempDir, "index")),
        new ChunkPayloadReader(join(tempDir, "chunks")),
        new EmbeddingVectorStore(join(tempDir, "embeddings")),
        new FakeEmbeddingClient(0),
        { model: "test-model", batchSize: 1, concurrency: 1, retries: 0, resume: true },
        pino({ enabled: false }),
        () => new Date("2026-07-09T01:02:03.000Z"),
        (chunks) => {
          failures.push(chunks.map((chunk) => chunk.manifest.chunkId));
        }
      ).run();

      expect(summary.failed).toBe(2);
      expect(failures).toEqual([["chunk-1"], ["chunk-2"]]);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("produces deterministic vector file content with deterministic client and clock", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-embed-"));
    await writeFixture(tempDir, [manifest("chunk-1", "hash-1")]);

    await runPipeline(tempDir, new FakeEmbeddingClient());
    const first = await readFile(join(tempDir, "embeddings", "chunk-1.json"), "utf8");
    await writeFixture(tempDir, [manifest("chunk-1", "hash-1")]);
    await runPipeline(tempDir, new FakeEmbeddingClient());
    const second = await readFile(join(tempDir, "embeddings", "chunk-1.json"), "utf8");

    expect(first).toBe(second);
  });
});
