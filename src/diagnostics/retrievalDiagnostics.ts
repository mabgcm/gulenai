import type { EmbeddingVectorReader } from "../qdrant/qdrantDataReaders.js";
import type { QdrantIndexStore } from "../qdrant/qdrantIndexStore.js";
import type { EmbeddingVectorFile } from "../qdrant/types.js";
import type { QdrantDiagnosticsClient } from "./qdrantDiagnosticsClient.js";
import type { RetrievalDiagnosticsReport } from "./types.js";

export class RetrievalDiagnostics {
  public constructor(
    private readonly collection: string,
    private readonly embeddingModel: string,
    private readonly indexStore: QdrantIndexStore,
    private readonly vectorReader: EmbeddingVectorReader,
    private readonly qdrant: QdrantDiagnosticsClient
  ) {}

  public async run(): Promise<RetrievalDiagnosticsReport> {
    const emptyVectors: ReadonlyMap<string, EmbeddingVectorFile> = new Map();
    const [documents, chunks, vectors, remote] = await Promise.all([
      this.indexStore.loadDocuments(),
      this.indexStore.loadChunks(),
      this.vectorReader.readByChunkId().catch(() => emptyVectors),
      this.qdrant.inspectCollection(this.collection)
    ]);

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
