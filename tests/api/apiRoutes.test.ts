import { describe, expect, it } from "vitest";
import { createApiServer } from "../../src/api/server.js";
import type {
  ApiChunkResponse,
  ApiPromptResponse,
  ApiSearchRequest,
  ApiStatsResponse,
  ApiVersionResponse,
  KnowledgeApiService
} from "../../src/api/types.js";
import type { AppConfig } from "../../src/config/env.js";
import type { CitedAnswer, Citation } from "../../src/citations/types.js";
import type { RetrievalDiagnosticsReport } from "../../src/diagnostics/types.js";
import type { DocumentManifestEntry } from "../../src/indexing/types.js";
import type { SearchResult } from "../../src/search/types.js";

const config: AppConfig = {
  OPENAI_API_KEY: "test",
  QDRANT_URL: "http://localhost:6333",
  QDRANT_API_KEY: "",
  QDRANT_COLLECTION: "fgulen",
  QDRANT_BATCH_SIZE: 64,
  QDRANT_CONCURRENCY: 2,
  QDRANT_RETRIES: 3,
  SEARCH_TOP_K: 8,
  PROMPT_MAX_CONTEXT_TOKENS: 6000,
  SEARCH_SCORE_THRESHOLD: 0,
  CRAWL_SEEDS: ["https://fgulen.com"],
  CRAWL_ALLOWED_DOMAINS: ["fgulen.com"],
  CRAWL_INCLUDE_PATHS: ["/"],
  CRAWL_EXCLUDE_PATHS: ["/wp-admin"],
  CRAWL_INCLUDE_PATTERNS: [],
  CRAWL_EXCLUDE_PATTERNS: [],
  CRAWL_LANGUAGES: ["tr"],
  CRAWL_QUALITY_THRESHOLD: 45,
  CRAWL_MIN_WORD_COUNT: 120,
  CRAWL_DUPLICATE_SIMHASH_DISTANCE: 3,
  CRAWL_MAX_PAGES: 100,
  CRAWL_MAX_DEPTH: 3,
  CRAWL_CONCURRENCY: 2,
  CRAWL_RETRIES: 2,
  CRAWL_DELAY_MS: 1000,
  CRAWL_RESPECT_ROBOTS: true,
  CRAWL_USER_AGENT: "test",
  CHUNK_SIZE_TOKENS: 800,
  CHUNK_MAX_TOKENS: 1000,
  CHUNK_OVERLAP_TOKENS: 150,
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  OPENAI_CHAT_MODEL: "gpt-4o-mini",
  TEMPERATURE: 0,
  MAX_OUTPUT_TOKENS: 800,
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_BATCH_SIZE: 64,
  EMBEDDING_CONCURRENCY: 2,
  EMBEDDING_RETRIES: 3,
  PORT: 0,
  HOST: "127.0.0.1",
  API_PREFIX: "/api/v1",
  API_VERSION: "1.0",
  CORS_ORIGIN: "*",
  API_BODY_LIMIT_BYTES: 1048576,
  LOG_LEVEL: "silent"
};

const citation: Citation = {
  id: 1,
  title: "Kırık Testi",
  url: "https://example.test",
  headingPath: ["Kitap", "İhlas"],
  chunkId: "chunk-1",
  score: 0.94,
  chunkIndex: 0,
  totalChunks: 2
};

const result: SearchResult = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  title: "Kırık Testi",
  url: "https://example.test",
  headingPath: ["Kitap", "İhlas"],
  similarityScore: 0.94,
  markdown: "İhlas metni.",
  metadata: {
    chunkIds: ["chunk-1"],
    sourceFile: "doc.md",
    language: "tr",
    chunkIndex: 0,
    totalChunks: 2,
    tokenCount: 12,
    contentHash: "hash",
    merged: false
  }
};

class FakeService implements KnowledgeApiService {
  public lastSearchRequest: ApiSearchRequest | null = null;

  public async stats(): Promise<ApiStatsResponse> {
    await Promise.resolve();
    return {
      documents: 1,
      chunks: 2,
      vectors: 2,
      embeddings: 2,
      indexedLanguages: ["tr"],
      collectionName: "fgulen"
    };
  }

  public async search(request: ApiSearchRequest): Promise<readonly SearchResult[]> {
    await Promise.resolve();
    this.lastSearchRequest = request;
    return [result];
  }

  public async prompt(request: ApiSearchRequest): Promise<ApiPromptResponse> {
    await Promise.resolve();
    this.lastSearchRequest = request;
    return {
      systemPrompt: "system",
      userQuestion: request.question,
      chunks: [],
      estimatedTokens: 10,
      trimmedChunks: [],
      promptMarkdown: "SYSTEM\nsystem"
    };
  }

  public async answer(request: ApiSearchRequest): Promise<CitedAnswer> {
    await Promise.resolve();
    this.lastSearchRequest = request;
    return {
      question: request.question,
      answer: "İhlas cevabı. [1]",
      confidence: 94,
      citations: [citation],
      citationGroups: [{ id: 1, citations: [citation] }],
      sourceAnswer: {
        answer: "İhlas cevabı.",
        confidence: 94,
        usedChunks: [],
        ignoredChunks: [],
        estimatedTokens: 10,
        model: "test-model"
      }
    };
  }

  public async sources(request: ApiSearchRequest): Promise<readonly Citation[]> {
    await Promise.resolve();
    this.lastSearchRequest = request;
    return [citation];
  }

  public async document(documentId: string): Promise<DocumentManifestEntry | null> {
    await Promise.resolve();
    return documentId === "doc-1"
      ? {
          documentId: "doc-1",
          sourceFile: "doc.md",
          url: "https://example.test",
          title: "Kırık Testi",
          language: "tr",
          crawlDate: "2026-07-09T00:00:00.000Z",
          contentHash: "hash",
          totalChunks: 2,
          version: 1,
          status: "unchanged",
          lastIndexedAt: "2026-07-09T00:00:00.000Z"
        }
      : null;
  }

  public async chunk(chunkId: string): Promise<ApiChunkResponse | null> {
    await Promise.resolve();
    return chunkId === "chunk-1"
      ? {
          metadata: {
            chunkId: "chunk-1",
            documentId: "doc-1",
            sourceFile: "doc.md",
            title: "Kırık Testi",
            url: "https://example.test",
            language: "tr",
            headingPath: ["Kitap", "İhlas"],
            chunkIndex: 0,
            totalChunks: 2,
            tokenCount: 12,
            contentHash: "hash",
            embeddingStatus: "embedded",
            embeddedAt: "2026-07-09T00:00:00.000Z",
            vectorId: "vector-1"
          }
        }
      : null;
  }

  public async diagnostics(): Promise<RetrievalDiagnosticsReport> {
    await Promise.resolve();
    return {
      generatedAt: "2026-07-09T00:00:00.000Z",
      collection: "fgulen",
      qdrantConnected: true,
      collectionExists: true,
      vectorCount: 2,
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536,
      indexedDocuments: 1,
      indexedChunks: 2,
      embeddedChunks: 2,
      pendingChunks: 0,
      missingVectors: [],
      orphanVectors: [],
      errors: []
    };
  }

  public async version(): Promise<ApiVersionResponse> {
    await Promise.resolve();
    return {
      engineVersion: "0.1.0",
      buildDate: "2026-07-09T00:00:00.000Z",
      gitCommit: "abc123",
      supportedFeatures: ["rest-api-v1"]
    };
  }
}

const app = async (service = new FakeService()) =>
  createApiServer({
    appConfig: config,
    packageVersion: "0.1.0",
    service,
    enableLogger: false,
    production: true
  });

describe("REST API routes", () => {
  it("serves health", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/health" });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: "1.0" });
  });

  it("serves stats", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/stats" });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ documents: 1, chunks: 2, collectionName: "fgulen" });
  });

  it("serves search", async () => {
    const service = new FakeService();
    const server = await app(service);
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/search",
      payload: { question: "İhlas nedir?", topK: 10, language: "tr" }
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ results: [{ chunkId: "chunk-1" }] });
    expect(service.lastSearchRequest).toMatchObject({ topK: 10, language: "tr" });
  });

  it("serves prompt", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/prompt",
      payload: { question: "İhlas nedir?", language: "tr" }
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      userQuestion: "İhlas nedir?",
      promptMarkdown: "SYSTEM\nsystem"
    });
  });

  it("serves answers with citations", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/answer",
      payload: { question: "İhlas nedir?", language: "tr" }
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      answer: "İhlas cevabı. [1]",
      confidence: 94,
      citations: [{ chunkId: "chunk-1" }]
    });
  });

  it("serves sources only", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/sources",
      payload: { question: "İhlas nedir?", language: "tr" }
    });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ citations: [{ chunkId: "chunk-1" }] });
  });

  it("serves document metadata", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/document/doc-1" });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ metadata: { documentId: "doc-1" } });
  });

  it("serves chunk metadata", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/chunk/chunk-1" });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ metadata: { chunkId: "chunk-1" } });
  });

  it("serves version", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/version" });
    await server.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ engineVersion: "0.1.0", gitCommit: "abc123" });
  });

  it("serves OpenAPI documentation", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/docs" });
    await server.close();

    expect([200, 302]).toContain(response.statusCode);
  });

  it("returns validation errors consistently", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/search",
      payload: { question: "" }
    });
    await server.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed" }
    });
  });
});
