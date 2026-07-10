import type { QueryEmbeddingClient, SearchFilters, SearchHit } from "../search/types.js";
import type { ChunkContentStore } from "../search/chunkContentStore.js";
import type { VectorSearchClient } from "../search/qdrantSearchClient.js";
import { titleMatchBonus } from "../search/titleReranker.js";
import type { RetrievalDiagnosticsReport, ValidationSearchReport } from "./types.js";

const preview = (markdown: string): string =>
  markdown.replace(/\s+/g, " ").trim().slice(0, 200);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const errorMessage = (error: unknown): string => {
  if (isObject(error)) {
    const data = error.data;
    if (isObject(data)) {
      const status = data.status;
      if (isObject(status) && typeof status.error === "string") {
        return status.error;
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
};

const headingPath = (path: readonly string[]): readonly string[] => path;

const diagnoseZeroResults = (
  diagnostics: RetrievalDiagnosticsReport,
  filters: SearchFilters,
  error: string | null
): string => {
  if (error !== null) {
    if (/index required|payload index/i.test(error)) {
      return "Qdrant rejected the filtered search because a payload index is missing for one of the filter fields.";
    }
    return `Search failed before results were returned: ${error}`;
  }
  if (!diagnostics.qdrantConnected) {
    return "Qdrant is not reachable.";
  }
  if (!diagnostics.collectionExists) {
    return `Qdrant collection '${diagnostics.collection}' does not exist.`;
  }
  if (diagnostics.vectorCount === 0) {
    return "The Qdrant collection contains zero vectors. Run embedding and Qdrant sync first.";
  }
  if (diagnostics.embeddedChunks === 0) {
    return "No local chunks are marked embedded. Run `pnpm embed` and `pnpm qdrant`.";
  }
  if (diagnostics.pendingChunks > 0) {
    return "There are pending chunks that have not been embedded or uploaded yet.";
  }
  if (diagnostics.missingVectors.length > 0) {
    return "Some embedded local chunks are missing corresponding Qdrant vectors.";
  }
  if (Object.values(filters).some((value) => typeof value === "string" && value.length > 0)) {
    return "The query returned no matches with the requested payload filters.";
  }
  return "The query embedding succeeded, but Qdrant returned no hits above the configured threshold.";
};

export class SearchValidator {
  public constructor(
    private readonly collection: string,
    private readonly embedder: QueryEmbeddingClient,
    private readonly searchClient: VectorSearchClient,
    private readonly chunkStore: ChunkContentStore
  ) {}

  public async validate(
    query: string,
    filters: SearchFilters,
    diagnostics: RetrievalDiagnosticsReport
  ): Promise<ValidationSearchReport> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new Error('Usage: pnpm validate-search "query"');
    }

    const vector = await this.embedder.embedQuery(trimmed);
    let error: string | null = null;
    let hits: SearchHit[] = [];
    try {
      hits = [...(await this.searchClient.search(this.collection, vector, 20, 0, filters))];
    } catch (caught: unknown) {
      error = errorMessage(caught);
    }

    const chunks = await this.chunkStore.readByChunkId();
    const rerankedHits = hits
      .map((hit) => ({ hit, bonus: titleMatchBonus(trimmed, hit.payload.title) }))
      .sort(
        (left, right) =>
          right.hit.score + right.bonus - (left.hit.score + left.bonus) ||
          left.hit.payload.documentId.localeCompare(right.hit.payload.documentId) ||
          left.hit.payload.chunkIndex - right.hit.payload.chunkIndex ||
          left.hit.payload.chunkId.localeCompare(right.hit.payload.chunkId)
      );
    const validationHits = rerankedHits.slice(0, 20).map(({ hit, bonus }, index) => {
      const content = chunks.get(hit.payload.chunkId);
      return {
        rank: index + 1,
        chunkId: hit.payload.chunkId,
        similarityScore: hit.score,
        titleMatchBonus: bonus,
        rerankedScore: hit.score + bonus,
        title: hit.payload.title ?? content?.metadata.title ?? null,
        headingPath: headingPath(
          hit.payload.headingPath.length > 0
            ? hit.payload.headingPath
            : (content?.metadata.headingPath ?? [])
        ),
        url: hit.payload.url ?? content?.metadata.url ?? null,
        preview: preview(hit.payload.content || content?.markdown || "")
      };
    });

    return {
      query: trimmed,
      filters,
      queryEmbeddingDimensions: vector.length,
      hits: validationHits,
      likelyCause:
        validationHits.length === 0 ? diagnoseZeroResults(diagnostics, filters, error) : null,
      error
    };
  }
}
