import type { SearchFilters } from "../search/types.js";

export interface RemoteVectorPoint {
  readonly id: string;
  readonly chunkId: string | null;
}

export interface QdrantCollectionDiagnostics {
  readonly connected: boolean;
  readonly collectionExists: boolean;
  readonly vectorCount: number;
  readonly embeddingDimensions: number | null;
  readonly remotePoints: readonly RemoteVectorPoint[];
  readonly error: string | null;
}

export interface RetrievalDiagnosticsReport {
  readonly generatedAt: string;
  readonly collection: string;
  readonly queueSize: number;
  readonly resumeStatus: string;
  readonly remainingUrls: readonly string[];
  readonly filesystemConcurrency: number;
  readonly pendingFilesystemJobs: number;
  readonly activeFilesystemJobs: number;
  readonly openFileStatistics: string;
  readonly memoryUsage: {
    readonly rssBytes: number;
    readonly heapUsedBytes: number;
    readonly heapTotalBytes: number;
    readonly externalBytes: number;
  };
  readonly qdrantConnected: boolean;
  readonly collectionExists: boolean;
  readonly vectorCount: number;
  readonly embeddingModel: string | null;
  readonly embeddingDimensions: number | null;
  readonly indexedDocuments: number;
  readonly indexedChunks: number;
  readonly embeddedChunks: number;
  readonly pendingChunks: number;
  readonly missingVectors: readonly string[];
  readonly orphanVectors: readonly string[];
  readonly errors: readonly string[];
}

export interface ValidationSearchHit {
  readonly rank: number;
  readonly chunkId: string;
  readonly similarityScore: number;
  readonly titleMatchBonus: number;
  readonly rerankedScore: number;
  readonly title: string | null;
  readonly headingPath: readonly string[];
  readonly url: string | null;
  readonly preview: string;
}

export interface ValidationSearchReport {
  readonly query: string;
  readonly filters: SearchFilters;
  readonly queryEmbeddingDimensions: number | null;
  readonly hits: readonly ValidationSearchHit[];
  readonly likelyCause: string | null;
  readonly error: string | null;
}

export interface RetrievalValidationHtmlReport {
  readonly diagnostics: RetrievalDiagnosticsReport;
  readonly validation: ValidationSearchReport | null;
}
