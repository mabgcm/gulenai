import type { EmbeddingVectorReader } from "../qdrant/qdrantDataReaders.js";
import type { QdrantIndexStore } from "../qdrant/qdrantIndexStore.js";
import type { EmbeddingVectorFile } from "../qdrant/types.js";
import type { CrawlStore } from "../storage/crawlStore.js";
import { filesystemConcurrencyStats } from "../utils/fs.js";
import type { QdrantDiagnosticsClient } from "./qdrantDiagnosticsClient.js";
import type { RetrievalDiagnosticsReport } from "./types.js";

const openFileStatistics = (): string => {
  const processWithHandles = process as NodeJS.Process & {
    _getActiveHandles?: () => readonly unknown[];
  };
  const handles = processWithHandles._getActiveHandles?.() ?? [];
  return `active handles: ${handles.length}`;
};

export class RetrievalDiagnostics {
  public constructor(
    private readonly collection: string,
    private readonly embeddingModel: string,
    private readonly indexStore: QdrantIndexStore,
    private readonly vectorReader: EmbeddingVectorReader,
    private readonly qdrant: QdrantDiagnosticsClient,
    private readonly crawlStore: CrawlStore
  ) {}

  public async run(): Promise<RetrievalDiagnosticsReport> {
    const emptyVectors: ReadonlyMap<string, EmbeddingVectorFile> = new Map();
    const documents = await this.indexStore.loadDocuments();
    const chunks = await this.indexStore.loadChunks();
    const vectors = await this.vectorReader.readByChunkId().catch(() => emptyVectors);
    const remote = await this.qdrant.inspectCollection(this.collection);
    const crawlState = await this.crawlStore.loadState();
    const fsStats = filesystemConcurrencyStats();
    const memory = process.memoryUsage();

    const remoteChunkIds = new Set(
      remote.remotePoints
        .map((point) => point.chunkId)
        .filter((chunkId): chunkId is string => chunkId !== null)
    );
    const localChunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
    const embeddedChunks = chunks.filter((chunk) => chunk.embeddingStatus === "embedded");
    const missingVectors = embeddedChunks
      .filter((chunk) => chunk.vectorId === null || !remoteChunkIds.has(chunk.chunkId))
      .map((chunk) => chunk.chunkId)
      .sort();
    const orphanVectors = remote.remotePoints
      .filter((point) => point.chunkId === null || !localChunkIds.has(point.chunkId))
      .map((point) => point.id)
      .sort();
    const vectorDimensions = [...vectors.values()][0]?.dimensions ?? null;
    const vectorModel = [...vectors.values()][0]?.model ?? this.embeddingModel;
    const errors = remote.error === null ? [] : [remote.error];

    return {
      generatedAt: new Date().toISOString(),
      collection: this.collection,
      queueSize: crawlState?.queue.length ?? 0,
      resumeStatus:
        crawlState === null
          ? "no saved crawl state"
          : crawlState.queue.length > 0
            ? "resumable"
            : "complete",
      remainingUrls: crawlState?.queue.slice(0, 25).map((target) => target.url) ?? [],
      filesystemConcurrency: fsStats.concurrency,
      pendingFilesystemJobs: fsStats.pending,
      activeFilesystemJobs: fsStats.active,
      openFileStatistics: openFileStatistics(),
      memoryUsage: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external
      },
      qdrantConnected: remote.connected,
      collectionExists: remote.collectionExists,
      vectorCount: remote.vectorCount,
      embeddingModel: vectorModel,
      embeddingDimensions: remote.embeddingDimensions ?? vectorDimensions,
      indexedDocuments: documents.filter((document) => document.status !== "deleted").length,
      indexedChunks: chunks.filter((chunk) => chunk.embeddingStatus !== "deleted").length,
      embeddedChunks: embeddedChunks.length,
      pendingChunks: chunks.filter((chunk) => chunk.embeddingStatus === "pending").length,
      missingVectors,
      orphanVectors,
      errors
    };
  }
}
