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
  public readonly searchedCollections: string[] = [];
  public lastFilters: SearchFilters | null = null;
  public lastTopK: number | null = null;
  public lastThreshold: number | null = null;

  public constructor(private readonly hits: readonly SearchHit[]) {}

  public async search(
    collection: string,
    _vector: readonly number[],
    topK: number,
    threshold: number,
    filters: SearchFilters
  ): Promise<readonly SearchHit[]> {
    await Promise.resolve();
    this.searchedCollections.push(collection);
    this.lastTopK = topK;
    this.lastThreshold = threshold;
    this.lastFilters = filters;
    return this.hits;
  }
}

class CollectionSearchClient implements VectorSearchClient {
  public readonly searchedCollections: string[] = [];

  public constructor(
    private readonly hitsByCollection: Readonly<Record<string, readonly SearchHit[]>>
  ) {}

  public async search(collection: string): Promise<readonly SearchHit[]> {
    await Promise.resolve();
    this.searchedCollections.push(collection);
    return this.hitsByCollection[collection] ?? [];
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
  it("searches only the fgulen collection", async () => {
    const client = new CollectionSearchClient({ fgulen: [hit("fgulen-1", 0.9, 0)] });
    const retrieval = new RetrievalEngine(
      [{ source: "fgulen", collection: "fgulen" }],
      new FakeEmbedder(),
      client
    );

    const results = await retrieval.search("query", options());

    expect(client.searchedCollections).toEqual(["fgulen"]);
    expect(results[0]).toMatchObject({ source: "fgulen", collection: "fgulen" });
  });

  it("searches only the risale collection", async () => {
    const client = new CollectionSearchClient({ risale: [hit("risale-1", 0.9, 0)] });
    const retrieval = new RetrievalEngine(
      [{ source: "risale", collection: "risale" }],
      new FakeEmbedder(),
      client
    );

    const results = await retrieval.search("query", options());

    expect(client.searchedCollections).toEqual(["risale"]);
    expect(results[0]).toMatchObject({ source: "risale", collection: "risale" });
  });

  it("searches both collections and ranks their merged hits together", async () => {
    const client = new CollectionSearchClient({
      fgulen: [
        {
          ...hit("fgulen-1", 0.8, 0),
          payload: payload("fgulen-1", 0, { documentId: "fgulen-doc" })
        }
      ],
      risale: [
        {
          ...hit("risale-1", 0.95, 0),
          payload: payload("risale-1", 0, { documentId: "risale-doc" })
        }
      ]
    });
    const retrieval = new RetrievalEngine(
      [
        { source: "fgulen", collection: "fgulen" },
        { source: "risale", collection: "risale" }
      ],
      new FakeEmbedder(),
      client
    );

    const detailed = await retrieval.searchWithDetails("query", options());

    expect(client.searchedCollections).toEqual(["fgulen", "risale"]);
    expect(detailed.resultsByCollection.map((result) => result.collection)).toEqual([
      "fgulen",
      "risale"
    ]);
    expect(detailed.results.map((result) => [result.source, result.chunkId])).toEqual([
      ["risale", "risale-1"],
      ["fgulen", "fgulen-1"]
    ]);
  });

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
    expect(results[0]?.markdown.match(/^# Heading$/gm)).toHaveLength(1);
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

  it("ranks a title match after applying semantic similarity", async () => {
    const results = await engine([
      {
        ...hit("semantic", 0.8, 0),
        payload: payload("semantic", 0, { documentId: "doc-semantic", title: "Başka Konu" })
      },
      {
        ...hit("title", 0.6, 0),
        payload: payload("title", 0, { documentId: "doc-title", title: "İhlâs" })
      }
    ]).search("ihlas", options());

    expect(results.map((result) => result.chunkId)).toEqual(["title", "semantic"]);
    expect(results[0]?.similarityScore).toBe(0.85);
  });

  it("returns empty results for no hits or empty query", async () => {
    expect(await engine([]).search("query", options())).toEqual([]);
    expect(await engine([hit("chunk-1", 0.9, 0)]).search(" ", options())).toEqual([]);
  });
});
