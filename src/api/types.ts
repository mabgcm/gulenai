import type { FastifyInstance } from "fastify";
import type { CitedAnswer, Citation } from "../citations/types.js";
import type { RetrievalDiagnosticsReport } from "../diagnostics/types.js";
import type { DocumentManifestEntry } from "../indexing/types.js";
import type { AssembledPrompt } from "../prompt/types.js";
import type { KnowledgeSource, SearchFilters, SearchResult } from "../search/types.js";

export interface ApiRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly prefix: string;
  readonly version: string;
  readonly corsOrigin: string;
  readonly bodyLimitBytes: number;
  readonly production: boolean;
}

export interface ApiSearchRequest {
  readonly question: string;
  readonly sources?: readonly KnowledgeSource[];
  readonly topK?: number;
  readonly threshold?: number;
  readonly language?: string;
  readonly documentId?: string;
  readonly title?: string;
  readonly url?: string;
  readonly sourceFile?: string;
}

export interface ApiPromptResponse {
  readonly systemPrompt: string;
  readonly userQuestion: string;
  readonly chunks: AssembledPrompt["chunks"];
  readonly estimatedTokens: number;
  readonly trimmedChunks: AssembledPrompt["trimmedChunks"];
  readonly promptMarkdown: string;
}

export interface ApiStatsResponse {
  readonly documents: number;
  readonly chunks: number;
  readonly vectors: number;
  readonly embeddings: number;
  readonly indexedLanguages: readonly string[];
  readonly collectionName: string;
}

export interface ApiVersionResponse {
  readonly engineVersion: string;
  readonly buildDate: string;
  readonly gitCommit: string;
  readonly supportedFeatures: readonly string[];
}

export interface ApiChunkResponse {
  readonly metadata: {
    readonly chunkId: string;
    readonly documentId: string | null;
    readonly sourceFile: string;
    readonly title: string | null;
    readonly url: string | null;
    readonly language: string | null;
    readonly headingPath: readonly string[];
    readonly chunkIndex: number;
    readonly totalChunks: number;
    readonly tokenCount: number;
    readonly contentHash: string;
    readonly embeddingStatus: string | null;
    readonly embeddedAt: string | null;
    readonly vectorId: string | null;
  };
}

export interface KnowledgeApiService {
  stats(): Promise<ApiStatsResponse>;
  search(request: ApiSearchRequest): Promise<readonly SearchResult[]>;
  prompt(request: ApiSearchRequest): Promise<ApiPromptResponse>;
  answer(request: ApiSearchRequest): Promise<CitedAnswer>;
  sources(request: ApiSearchRequest): Promise<readonly Citation[]>;
  document(documentId: string): Promise<DocumentManifestEntry | null>;
  chunk(chunkId: string): Promise<ApiChunkResponse | null>;
  diagnostics(): Promise<RetrievalDiagnosticsReport>;
  version(): Promise<ApiVersionResponse>;
}

export interface ApiDependencies {
  readonly service: KnowledgeApiService;
}

export type RouteRegistrar = (server: FastifyInstance, deps: ApiDependencies) => Promise<void>;

export const filtersFromRequest = (request: ApiSearchRequest): SearchFilters => ({
  ...(request.language === undefined ? {} : { language: request.language }),
  ...(request.documentId === undefined ? {} : { documentId: request.documentId }),
  ...(request.title === undefined ? {} : { title: request.title }),
  ...(request.url === undefined ? {} : { url: request.url }),
  ...(request.sourceFile === undefined ? {} : { sourceFile: request.sourceFile })
});
