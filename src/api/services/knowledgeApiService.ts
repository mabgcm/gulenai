import { execFileSync } from "node:child_process";
import { OpenAiChatCompletionClient } from "../../answer/openAiChatClient.js";
import { StrictRagAnswerEngine } from "../../answer/strictRagAnswerEngine.js";
import { OpenAiTokenCounter } from "../../chunking/tokenCounter.js";
import { CitationEngine } from "../../citations/citationEngine.js";
import { RestQdrantDiagnosticsClient } from "../../diagnostics/qdrantDiagnosticsClient.js";
import { RetrievalDiagnostics } from "../../diagnostics/retrievalDiagnostics.js";
import { RetrievalAuditReporter } from "../../diagnostics/retrievalAudit.js";
import { EmbeddingVectorReader } from "../../qdrant/qdrantDataReaders.js";
import { QdrantIndexStore } from "../../qdrant/qdrantIndexStore.js";
import { PromptAssembler } from "../../prompt/promptAssembler.js";
import { ChunkContentStore } from "../../search/chunkContentStore.js";
import { OpenAiQueryEmbeddingClient } from "../../search/queryEmbeddingClient.js";
import { QdrantVectorSearchClient } from "../../search/qdrantSearchClient.js";
import { RetrievalEngine } from "../../search/retrievalEngine.js";
import { CrawlStore } from "../../storage/crawlStore.js";
import type { AppConfig } from "../../config/env.js";
import type {
  ApiChunkResponse,
  ApiPromptResponse,
  ApiSearchRequest,
  ApiStatsResponse,
  ApiVersionResponse,
  KnowledgeApiService
} from "../types.js";
import { filtersFromRequest } from "../types.js";
import type { CitedAnswer, Citation } from "../../citations/types.js";
import type { RetrievalDiagnosticsReport } from "../../diagnostics/types.js";
import type { DocumentManifestEntry } from "../../indexing/types.js";
import type {
  KnowledgeSource,
  RetrievalCollection,
  SearchOptions,
  SearchResult
} from "../../search/types.js";

const SUPPORTED_FEATURES = [
  "crawl",
  "extract",
  "markdown",
  "chunk",
  "index",
  "embed",
  "qdrant",
  "search",
  "prompt",
  "answer",
  "citations",
  "diagnostics",
  "rest-api-v1"
];

const gitCommit = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
};

export class DefaultKnowledgeApiService implements KnowledgeApiService {
  private readonly embeddingModel: string;
  private readonly chunks = new ChunkContentStore();
  private readonly index = new QdrantIndexStore();
  private readonly tokenCounter = new OpenAiTokenCounter();
  private readonly buildDate = new Date().toISOString();
  private readonly commit = gitCommit();

  public constructor(
    private readonly config: AppConfig,
    private readonly packageVersion: string
  ) {
    this.embeddingModel = config.OPENAI_EMBEDDING_MODEL || config.EMBEDDING_MODEL;
  }

  public async stats(): Promise<ApiStatsResponse> {
    const documents = await this.index.loadDocuments();
    const chunks = await this.index.loadChunks();
    const diagnostics = await this.diagnostics();
    const indexedLanguages = [
      ...new Set(
        documents
          .filter((document) => document.status !== "deleted")
          .map((document) => document.language)
          .filter((language): language is string => language !== null)
      )
    ].sort();

    return {
      documents: documents.filter((document) => document.status !== "deleted").length,
      chunks: chunks.filter((chunk) => chunk.embeddingStatus !== "deleted").length,
      vectors: diagnostics.vectorCount,
      embeddings: chunks.filter((chunk) => chunk.embeddingStatus === "embedded").length,
      indexedLanguages,
      collectionName: this.config.QDRANT_COLLECTION
    };
  }

  public async search(request: ApiSearchRequest): Promise<readonly SearchResult[]> {
    return this.retrieval().search(request.question, this.searchOptions(request));
  }

  public async prompt(request: ApiSearchRequest): Promise<ApiPromptResponse> {
    const assembled = new PromptAssembler(this.tokenCounter).assemble(
      request.question,
      await this.search(request),
      { maxContextTokens: this.config.PROMPT_MAX_CONTEXT_TOKENS }
    );
    return {
      systemPrompt: assembled.systemPrompt,
      userQuestion: assembled.userQuestion,
      chunks: assembled.chunks,
      estimatedTokens: assembled.estimatedTokens,
      trimmedChunks: assembled.trimmedChunks,
      promptMarkdown: assembled.promptMarkdown
    };
  }

  public async answer(request: ApiSearchRequest): Promise<CitedAnswer> {
    const searchOptions = this.searchOptions(request);
    const requestedSources = request.sources ?? ["fgulen"];
    const retrieval = await this.retrieval(requestedSources).searchWithDetails(
      request.question,
      searchOptions
    );
    const retrievedChunks = retrieval.results;
    const strictAnswer = await new StrictRagAnswerEngine(
      new OpenAiChatCompletionClient(this.config.OPENAI_API_KEY),
      this.tokenCounter,
      this.config.RETRIEVAL_AUDIT_ENABLED
        ? new RetrievalAuditReporter(this.tokenCounter)
        : undefined
    ).answer(request.question, retrievedChunks, {
      model: this.config.OPENAI_CHAT_MODEL,
      temperature: this.config.TEMPERATURE,
      maxOutputTokens: this.config.MAX_OUTPUT_TOKENS,
      maxContextTokens: this.config.PROMPT_MAX_CONTEXT_TOKENS,
      ...(this.config.RETRIEVAL_AUDIT_ENABLED
        ? {
            retrievalAudit: {
              embeddingModel: this.embeddingModel,
              topKRequested: searchOptions.topK,
              requestedSources,
              searchedCollections: retrieval.resultsByCollection.map(
                ({ source, collection }) => ({ source, collection })
              ),
              resultsByCollection: retrieval.resultsByCollection
            }
          }
        : {})
    });
    return new CitationEngine().build(request.question, strictAnswer);
  }

  public async sources(request: ApiSearchRequest): Promise<readonly Citation[]> {
    return (await this.answer(request)).citations;
  }

  public async document(documentId: string): Promise<DocumentManifestEntry | null> {
    const documents = await this.index.loadDocuments();
    return documents.find((document) => document.documentId === documentId) ?? null;
  }

  public async chunk(chunkId: string): Promise<ApiChunkResponse | null> {
    const chunks = await this.index.loadChunks();
    const content = await this.chunks.readByChunkId();
    const manifest = chunks.find((chunk) => chunk.chunkId === chunkId);
    const payload = content.get(chunkId);
    if (manifest === undefined && payload === undefined) {
      return null;
    }

    return {
      metadata: {
        chunkId,
        documentId: manifest?.documentId ?? null,
        sourceFile: payload?.metadata.sourceFile ?? "",
        title: payload?.metadata.title ?? null,
        url: payload?.metadata.url ?? null,
        language: payload?.metadata.language ?? null,
        headingPath: payload?.metadata.headingPath ?? [],
        chunkIndex: payload?.metadata.chunkIndex ?? manifest?.chunkIndex ?? -1,
        totalChunks: payload?.metadata.totalChunks ?? 0,
        tokenCount: payload?.metadata.tokenCount ?? manifest?.tokenCount ?? 0,
        contentHash: payload?.metadata.contentHash ?? manifest?.contentHash ?? "",
        embeddingStatus: manifest?.embeddingStatus ?? null,
        embeddedAt: manifest?.embeddedAt ?? null,
        vectorId: manifest?.vectorId ?? null
      }
    };
  }

  public async diagnostics(): Promise<RetrievalDiagnosticsReport> {
    return new RetrievalDiagnostics(
      this.config.QDRANT_COLLECTION,
      this.embeddingModel,
      this.index,
      new EmbeddingVectorReader(),
      new RestQdrantDiagnosticsClient(this.config.QDRANT_URL, this.config.QDRANT_API_KEY),
      new CrawlStore()
    ).run();
  }

  public async version(): Promise<ApiVersionResponse> {
    await Promise.resolve();
    return {
      engineVersion: this.packageVersion,
      buildDate: this.buildDate,
      gitCommit: this.commit,
      supportedFeatures: SUPPORTED_FEATURES
    };
  }

  private retrieval(sources: readonly KnowledgeSource[] = ["fgulen"]): RetrievalEngine {
    const collections: readonly RetrievalCollection[] = sources.map((source) => ({
      source,
      collection:
        source === "risale"
          ? this.config.RISALE_QDRANT_COLLECTION
          : this.config.QDRANT_COLLECTION
    }));
    return new RetrievalEngine(
      collections,
      new OpenAiQueryEmbeddingClient(this.config.OPENAI_API_KEY, this.embeddingModel),
      new QdrantVectorSearchClient(this.config.QDRANT_URL, this.config.QDRANT_API_KEY)
    );
  }

  private searchOptions(request: ApiSearchRequest): SearchOptions {
    return {
      topK: request.topK ?? this.config.SEARCH_TOP_K,
      threshold: request.threshold ?? this.config.SEARCH_SCORE_THRESHOLD,
      filters: filtersFromRequest(request)
    };
  }
}
