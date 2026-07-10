import { describe, expect, it } from "vitest";
import type { VectorSearchClient } from "../../src/search/qdrantSearchClient.js";
import { RetrievalEngine } from "../../src/search/retrievalEngine.js";
import type {
  QueryEmbeddingClient,
  SearchFilters,
  SearchHit,
  SearchOptions
} from "../../src/search/types.js";

class FakeEmbedder implements QueryEmbeddingClient {
  public async embedQuery(query: string): Promise<readonly number[]> {
    await Promise.resolve();
    return [query.length, 1, 2];
  }
}

class FakeSearchClient implements VectorSearchClient {
  public lastFilters: SearchFilters | null = null;
  public lastTopK: number | null = null;
  public lastThreshold: number | null = null;

  public constructor(private readonly hits: readonly SearchHit[]) {}

  public async search(
    _collection: string,
    _vector: readonly number[],
    topK: number,
    threshold: number,
    filters: SearchFilters
  ): Promise<readonly SearchHit[]> {
    await Promise.resolve();
    this.lastTopK = topK;
    this.lastThreshold = threshold;
    this.lastFilters = filters;
    return this.hits;
  }
}

const payload = (
  chunkId: string,
  chunkIndex: number,
  scoreFields: Partial<SearchHit["payload"]> = {}
): SearchHit["payload"] => ({
  chunkId,
  documentId: "doc-1",
  url: "https://fgulen.com/article",
  title: "Kırık Testi",
  language: "tr",
  headingPath: ["İhlas", "Samimiyet"],
  chunkIndex,
  totalChunks: 3,
  tokenCount: 100,
  contentHash: `hash-${chunkId}`,
  sourceFile: "tr/article.md",
  content: `# Heading\n\nMarkdown for ${chunkId}`,
  ...scoreFields
});

const hit = (chunkId: string, score: number, chunkIndex: number): SearchHit => ({
  id: chunkId,
  score,
  payload: payload(chunkId, chunkIndex)
});

const options = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({
  topK: 10,
  threshold: 0,
  filters: {},
  ...overrides
});

const engine = (hits: readonly SearchHit[]) =>
  new RetrievalEngine("fgulen", new FakeEmbedder(), new FakeSearchClient(hits));

describe("RetrievalEngine", () => {
  it("retrieves ranked results with markdown and metadata", async () => {
    const results = await engine([hit("chunk-1", 0.94, 0)]).search(
      "ihlas nedir",
      options()
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.chunkId).toBe("chunk-1");
    expect(results[0]?.title).toBe("Kırık Testi");
    expect(results[0]?.similarityScore).toBe(0.94);
    expect(results[0]?.markdown).toContain("Markdown for chunk-1");
  });

  it("passes payload filters to the vector search client", async () => {
    const client = new FakeSearchClient([hit("chunk-1", 0.9, 0)]);
    const retrieval = new RetrievalEngine("fgulen", new FakeEmbedder(), client);

    await retrieval.search(
      "query",
      options({
        topK: 3,
        threshold: 0.25,
        filters: { language: "tr", sourceFile: "tr/article.md", title: "Kırık Testi" }
      })
    );

    expect(client.lastTopK).toBe(3);
    expect(client.lastThreshold).toBe(0.25);
    expect(client.lastFilters).toEqual({
      language: "tr",
      sourceFile: "tr/article.md",
      title: "Kırık Testi"
    });
  });

  it("applies similarity threshold", async () => {
    const results = await engine([hit("chunk-1", 0.4, 0), hit("chunk-2", 0.9, 1)]).search(
      "query",
      options({ threshold: 0.5 })
    );

    expect(results.map((result) => result.chunkId)).toEqual(["chunk-2"]);
  });

  it("removes duplicate chunks and keeps the highest score", async () => {
    const results = await engine([hit("chunk-1", 0.7, 0), hit("chunk-1", 0.95, 0)]).search(
      "query",
      options()
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.similarityScore).toBe(0.95);
  });

  it("merges adjacent chunks from the same document", async () => {
    const results = await engine([hit("chunk-1", 0.95, 0), hit("chunk-2", 0.91, 1)]).search(
      "query",
      options()
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.metadata.merged).toBe(true);
    expect(results[0]?.metadata.chunkIds).toEqual(["chunk-1", "chunk-2"]);
    expect(results[0]?.markdown).toContain("Markdown for chunk-1");
    expect(results[0]?.markdown).toContain("Markdown for chunk-2");
  });

  it("orders results deterministically when scores tie", async () => {
    const results = await engine(
      [
        { ...hit("chunk-b", 0.9, 1), payload: payload("chunk-b", 1, { documentId: "doc-b" }) },
        { ...hit("chunk-a", 0.9, 0), payload: payload("chunk-a", 0, { documentId: "doc-a" }) }
      ]
    ).search("query", options());

    expect(results.map((result) => result.chunkId)).toEqual(["chunk-a", "chunk-b"]);
  });

  it("returns empty results for no hits or empty query", async () => {
    expect(await engine([]).search("query", options())).toEqual([]);
    expect(await engine([hit("chunk-1", 0.9, 0)]).search(" ", options())).toEqual([]);
  });
});
