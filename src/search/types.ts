export type KnowledgeSource = "fgulen" | "risale";

export interface RetrievalCollection {
  readonly source: KnowledgeSource;
  readonly collection: string;
}

export interface SearchFilters {
  readonly language?: string;
  readonly documentId?: string;
  readonly title?: string;
  readonly url?: string;
  readonly sourceFile?: string;
}

export interface SearchOptions {
  readonly topK: number;
  readonly threshold: number;
  readonly filters: SearchFilters;
}

export interface QueryEmbeddingClient {
  embedQuery(query: string): Promise<readonly number[]>;
}

export interface SearchHitPayload {
  readonly source?: KnowledgeSource;
  readonly collection?: string;
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
  readonly sourceFile: string;
  readonly content: string;
}

export interface SearchHit {
  readonly id: string;
  readonly score: number;
  readonly payload: SearchHitPayload;
}

export interface ChunkContent {
  readonly chunkId: string;
  readonly markdown: string;
  readonly metadata: Omit<SearchHitPayload, "content">;
}

export interface SearchResult {
  readonly source?: KnowledgeSource;
  readonly collection?: string;
  readonly chunkId: string;
  readonly documentId: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly headingPath: readonly string[];
  readonly similarityScore: number;
  readonly markdown: string;
  readonly metadata: {
    readonly chunkIds: readonly string[];
    readonly sourceFile: string;
    readonly language: string | null;
    readonly chunkIndex: number;
    readonly totalChunks: number;
    readonly tokenCount: number;
    readonly contentHash: string;
    readonly merged: boolean;
  };
}

export interface CollectionSearchResults {
  readonly source: KnowledgeSource;
  readonly collection: string;
  readonly hits: readonly SearchHit[];
}

export interface RetrievalSearchResult {
  readonly results: readonly SearchResult[];
  readonly resultsByCollection: readonly CollectionSearchResults[];
}
