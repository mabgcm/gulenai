export type DocumentStatus = "new" | "unchanged" | "changed" | "deleted";
export type EmbeddingStatus = "pending" | "embedded" | "deleted";

export interface DocumentManifestEntry {
  readonly documentId: string;
  readonly sourceFile: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly language: string | null;
  readonly crawlDate: string | null;
  readonly contentHash: string;
  readonly totalChunks: number;
  readonly version: number;
  readonly status: DocumentStatus;
  readonly lastIndexedAt: string;
}

export interface ChunkManifestEntry {
  readonly chunkId: string;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly tokenCount: number;
  readonly contentHash: string;
  readonly embeddingStatus: EmbeddingStatus;
  readonly embeddedAt: string | null;
  readonly vectorId: string | null;
}

export interface IndexManifests {
  readonly documents: readonly DocumentManifestEntry[];
  readonly chunks: readonly ChunkManifestEntry[];
}

export interface IndexSummary {
  readonly totalDocuments: number;
  readonly totalChunks: number;
  readonly pendingEmbeddings: number;
  readonly changedDocuments: number;
  readonly deletedDocuments: number;
}

export interface ChunkJsonMetadata {
  readonly id: string;
  readonly sourceFile: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly language: string | null;
  readonly crawlDate?: string | null;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly tokenCount: number;
  readonly contentHash: string;
}

export interface ChunkJsonDocument {
  readonly metadata: ChunkJsonMetadata;
  readonly markdown: string;
  readonly plainText: string;
}
