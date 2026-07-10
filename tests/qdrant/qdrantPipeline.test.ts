import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import type { QdrantVectorClient } from "../../src/qdrant/qdrantClient.js";
import {
  EmbeddingVectorReader,
  QdrantChunkPayloadReader
} from "../../src/qdrant/qdrantDataReaders.js";
import { QdrantIndexStore } from "../../src/qdrant/qdrantIndexStore.js";
import { QdrantSyncPipeline } from "../../src/qdrant/qdrantPipeline.js";
import type { QdrantChunkEntry, QdrantDocumentEntry, QdrantPoint } from "../../src/qdrant/types.js";
import { vectorIdForChunk } from "../../src/qdrant/vectorId.js";
import { ensureDir } from "../../src/utils/fs.js";

class RetryableQdrantError extends Error {
  public constructor(public readonly status: number) {
    super(`Qdrant ${status}`);
  }
}

class FakeQdrantClient implements QdrantVectorClient {
  public exists = false;
  public createdDimensions: number | null = null;
  public upsertCalls = 0;
  public deleteCalls = 0;
  public failUpsertOnce = false;
  public failAfterUpsertCalls: number | null = null;
  public readonly points = new Map<string, QdrantPoint>();
  public readonly deletedIds: string[] = [];

  public async collectionExists(): Promise<boolean> {
    await Promise.resolve();
    return this.exists;
  }

  public async createCollection(_collection: string, dimensions: number): Promise<void> {
    await Promise.resolve();
    this.exists = true;
    this.createdDimensions = dimensions;
  }

  public async count(): Promise<number> {
    await Promise.resolve();
    return this.points.size;
  }

  public async listPoints(): Promise<readonly { readonly id: string; readonly chunkId: string | null }[]> {
    await Promise.resolve();
    return [...this.points.values()].map((point) => ({
      id: point.id,
      chunkId:
        typeof (point.payload as { chunkId?: unknown }).chunkId === "string"
          ? (point.payload as { chunkId: string }).chunkId
          : null
    }));
  }

  public async upsert(_collection: string, points: readonly QdrantPoint[]): Promise<void> {
    await Promise.resolve();
    this.upsertCalls += 1;
    if (this.failUpsertOnce) {
      this.failUpsertOnce = false;
      throw new RetryableQdrantError(500);
    }
    if (this.failAfterUpsertCalls !== null && this.upsertCalls > this.failAfterUpsertCalls) {
      throw new Error("interrupted");
    }
    for (const point of points) {
      this.points.set(point.id, point);
    }
  }

  public async delete(_collection: string, vectorIds: readonly string[]): Promise<void> {
    await Promise.resolve();
    this.deleteCalls += 1;
    for (const id of vectorIds) {
      this.points.delete(id);
      this.deletedIds.push(id);
    }
  }
}

const chunkManifest = (
  chunkId: string,
  contentHash: string,
  overrides: Partial<QdrantChunkEntry> = {}
): QdrantChunkEntry => ({
  chunkId,
  documentId: "doc-1",
  chunkIndex: Number.parseInt(chunkId.replace(/\D/g, ""), 10) || 0,
  tokenCount: 100,
  contentHash,
  embeddingStatus: "embedded",
  embeddedAt: "2026-07-09T01:00:00.000Z",
  vectorId: null,
  embeddingModel: "test-model",
  embeddingDimensions: 3,
  ...overrides
});

const documentManifest = (overrides: Partial<QdrantDocumentEntry> = {}): QdrantDocumentEntry => ({
  documentId: "doc-1",
  sourceFile: "en/article.md",
  url: "https://fgulen.com/en/article",
  title: "Article",
  language: "en",
  crawlDate: "2026-07-09T00:00:00.000Z",
  contentHash: "document-hash",
  totalChunks: 1,
  version: 1,
  status: "unchanged",
  lastIndexedAt: "2026-07-09T01:00:00.000Z",
  ...overrides
});

const writeFixture = async (
  root: string,
  chunks: readonly QdrantChunkEntry[],
  documents: readonly QdrantDocumentEntry[] = [documentManifest()]
): Promise<void> => {
  const indexDir = join(root, "index");
  const chunksDir = join(root, "chunks", "en", "article");
  const embeddingsDir = join(root, "embeddings");
  await ensureDir(indexDir);
  await ensureDir(chunksDir);
  await ensureDir(embeddingsDir);
  await writeFile(
    join(indexDir, "documents.json"),
    `${JSON.stringify(documents, null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(indexDir, "chunks.json"), `${JSON.stringify(chunks, null, 2)}\n`, "utf8");
  await writeFile(
    join(indexDir, "summary.json"),
    `${JSON.stringify({
      totalDocuments: documents.length,
      totalChunks: chunks.length,
      pendingEmbeddings: chunks.filter((chunk) => chunk.embeddingStatus === "pending").length,
      changedDocuments: 0,
      deletedDocuments: documents.filter((document) => document.status === "deleted").length
    })}\n`,
    "utf8"
  );

  await Promise.all(
    chunks.map(async (chunk) => {
      await writeFile(
        join(embeddingsDir, `${chunk.chunkId}.json`),
        `${JSON.stringify({
          chunkId: chunk.chunkId,
          contentHash: chunk.contentHash,
          model: "test-model",
          dimensions: 3,
          embedding: [1, 2, 3],
          embeddedAt: "2026-07-09T01:02:03.000Z"
        })}\n`,
        "utf8"
      );
      await writeFile(
        join(chunksDir, `${chunk.chunkIndex}-${chunk.chunkId}.json`),
        `${JSON.stringify({
          metadata: {
            id: chunk.chunkId,
            sourceFile: "en/article.md",
            url: "https://fgulen.com/en/article",
            title: "Article",
            language: "en",
            headingPath: ["Article"],
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunks.length,
            tokenCount: chunk.tokenCount,
            contentHash: chunk.contentHash
          },
          markdown: "# Article",
          plainText: "Article"
        })}\n`,
        "utf8"
      );
    })
  );
};

const pipeline = (root: string, client: FakeQdrantClient, retries = 0): QdrantSyncPipeline =>
  new QdrantSyncPipeline(
    new QdrantIndexStore(join(root, "index")),
    new EmbeddingVectorReader(join(root, "embeddings")),
    new QdrantChunkPayloadReader(join(root, "chunks")),
    client,
    { collection: "fgulen", batchSize: 1, concurrency: 1, retries, resume: false },
    pino({ enabled: false })
  );

describe("QdrantSyncPipeline", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("creates the collection and uploads vectors", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    await writeFixture(tempDir, [chunkManifest("chunk-1", "hash-1")]);
    const client = new FakeQdrantClient();

    const summary = await pipeline(tempDir, client).sync();
    const updated = JSON.parse(
      await readFile(join(tempDir, "index", "chunks.json"), "utf8")
    ) as QdrantChunkEntry[];

    expect(client.createdDimensions).toBe(3);
    expect(client.points.size).toBe(1);
    expect(updated[0]?.vectorId).toBe(vectorIdForChunk("chunk-1"));
    expect(updated[0]?.embeddingStatus).toBe("embedded");
    expect(summary.uploadedVectors).toBe(1);
  });

  it("retries upload failures", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    await writeFixture(tempDir, [chunkManifest("chunk-1", "hash-1")]);
    const client = new FakeQdrantClient();
    client.failUpsertOnce = true;

    const summary = await pipeline(tempDir, client, 1).sync();

    expect(client.upsertCalls).toBe(2);
    expect(summary.uploadedVectors).toBe(1);
  });

  it("supports interruption and resume through persisted vector IDs", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    await writeFixture(tempDir, [
      chunkManifest("chunk-1", "hash-1"),
      chunkManifest("chunk-2", "hash-2")
    ]);
    const interrupted = new FakeQdrantClient();
    interrupted.failAfterUpsertCalls = 1;

    await expect(pipeline(tempDir, interrupted).sync()).rejects.toThrow("interrupted");
    const partiallyUpdated = JSON.parse(
      await readFile(join(tempDir, "index", "chunks.json"), "utf8")
    ) as QdrantChunkEntry[];
    expect(partiallyUpdated.find((chunk) => chunk.chunkId === "chunk-1")?.vectorId).toBe(
      vectorIdForChunk("chunk-1")
    );
    expect(partiallyUpdated.find((chunk) => chunk.chunkId === "chunk-2")?.vectorId).toBeNull();

    const resumed = new FakeQdrantClient();
    await pipeline(tempDir, resumed).sync();
    expect(resumed.upsertCalls).toBe(1);
    expect(resumed.points.has(vectorIdForChunk("chunk-2"))).toBe(true);
  });

  it("deletes vectors for deleted documents", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    const vectorId = vectorIdForChunk("chunk-1");
    await writeFixture(
      tempDir,
      [chunkManifest("chunk-1", "hash-1", { embeddingStatus: "deleted", vectorId })],
      [documentManifest({ status: "deleted" })]
    );
    const client = new FakeQdrantClient();
    client.exists = true;
    client.points.set(vectorId, { id: vectorId, vector: [1, 2, 3], payload: {} as never });

    const summary = await pipeline(tempDir, client).sync();
    const updated = JSON.parse(
      await readFile(join(tempDir, "index", "chunks.json"), "utf8")
    ) as QdrantChunkEntry[];

    expect(client.deletedIds).toEqual([vectorId]);
    expect(updated[0]?.vectorId).toBeNull();
    expect(summary.deletedVectors).toBe(1);
  });

  it("prevents duplicate uploads when vectorId already exists", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    await writeFixture(tempDir, [
      chunkManifest("chunk-1", "hash-1", { vectorId: vectorIdForChunk("chunk-1") })
    ]);
    const client = new FakeQdrantClient();
    client.exists = true;

    const summary = await pipeline(tempDir, client).sync();

    expect(client.upsertCalls).toBe(0);
    expect(summary.pendingUploads).toBe(0);
  });

  it("reports Qdrant status", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    const vectorId = vectorIdForChunk("chunk-1");
    await writeFixture(tempDir, [
      chunkManifest("chunk-1", "hash-1", { vectorId }),
      chunkManifest("chunk-2", "hash-2", { embeddingStatus: "pending" })
    ]);
    const client = new FakeQdrantClient();
    client.points.set(vectorId, { id: vectorId, vector: [1, 2, 3], payload: {} as never });

    const status = await pipeline(tempDir, client).status();

    expect(status).toEqual({
      collection: "fgulen",
      vectors: 1,
      pendingUploads: 1,
      deletedVectors: 0
    });
  });

  it("deletes orphan remote vectors during sync", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-qdrant-"));
    const vectorId = vectorIdForChunk("chunk-1");
    await writeFixture(tempDir, [
      chunkManifest("chunk-1", "hash-1", { vectorId })
    ]);
    const client = new FakeQdrantClient();
    client.exists = true;
    client.points.set(vectorId, {
      id: vectorId,
      vector: [1, 2, 3],
      payload: { chunkId: "chunk-1" } as never
    });
    client.points.set("orphan", {
      id: "orphan",
      vector: [1, 2, 3],
      payload: { chunkId: "missing" } as never
    });

    const summary = await pipeline(tempDir, client).sync();

    expect(client.points.has("orphan")).toBe(false);
    expect(client.deletedIds).toContain("orphan");
    expect(summary.deletedVectors).toBe(1);
    expect(summary.pendingUploads).toBe(0);
  });
});
