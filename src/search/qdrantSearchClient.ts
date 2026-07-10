import { QdrantClient } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import { qdrantClientOptions } from "../qdrant/clientConfig.js";
import { embeddingPreview, logRetrievalDebug } from "./retrievalDebug.js";
import type { SearchFilters, SearchHit, SearchHitPayload } from "./types.js";

export interface VectorSearchClient {
  search(
    collection: string,
    vector: readonly number[],
    topK: number,
    threshold: number,
    filters: SearchFilters
  ): Promise<readonly SearchHit[]>;
}

const filterKeyMap = {
  language: "language",
  documentId: "documentId",
  title: "title",
  url: "url",
  sourceFile: "sourceFile"
} as const satisfies Record<keyof SearchFilters, string>;

const buildFilter = (filters: SearchFilters): Schemas["Filter"] | undefined => {
  const keys: readonly (keyof SearchFilters)[] = [
    "language",
    "documentId",
    "title",
    "url",
    "sourceFile"
  ];
  const must = keys
    .map((key) => ({ key, value: filters[key] }))
    .filter((entry): entry is { key: keyof SearchFilters; value: string } => {
      return typeof entry.value === "string" && entry.value.trim().length > 0;
    })
    .map(({ key, value }) => ({
      key: filterKeyMap[key],
      match: { value }
    }));

  return must.length === 0 ? undefined : { must };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const parsePayload = (payload: unknown): SearchHitPayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  if (
    typeof payload.chunkId !== "string" ||
    typeof payload.documentId !== "string" ||
    !Array.isArray(payload.headingPath) ||
    !payload.headingPath.every((item) => typeof item === "string") ||
    typeof payload.chunkIndex !== "number" ||
    typeof payload.totalChunks !== "number" ||
    typeof payload.tokenCount !== "number" ||
    typeof payload.contentHash !== "string" ||
    typeof payload.sourceFile !== "string"
  ) {
    return null;
  }

  return {
    chunkId: payload.chunkId,
    documentId: payload.documentId,
    url: nullableString(payload.url),
    title: nullableString(payload.title),
    language: nullableString(payload.language),
    headingPath: payload.headingPath,
    chunkIndex: payload.chunkIndex,
    totalChunks: payload.totalChunks,
    tokenCount: payload.tokenCount,
    contentHash: payload.contentHash,
    sourceFile: payload.sourceFile
  };
};

const scoredPointToHit = (point: Schemas["ScoredPoint"]): SearchHit | null => {
  const payload = parsePayload(point.payload);
  if (payload === null) {
    return null;
  }

  return {
    id: String(point.id),
    score: point.score,
    payload
  };
};

export class QdrantVectorSearchClient implements VectorSearchClient {
  private readonly client: QdrantClient;

  public constructor(url: string, apiKey: string | undefined) {
    this.client = new QdrantClient(qdrantClientOptions(url, apiKey));
  }

  public async search(
    collection: string,
    vector: readonly number[],
    topK: number,
    threshold: number,
    filters: SearchFilters
  ): Promise<readonly SearchHit[]> {
    const filter = buildFilter(filters);
    const request: Parameters<QdrantClient["search"]>[1] = {
      vector: [...vector],
      limit: topK,
      with_payload: true,
      with_vector: false
    };
    if (threshold > 0) {
      Object.assign(request, { score_threshold: threshold });
    }
    if (filter !== undefined) {
      Object.assign(request, { filter });
    }

    logRetrievalDebug("qdrant-request", {
      collection,
      request,
      vectorSummary: {
        length: vector.length,
        firstValues: embeddingPreview(vector),
        truncated: true
      },
      requestedThreshold: threshold,
      requestedMetadataFilters: filters
    });

    const hits = await this.client.search(collection, request);

    logRetrievalDebug("qdrant-raw-response", {
      collection,
      hitCountBeforeLocalFiltering: hits.length,
      scores: hits.map((hit) => ({ id: String(hit.id), score: hit.score }))
    });

    const parsedHits = hits.map((hit) => ({ raw: hit, parsed: scoredPointToHit(hit) }));
    const validHits = parsedHits
      .map(({ parsed }) => parsed)
      .filter((hit): hit is SearchHit => hit !== null);

    logRetrievalDebug("qdrant-payload-filter", {
      collection,
      hitCountAfterMetadataFiltering: validHits.length,
      rejectedHits: parsedHits
        .filter(({ parsed }) => parsed === null)
        .map(({ raw }) => ({
          id: String(raw.id),
          score: raw.score,
          payloadKeys:
            isObject(raw.payload) ? Object.keys(raw.payload).sort() : []
        }))
    });

    return validHits;
  }
}

export const buildQdrantFilterForTest = buildFilter;
