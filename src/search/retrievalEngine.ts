import type {
  DroppedCandidate,
  QueryEmbeddingClient,
  QueryUnderstandingClient,
  RankedSearchHit,
  RetrievalCollection,
  RetrievalSearchResult,
  SearchHit,
  SearchOptions,
  SearchResult
} from "./types.js";
import type { VectorSearchClient } from "./qdrantSearchClient.js";
import { ConfigurableQueryUnderstanding } from "./queryUnderstanding.js";
import { DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfiguration } from "./retrievalConfig.js";
import {
  HybridRanker,
  NoopCandidateReranker,
  type CandidateReranker
} from "./hybridRanker.js";

interface RankedHit {
  readonly hit: SearchHit;
}

const dedupeHits = (hits: readonly SearchHit[]): readonly SearchHit[] => {
  const byChunkId = new Map<string, SearchHit>();
  for (const hit of hits) {
    const key = `${hit.payload.collection ?? ""}:${hit.payload.chunkId}`;
    const existing = byChunkId.get(key);
    if (existing === undefined || hit.score > existing.score) {
      byChunkId.set(key, hit);
    }
  }

  return [...byChunkId.values()].sort(
    (a, b) =>
      b.score - a.score ||
      a.payload.documentId.localeCompare(b.payload.documentId) ||
      a.payload.chunkIndex - b.payload.chunkIndex ||
      a.payload.chunkId.localeCompare(b.payload.chunkId)
  );
};

const isAdjacent = (left: RankedHit, right: RankedHit): boolean =>
  (left.hit.payload.collection ?? "") === (right.hit.payload.collection ?? "") &&
  left.hit.payload.documentId === right.hit.payload.documentId &&
  Math.abs(left.hit.payload.chunkIndex - right.hit.payload.chunkIndex) === 1;

const removeDuplicateHeadings = (markdown: string): string => {
  const headings = new Set<string>();
  return markdown
    .split("\n")
    .filter((line) => {
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/)?.[1];
      if (heading === undefined) {
        return true;
      }
      const normalized = heading.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
      if (headings.has(normalized)) {
        return false;
      }
      headings.add(normalized);
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const mergeMarkdown = (hits: readonly RankedHit[]): string =>
  removeDuplicateHeadings(
    [...hits]
      .sort((a, b) => a.hit.payload.chunkIndex - b.hit.payload.chunkIndex)
      .map((hit) => hit.hit.payload.content.trim())
      .filter((markdown) => markdown.length > 0)
      .join("\n\n")
  );

const resultFromHits = (hits: readonly RankedHit[]): SearchResult => {
  const best = [...hits].sort(
    (a, b) =>
      b.hit.score - a.hit.score ||
      a.hit.payload.chunkIndex - b.hit.payload.chunkIndex ||
      a.hit.payload.chunkId.localeCompare(b.hit.payload.chunkId)
  )[0];
  if (best === undefined) {
    throw new Error("Cannot build a search result from no hits");
  }

  const ordered = [...hits].sort((a, b) => a.hit.payload.chunkIndex - b.hit.payload.chunkIndex);
  const tokenCount = ordered.reduce((sum, item) => sum + item.hit.payload.tokenCount, 0);
  const rankedBest = best.hit as Partial<RankedSearchHit>;
  const displayScore = rankedBest.scoreBreakdown === undefined
    ? best.hit.score
    : rankedBest.rawVectorScore! + rankedBest.scoreBreakdown.title * 0.25;

  return {
    source: best.hit.payload.source ?? "fgulen",
    collection: best.hit.payload.collection ?? "fgulen",
    chunkId: best.hit.payload.chunkId,
    documentId: best.hit.payload.documentId,
    title: best.hit.payload.title,
    url: best.hit.payload.url,
    headingPath: best.hit.payload.headingPath,
    similarityScore: displayScore,
    markdown: mergeMarkdown(ordered),
    metadata: {
      chunkIds: ordered.map((item) => item.hit.payload.chunkId),
      sourceFile: best.hit.payload.sourceFile,
      language: best.hit.payload.language,
      chunkIndex: ordered[0]?.hit.payload.chunkIndex ?? best.hit.payload.chunkIndex,
      totalChunks: best.hit.payload.totalChunks,
      tokenCount,
      contentHash: best.hit.payload.contentHash,
      merged: ordered.length > 1,
      hybridScore: best.hit.score
    }
  };
};

const mergeAdjacent = (hits: readonly RankedHit[]): readonly SearchResult[] => {
  const visited = new Set<string>();
  const results: SearchResult[] = [];

  for (const hit of hits) {
    if (visited.has(hit.hit.payload.chunkId)) {
      continue;
    }

    const adjacent = hits
      .filter((candidate) => !visited.has(candidate.hit.payload.chunkId))
      .filter((candidate) => candidate === hit || isAdjacent(hit, candidate))
      .sort((a, b) => a.hit.payload.chunkIndex - b.hit.payload.chunkIndex);

    for (const item of adjacent) {
      visited.add(item.hit.payload.chunkId);
    }
    results.push(resultFromHits(adjacent));
  }

  return results.sort(
    (a, b) =>
      (b.metadata.hybridScore ?? b.similarityScore) -
        (a.metadata.hybridScore ?? a.similarityScore) ||
      a.documentId.localeCompare(b.documentId) ||
      a.metadata.chunkIndex - b.metadata.chunkIndex ||
      a.chunkId.localeCompare(b.chunkId)
  );
};

export class RetrievalEngine {
  private readonly collections: readonly RetrievalCollection[];
  private readonly queryUnderstanding: QueryUnderstandingClient;
  private readonly hybridRanker: HybridRanker;
  private readonly config: RetrievalConfiguration;

  public constructor(
    collections: string | readonly RetrievalCollection[],
    private readonly embedder: QueryEmbeddingClient,
    private readonly searchClient: VectorSearchClient,
    config: RetrievalConfiguration = DEFAULT_RETRIEVAL_CONFIG,
    queryUnderstanding: QueryUnderstandingClient = new ConfigurableQueryUnderstanding(config),
    private readonly candidateReranker: CandidateReranker = new NoopCandidateReranker()
  ) {
    this.collections =
      typeof collections === "string"
        ? [{ source: "fgulen", collection: collections }]
        : collections;
    this.queryUnderstanding = queryUnderstanding;
    this.hybridRanker = new HybridRanker(config);
    this.config = config;
  }

  public async search(query: string, options: SearchOptions): Promise<readonly SearchResult[]> {
    return (await this.searchWithDetails(query, options)).results;
  }

  public async searchWithDetails(
    query: string,
    options: SearchOptions
  ): Promise<RetrievalSearchResult> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { results: [], resultsByCollection: [] };
    }

    const queryPlan = this.queryUnderstanding.understand(trimmed);
    const embeddings = this.embedder.embedQueries === undefined
      ? await Promise.all(queryPlan.expandedQueries.map((variant) => this.embedder.embedQuery(variant)))
      : await this.embedder.embedQueries(queryPlan.expandedQueries);
    const searches = await Promise.all(
      this.collections.flatMap(({ source, collection }) =>
        queryPlan.expandedQueries.map(async (variant, variantIndex) => {
          const hits = await this.searchClient.search(
            collection,
            embeddings[variantIndex] ?? [],
            Math.max(1, options.topK),
            options.threshold,
            options.filters
          );
          return {
            source,
            collection,
            variant,
            hits: hits.map((hit) => ({
              ...hit,
              payload: { ...hit.payload, source, collection }
            }))
          };
        })
      )
    );
    const droppedCandidates: DroppedCandidate[] = [];
    const bestRawByKey = new Map<string, { hit: SearchHit; matchedQuery: string }>();
    for (const search of searches) {
      for (const hit of search.hits) {
        const key = `${search.collection}:${hit.payload.chunkId}`;
        const existing = bestRawByKey.get(key);
        if (hit.score < options.threshold) {
          droppedCandidates.push({
            source: search.source,
            collection: search.collection,
            chunkId: hit.payload.chunkId,
            score: hit.score,
            reason: `below vector threshold ${options.threshold}`
          });
        } else if (existing === undefined || hit.score > existing.hit.score) {
          if (existing !== undefined) {
            droppedCandidates.push({
              source: search.source,
              collection: search.collection,
              chunkId: existing.hit.payload.chunkId,
              score: existing.hit.score,
              reason: `superseded by higher-scoring query variant: ${search.variant}`
            });
          }
          bestRawByKey.set(key, { hit, matchedQuery: search.variant });
        } else {
          droppedCandidates.push({
            source: search.source,
            collection: search.collection,
            chunkId: hit.payload.chunkId,
            score: hit.score,
            reason: `duplicate candidate from query variant: ${search.variant}`
          });
        }
      }
    }
    const rawVectorRanking = [...bestRawByKey.values()]
      .map(({ hit, matchedQuery }) => this.hybridRanker.rank(queryPlan, hit, matchedQuery))
      .sort(
        (left, right) =>
          right.rawVectorScore - left.rawVectorScore ||
          left.payload.chunkId.localeCompare(right.payload.chunkId)
      );
    const hybridRanking = [...rawVectorRanking].sort(
      (left, right) =>
        right.score - left.score ||
        right.rawVectorScore - left.rawVectorScore ||
        left.payload.chunkId.localeCompare(right.payload.chunkId)
    );
    const globallyReranked = await this.candidateReranker.rerank(queryPlan, hybridRanking);
    const hasStructuredReference = queryPlan.detectedEntities.some(
      ({ type }) => type === "ordinal" || type === "reference" || type === "roman-numeral"
    );
    const bestMetadataSignal = Math.max(
      0,
      ...globallyReranked.map((hit) =>
        Math.max(hit.scoreBreakdown.title, hit.scoreBreakdown.metadata)
      )
    );
    const reranked = hasStructuredReference &&
      bestMetadataSignal >= this.config.candidateSelection.structuredReferenceFloor
      ? globallyReranked.filter((hit) => {
          const signal = Math.max(hit.scoreBreakdown.title, hit.scoreBreakdown.metadata);
          const keep = signal >=
            bestMetadataSignal - this.config.candidateSelection.structuredReferenceTolerance;
          if (!keep) {
            droppedCandidates.push({
              source: hit.payload.source ?? "unknown",
              collection: hit.payload.collection ?? "unknown",
              chunkId: hit.payload.chunkId,
              score: hit.score,
              reason: `structured metadata signal ${signal.toFixed(3)} below best-match tolerance`
            });
          }
          return keep;
        })
      : globallyReranked;
    const hits = dedupeHits(reranked);
    const rankedHits: RankedHit[] = hits.map((hit) => ({ hit }));
    const results = mergeAdjacent(rankedHits).slice(0, Math.max(1, options.topK));
    const selected = new Set(results.flatMap((result) => result.metadata.chunkIds));
    for (const hit of reranked) {
      if (!selected.has(hit.payload.chunkId)) {
        droppedCandidates.push({
          source: hit.payload.source ?? "unknown",
          collection: hit.payload.collection ?? "unknown",
          chunkId: hit.payload.chunkId,
          score: hit.score,
          reason: "outside final global topK or merged into another result"
        });
      }
    }
    const resultsByCollection = this.collections.map(({ source, collection }) => ({
      source,
      collection,
      hits: [...bestRawByKey.values()]
        .map(({ hit }) => hit)
        .filter((hit) => hit.payload.collection === collection)
        .sort((left, right) => right.score - left.score)
    }));
    return {
      results,
      resultsByCollection,
      queryPlan,
      rawVectorRanking,
      hybridRanking: reranked,
      droppedCandidates
    };
  }
}
