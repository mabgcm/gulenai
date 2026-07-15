export interface QdrantConfig {
  readonly collection: string;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly retries: number;
  readonly resume: boolean;
}

export interface QdrantDocumentEntry {
  readonly documentId: string;
  readonly sourceFile: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly language: string | null;
  readonly crawlDate: string | null;
  readonly contentHash: string;
  readonly totalChunks: number;
  readonly version: number;
  readonly status: "new" | "unchanged" | "changed" | "deleted";
  readonly lastIndexedAt: string;
}

export interface QdrantChunkEntry {
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

export interface QdrantIndexSummary {
  readonly totalDocuments: number;
  readonly totalChunks: number;
  readonly pendingEmbeddings: number;
  readonly changedDocuments: number;
  readonly deletedDocuments: number;
}

export interface QdrantChunkPayloadMetadata {
  readonly id: string;
  readonly sourceFile: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly language: string | null;
  readonly headingPath: readonly string[];
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly tokenCount: number;
  readonly contentHash: string;
  readonly knowledgeSource?: string | null;
  readonly book?: string | null;
  readonly section?: string | null;
  readonly subsection?: string | null;
  readonly canonicalUrl?: string | null;
  readonly sourceAttribution?: string | null;
  readonly copyrightNotices?: readonly string[];
}

export interface QdrantChunkPayloadFile {
  readonly metadata: QdrantChunkPayloadMetadata;
  readonly markdown: string;
  readonly plainText: string;
}

export interface EmbeddingVectorFile {
  readonly chunkId: string;
  readonly contentHash: string;
  readonly model: string;
  readonly dimensions: number;
  readonly embedding: readonly number[];
  readonly embeddedAt: string;
}

export interface QdrantPayload {
  readonly chunkId: string;
  readonly documentId: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly language: string | null;
  readonly headingPath: readonly string[];
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly tokenCount: number;
  readonly contentHash: string;
  readonly source: string;
  readonly content: string;
  readonly knowledgeSource?: string;
  readonly book?: string;
  readonly section?: string;
  readonly subsection?: string | null;
  readonly canonicalUrl?: string;
  readonly sourceAttribution?: string;
  readonly copyrightNotices?: readonly string[];
}

export interface QdrantPoint {
  readonly id: string;
  readonly vector: readonly number[];
  readonly payload: QdrantPayload;
}

export interface QdrantRemotePoint {
  readonly id: string;
  readonly chunkId: string | null;
  readonly payloadHasContent: boolean;
}

export interface QdrantSyncCandidate {
  readonly manifest: QdrantChunkEntry;
  readonly vector: EmbeddingVectorFile;
  readonly chunk: QdrantChunkPayloadFile;
  readonly vectorId: string;
}

export interface QdrantSyncSummary {
  readonly collection: string;
  readonly vectors: number;
  readonly pendingUploads: number;
  readonly deletedVectors: number;
  readonly uploadedVectors: number;
}

export interface QdrantStatus {
  readonly collection: string;
  readonly vectors: number;
  readonly pendingUploads: number;
  readonly deletedVectors: number;
}
