import type { Logger } from "../config/logger.js";
import type { EmbeddingVectorReader, QdrantChunkPayloadReader } from "./qdrantDataReaders.js";
import type { QdrantIndexStore } from "./qdrantIndexStore.js";
import type { QdrantVectorClient } from "./qdrantClient.js";
import { withQdrantRetry } from "./retry.js";
import type {
  QdrantChunkEntry,
  QdrantConfig,
  QdrantDocumentEntry,
  QdrantPoint,
  QdrantRemotePoint,
  QdrantStatus,
  QdrantSyncCandidate,
  QdrantSyncSummary
} from "./types.js";
import { vectorIdForChunk } from "./vectorId.js";

const batch = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const pointFromCandidate = (candidate: QdrantSyncCandidate): QdrantPoint => ({
  id: candidate.vectorId,
  vector: candidate.vector.embedding,
  payload: {
    chunkId: candidate.manifest.chunkId,
    documentId: candidate.manifest.documentId,
    url: candidate.chunk.metadata.url,
    title: candidate.chunk.metadata.title,
    language: candidate.chunk.metadata.language,
    headingPath: candidate.chunk.metadata.headingPath,
    chunkIndex: candidate.chunk.metadata.chunkIndex,
    totalChunks: candidate.chunk.metadata.totalChunks,
    tokenCount: candidate.chunk.metadata.tokenCount,
    contentHash: candidate.chunk.metadata.contentHash,
    source: candidate.chunk.metadata.sourceFile,
    content: candidate.chunk.markdown
  }
});

export class QdrantSyncPipeline {
  public constructor(
    private readonly indexStore: QdrantIndexStore,
    private readonly vectorReader: EmbeddingVectorReader,
    private readonly chunkReader: QdrantChunkPayloadReader,
    private readonly client: QdrantVectorClient,
    private readonly config: QdrantConfig,
    private readonly logger: Logger
  ) {}

  public async sync(): Promise<QdrantSyncSummary> {
    const documents = await this.indexStore.loadDocuments();
    const manifests = await this.indexStore.loadChunks();
    const vectors = await this.vectorReader.readByChunkId();
    const chunks = await this.chunkReader.readByChunkId();
    const remotePoints = await withQdrantRetry(
      () => this.client.listPoints(this.config.collection),
      this.config.retries,
      this.logger,
      { collection: this.config.collection, operation: "listPoints" }
    );
    const remoteByChunkId = new Map(
      remotePoints.flatMap((point) =>
        point.chunkId === null ? [] : ([[point.chunkId, point]] as const)
      )
    );

    const manifestById = new Map(manifests.map((manifest) => [manifest.chunkId, manifest]));
    const uploadCandidates = manifests
      .filter(
        (manifest) =>
          manifest.embeddingStatus === "pending" ||
          manifest.vectorId === null ||
          remoteByChunkId.get(manifest.chunkId)?.payloadHasContent !== true
      )
      .map((manifest) => {
        const vector = vectors.get(manifest.chunkId);
        const chunk = chunks.get(manifest.chunkId);
        if (
          vector === undefined ||
          chunk === undefined ||
          vector.contentHash !== manifest.contentHash ||
          chunk.metadata.contentHash !== manifest.contentHash ||
          manifest.embeddingStatus === "deleted"
        ) {
          return null;
        }

        return {
          manifest,
          vector,
          chunk,
          vectorId: manifest.vectorId ?? vectorIdForChunk(manifest.chunkId)
        };
      })
      .filter((candidate): candidate is QdrantSyncCandidate => candidate !== null);

    const deleteIds = this.deletedVectorIds(documents, manifests);
    const firstDimension = uploadCandidates[0]?.vector.dimensions;
    if (firstDimension !== undefined) {
      await this.ensureCollection(firstDimension);
    }

    let uploadedVectors = 0;
    let deletedVectors = 0;
    await this.uploadCandidates(uploadCandidates, manifestById, manifests, (count) => {
      uploadedVectors += count;
    });
    deletedVectors = await this.deleteVectors(deleteIds, manifestById, manifests);
    deletedVectors += await this.deleteOrphanVectors(
      [...manifestById.values()],
      remotePoints,
      new Set(deleteIds)
    );

    const vectorsCount = await withQdrantRetry(
      () => this.client.count(this.config.collection),
      this.config.retries,
      this.logger,
      { collection: this.config.collection, operation: "count" }
    );
    const pendingUploads = [...manifestById.values()].filter(
      (manifest) =>
        manifest.embeddingStatus !== "deleted" &&
        (manifest.embeddingStatus === "pending" || manifest.vectorId === null)
    ).length;

    return {
      collection: this.config.collection,
      vectors: vectorsCount,
      pendingUploads,
      deletedVectors,
      uploadedVectors
    };
  }

  public async status(): Promise<QdrantStatus> {
    const documents = await this.indexStore.loadDocuments();
    const manifests = await this.indexStore.loadChunks();
    const vectors = await withQdrantRetry(
      () => this.client.count(this.config.collection),
      this.config.retries,
      this.logger,
      { collection: this.config.collection, operation: "count" }
    );
    const remotePoints = await withQdrantRetry(
      () => this.client.listPoints(this.config.collection),
      this.config.retries,
      this.logger,
      { collection: this.config.collection, operation: "listPoints" }
    );
    const remoteWithContent = new Set(
      remotePoints
        .filter((point) => point.chunkId !== null && point.payloadHasContent)
        .map((point) => point.chunkId)
    );

    return {
      collection: this.config.collection,
      vectors,
      pendingUploads: manifests.filter(
        (manifest) =>
          manifest.embeddingStatus !== "deleted" &&
          (manifest.embeddingStatus === "pending" ||
            manifest.vectorId === null ||
            !remoteWithContent.has(manifest.chunkId))
      ).length,
      deletedVectors: this.deletedVectorIds(documents, manifests).length
    };
  }

  private async ensureCollection(dimensions: number): Promise<void> {
    const exists = await withQdrantRetry(
      () => this.client.collectionExists(this.config.collection),
      this.config.retries,
      this.logger,
      { collection: this.config.collection, operation: "collectionExists" }
    );
    if (exists) {
      return;
    }

    await withQdrantRetry(
      () => this.client.createCollection(this.config.collection, dimensions),
      this.config.retries,
      this.logger,
      { collection: this.config.collection, operation: "createCollection", dimensions }
    );
  }

  private async uploadCandidates(
    candidates: readonly QdrantSyncCandidate[],
    manifestById: Map<string, QdrantChunkEntry>,
    manifests: readonly QdrantChunkEntry[],
    onUploaded: (count: number) => void
  ): Promise<void> {
    const batches = batch(candidates, Math.max(1, this.config.batchSize));
    let nextBatch = 0;
    let saveQueue = Promise.resolve();

    const enqueueSave = async (): Promise<void> => {
      saveQueue = saveQueue.then(() => this.saveManifests(manifests, manifestById));
      await saveQueue;
    };

    const worker = async (): Promise<void> => {
      while (nextBatch < batches.length) {
        const current = batches[nextBatch];
        nextBatch += 1;
        if (current === undefined || current.length === 0) {
          continue;
        }

        await withQdrantRetry(
          () => this.client.upsert(this.config.collection, current.map(pointFromCandidate)),
          this.config.retries,
          this.logger,
          { collection: this.config.collection, operation: "upsert", batchSize: current.length }
        );

        for (const candidate of current) {
          manifestById.set(candidate.manifest.chunkId, {
            ...candidate.manifest,
            vectorId: candidate.vectorId,
            embeddingStatus: "embedded",
            embeddedAt: candidate.vector.embeddedAt,
            embeddingModel: candidate.vector.model,
            embeddingDimensions: candidate.vector.dimensions
          });
        }

        onUploaded(current.length);
        await enqueueSave();
      }
    };

    await Promise.all(
      Array.from({ length: Math.max(1, this.config.concurrency) }, async () => worker())
    );
    await saveQueue;
    await this.saveManifests(manifests, manifestById);
  }

  private async deleteVectors(
    vectorIds: readonly string[],
    manifestById: Map<string, QdrantChunkEntry>,
    manifests: readonly QdrantChunkEntry[]
  ): Promise<number> {
    let deleted = 0;
    for (const ids of batch(vectorIds, Math.max(1, this.config.batchSize))) {
      await withQdrantRetry(
        () => this.client.delete(this.config.collection, ids),
        this.config.retries,
        this.logger,
        { collection: this.config.collection, operation: "delete", batchSize: ids.length }
      );
      deleted += ids.length;

      for (const manifest of manifestById.values()) {
        if (manifest.vectorId !== null && ids.includes(manifest.vectorId)) {
          manifestById.set(manifest.chunkId, { ...manifest, vectorId: null });
        }
      }
      await this.saveManifests(manifests, manifestById);
    }
    return deleted;
  }

  private async deleteOrphanVectors(
    manifests: readonly QdrantChunkEntry[],
    remotePoints: readonly QdrantRemotePoint[],
    alreadyDeleted: ReadonlySet<string>
  ): Promise<number> {
    const localChunkIds = new Set(
      manifests
        .filter((manifest) => manifest.embeddingStatus !== "deleted")
        .map((manifest) => manifest.chunkId)
    );
    const orphanIds = remotePoints
      .filter(
        (point) =>
          !alreadyDeleted.has(point.id) &&
          (point.chunkId === null || !localChunkIds.has(point.chunkId))
      )
      .map((point) => point.id);
    let deleted = 0;
    for (const ids of batch(orphanIds, Math.max(1, this.config.batchSize))) {
      await withQdrantRetry(
        () => this.client.delete(this.config.collection, ids),
        this.config.retries,
        this.logger,
        { collection: this.config.collection, operation: "deleteOrphans", batchSize: ids.length }
      );
      deleted += ids.length;
    }
    return deleted;
  }

  private deletedVectorIds(
    documents: readonly QdrantDocumentEntry[],
    manifests: readonly QdrantChunkEntry[]
  ): readonly string[] {
    const deletedDocumentIds = new Set(
      documents
        .filter((document) => document.status === "deleted")
        .map((document) => document.documentId)
    );

    return manifests
      .filter(
        (manifest) =>
          manifest.vectorId !== null &&
          (manifest.embeddingStatus === "deleted" || deletedDocumentIds.has(manifest.documentId))
      )
      .map((manifest) => manifest.vectorId)
      .filter((id): id is string => id !== null);
  }

  private async saveManifests(
    manifests: readonly QdrantChunkEntry[],
    manifestById: ReadonlyMap<string, QdrantChunkEntry>
  ): Promise<void> {
    await this.indexStore.saveChunks(
      manifests.map((manifest) => manifestById.get(manifest.chunkId) ?? manifest)
    );
  }
}
