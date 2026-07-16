import type {
  QueryEmbeddingClient,
  RetrievalCollection,
  RetrievalSearchResult,
  SearchHit,
  SearchOptions,
  SearchResult
} from "./types.js";
import type { VectorSearchClient } from "./qdrantSearchClient.js";
import { rerankHitByTitle } from "./titleReranker.js";

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

  return {
    source: best.hit.payload.source ?? "fgulen",
    collection: best.hit.payload.collection ?? "fgulen",
    chunkId: best.hit.payload.chunkId,
    documentId: best.hit.payload.documentId,
    title: best.hit.payload.title,
    url: best.hit.payload.url,
    headingPath: best.hit.payload.headingPath,
    similarityScore: best.hit.score,
    markdown: mergeMarkdown(ordered),
    metadata: {
      chunkIds: ordered.map((item) => item.hit.payload.chunkId),
      sourceFile: best.hit.payload.sourceFile,
      language: best.hit.payload.language,
      chunkIndex: ordered[0]?.hit.payload.chunkIndex ?? best.hit.payload.chunkIndex,
      totalChunks: best.hit.payload.totalChunks,
      tokenCount,
      contentHash: best.hit.payload.contentHash,
      merged: ordered.length > 1
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
      b.similarityScore - a.similarityScore ||
      a.documentId.localeCompare(b.documentId) ||
      a.metadata.chunkIndex - b.metadata.chunkIndex ||
      a.chunkId.localeCompare(b.chunkId)
  );
};

export class RetrievalEngine {
  private readonly collections: readonly RetrievalCollection[];

  public constructor(
    collections: string | readonly RetrievalCollection[],
    private readonly embedder: QueryEmbeddingClient,
    private readonly searchClient: VectorSearchClient
  ) {
    this.collections =
      typeof collections === "string"
        ? [{ source: "fgulen", collection: collections }]
        : collections;
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

    const vector = await this.embedder.embedQuery(trimmed);
    const resultsByCollection = await Promise.all(
      this.collections.map(async ({ source, collection }) => {
        const hits = await this.searchClient.search(
          collection,
          vector,
          Math.max(1, options.topK),
          options.threshold,
          options.filters
        );
        return {
          source,
          collection,
          hits: hits.map((hit) => ({
            ...hit,
            payload: { ...hit.payload, source, collection }
          }))
        };
      })
    );
    const qdrantHits = resultsByCollection.flatMap((result) => result.hits);
    const thresholdHits = qdrantHits.filter((hit) => hit.score >= options.threshold);
    const hits = dedupeHits(thresholdHits.map((hit) => rerankHitByTitle(trimmed, hit)));
    const rankedHits: RankedHit[] = hits.map((hit) => ({ hit }));
    const results = mergeAdjacent(rankedHits).slice(0, Math.max(1, options.topK));
    return { results, resultsByCollection };
  }
}
