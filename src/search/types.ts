export type KnowledgeSource = string;

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
  embedQueries?(queries: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface DetectedEntity {
  readonly type: "reference" | "ordinal" | "roman-numeral" | "named-entity";
  readonly value: string;
  readonly normalizedValue: string;
  readonly start: number;
  readonly end: number;
}

export interface AliasMatch {
  readonly canonical: string;
  readonly matched: string;
}

export interface QueryPlan {
  readonly originalQuery: string;
  readonly normalizedQuery: string;
  readonly expandedQueries: readonly string[];
  readonly detectedEntities: readonly DetectedEntity[];
  readonly matchedAliases: readonly AliasMatch[];
}

export interface QueryUnderstandingClient {
  understand(query: string): QueryPlan;
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
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchHit {
  readonly id: string;
  readonly score: number;
  readonly payload: SearchHitPayload;
}

export interface HybridScoreBreakdown {
  readonly vector: number;
  readonly title: number;
  readonly metadata: number;
  readonly alias: number;
  readonly entity: number;
  readonly unified: number;
  readonly matchedFields: readonly string[];
}

export interface RankedSearchHit extends SearchHit {
  readonly rawVectorScore: number;
  readonly matchedQuery: string;
  readonly scoreBreakdown: HybridScoreBreakdown;
}

export interface DroppedCandidate {
  readonly source: KnowledgeSource;
  readonly collection: string;
  readonly chunkId: string;
  readonly score: number;
  readonly reason: string;
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
    readonly hybridScore?: number;
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
  readonly queryPlan?: QueryPlan;
  readonly rawVectorRanking?: readonly RankedSearchHit[];
  readonly hybridRanking?: readonly RankedSearchHit[];
  readonly droppedCandidates?: readonly DroppedCandidate[];
}
