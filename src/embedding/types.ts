export interface EmbeddingConfig {
  readonly model: string;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly retries: number;
  readonly resume: boolean;
}

export interface EmbeddingChunkManifestEntry {
  readonly chunkId: string;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly tokenCount: number;
  readonly contentHash: string;
  readonly embeddingStatus: "pending" | "embedded" | "deleted";
  readonly embeddedAt: string | null;
  readonly vectorId: string | null;
  readonly embeddingModel?: string | null;
  readonly embeddingDimensions?: number | null;
}

export interface EmbeddingIndexSummary {
  readonly totalDocuments: number;
  readonly totalChunks: number;
  readonly pendingEmbeddings: number;
  readonly changedDocuments: number;
  readonly deletedDocuments: number;
}

export interface ChunkJsonForEmbedding {
  readonly metadata: {
    readonly id: string;
    readonly contentHash: string;
    readonly sourceFile: string;
  };
  readonly markdown: string;
  readonly plainText: string;
}

export interface PendingEmbeddingChunk {
  readonly manifest: EmbeddingChunkManifestEntry;
  readonly chunk: ChunkJsonForEmbedding;
}

export interface EmbeddingVectorFile {
  readonly chunkId: string;
  readonly contentHash: string;
  readonly model: string;
  readonly dimensions: number;
  readonly embedding: readonly number[];
  readonly embeddedAt: string;
}

export interface EmbeddingResult {
  readonly chunkId: string;
  readonly contentHash: string;
  readonly model: string;
  readonly embedding: readonly number[];
  readonly embeddedAt: string;
}

export interface EmbeddingProgress {
  readonly pendingChunks: number;
  readonly completed: number;
  readonly remaining: number;
}

export interface EmbeddingSummary extends EmbeddingProgress {
  readonly skipped: number;
  readonly failed: number;
}
