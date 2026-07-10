import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QueryEmbeddingClient, SearchHit } from "../../src/search/types.js";
import type { VectorSearchClient } from "../../src/search/qdrantSearchClient.js";
import { ChunkContentStore } from "../../src/search/chunkContentStore.js";
import { EmbeddingVectorReader } from "../../src/qdrant/qdrantDataReaders.js";
import { QdrantIndexStore } from "../../src/qdrant/qdrantIndexStore.js";
import type { QdrantDiagnosticsClient } from "../../src/diagnostics/qdrantDiagnosticsClient.js";
import { RetrievalDiagnostics } from "../../src/diagnostics/retrievalDiagnostics.js";
import { SearchValidator } from "../../src/diagnostics/validateSearch.js";
import { CrawlStore } from "../../src/storage/crawlStore.js";

class FakeQdrantDiagnosticsClient implements QdrantDiagnosticsClient {
  public async inspectCollection() {
    await Promise.resolve();
    return {
      connected: true,
      collectionExists: true,
      vectorCount: 2,
      embeddingDimensions: 3,
      remotePoints: [
        { id: "remote-1", chunkId: "chunk-1" },
        { id: "orphan", chunkId: "missing-local" }
      ],
      error: null
    };
  }
}

class FakeEmbedder implements QueryEmbeddingClient {
  public async embedQuery(): Promise<readonly number[]> {
    await Promise.resolve();
    return [0.1, 0.2, 0.3];
  }
}

class FakeSearchClient implements VectorSearchClient {
  public constructor(private readonly hits: readonly SearchHit[]) {}

  public async search(): Promise<readonly SearchHit[]> {
    await Promise.resolve();
    return this.hits;
  }
}

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

describe("retrieval diagnostics", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  const setup = async (): Promise<{
    indexDir: string;
    embeddingsDir: string;
    chunksDir: string;
    dataDir: string;
  }> => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-diagnostics-"));
    const indexDir = join(tempDir, "index");
    const embeddingsDir = join(tempDir, "embeddings");
    const chunksDir = join(tempDir, "chunks");
    await Promise.all([mkdir(indexDir), mkdir(embeddingsDir), mkdir(chunksDir)]);
    await writeJson(join(indexDir, "documents.json"), [
      {
        documentId: "doc-1",
        sourceFile: "doc.md",
        url: "https://example.test/doc",
        title: "Doc",
        language: "tr",
        crawlDate: null,
        contentHash: "doc-hash",
        totalChunks: 2,
        version: 1,
        status: "new",
        lastIndexedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    await writeJson(join(indexDir, "chunks.json"), [
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        chunkIndex: 0,
        tokenCount: 20,
        contentHash: "hash-1",
        embeddingStatus: "embedded",
        embeddedAt: "2026-01-01T00:00:00.000Z",
        vectorId: "remote-1",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 3
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-1",
        chunkIndex: 1,
        tokenCount: 20,
        contentHash: "hash-2",
        embeddingStatus: "embedded",
        embeddedAt: "2026-01-01T00:00:00.000Z",
        vectorId: "remote-2",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 3
      },
      {
        chunkId: "chunk-3",
        documentId: "doc-1",
        chunkIndex: 2,
        tokenCount: 20,
        contentHash: "hash-3",
        embeddingStatus: "pending",
        embeddedAt: null,
        vectorId: null
      }
    ]);
    await writeJson(join(embeddingsDir, "chunk-1.json"), {
      chunkId: "chunk-1",
      contentHash: "hash-1",
      model: "text-embedding-3-small",
      dimensions: 3,
      embedding: [0.1, 0.2, 0.3],
      embeddedAt: "2026-01-01T00:00:00.000Z"
    });
    await writeJson(join(chunksDir, "chunk-1.json"), {
      metadata: {
        id: "chunk-1",
        sourceFile: "doc.md",
        title: "Doc",
        url: "https://example.test/doc",
        language: "tr",
        headingPath: ["Doc", "Heading"],
        chunkIndex: 0,
        totalChunks: 3,
        tokenCount: 20,
        contentHash: "hash-1"
      },
      markdown: "This is the first chunk with useful content for retrieval diagnostics.",
      plainText: "This is the first chunk with useful content for retrieval diagnostics."
    });
    return { indexDir, embeddingsDir, chunksDir, dataDir: tempDir };
  };

  it("reports local and remote retrieval health", async () => {
    const dirs = await setup();
    const report = await new RetrievalDiagnostics(
      "fgulen",
      "text-embedding-3-small",
      new QdrantIndexStore(dirs.indexDir),
      new EmbeddingVectorReader(dirs.embeddingsDir),
      new FakeQdrantDiagnosticsClient(),
      new CrawlStore(dirs.dataDir)
    ).run();

    expect(report).toMatchObject({
      qdrantConnected: true,
      collectionExists: true,
      vectorCount: 2,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 3,
      indexedDocuments: 1,
      indexedChunks: 3,
      embeddedChunks: 2,
      pendingChunks: 1
    });
    expect(report.missingVectors).toEqual(["chunk-2"]);
    expect(report.orphanVectors).toEqual(["orphan"]);
  });

  it("validates search hits with previews", async () => {
    const dirs = await setup();
    const diagnostics = await new RetrievalDiagnostics(
      "fgulen",
      "text-embedding-3-small",
      new QdrantIndexStore(dirs.indexDir),
      new EmbeddingVectorReader(dirs.embeddingsDir),
      new FakeQdrantDiagnosticsClient(),
      new CrawlStore(dirs.dataDir)
    ).run();
    const report = await new SearchValidator(
      "fgulen",
      new FakeEmbedder(),
      new FakeSearchClient([
        {
          id: "remote-1",
          score: 0.91,
          payload: {
            chunkId: "chunk-1",
            documentId: "doc-1",
            url: "https://example.test/doc",
            title: "Doc",
            language: "tr",
            headingPath: ["Doc", "Heading"],
            chunkIndex: 0,
            totalChunks: 3,
            tokenCount: 20,
            contentHash: "hash-1",
            sourceFile: "doc.md",
            content: "# Doc\n\nuseful content"
          }
        }
      ]),
      new ChunkContentStore(dirs.chunksDir)
    ).validate("query", {}, diagnostics);

    expect(report.queryEmbeddingDimensions).toBe(3);
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0]?.snippet).toContain("useful content");
    expect(report.likelyCause).toBeNull();
  });

  it("explains zero search results", async () => {
    const dirs = await setup();
    const diagnostics = await new RetrievalDiagnostics(
      "fgulen",
      "text-embedding-3-small",
      new QdrantIndexStore(dirs.indexDir),
      new EmbeddingVectorReader(dirs.embeddingsDir),
      new FakeQdrantDiagnosticsClient(),
      new CrawlStore(dirs.dataDir)
    ).run();
    const report = await new SearchValidator(
      "fgulen",
      new FakeEmbedder(),
      new FakeSearchClient([]),
      new ChunkContentStore(dirs.chunksDir)
    ).validate("query", { language: "tr" }, diagnostics);

    expect(report.hits).toHaveLength(0);
    expect(report.likelyCause).toContain("pending chunks");
  });
});
