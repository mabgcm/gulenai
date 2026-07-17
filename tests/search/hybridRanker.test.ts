import { describe, expect, it } from "vitest";
import { HybridRanker, NoopCandidateReranker } from "../../src/search/hybridRanker.js";
import { DEFAULT_RETRIEVAL_CONFIG } from "../../src/search/retrievalConfig.js";
import type { QueryPlan, SearchHit } from "../../src/search/types.js";

const plan: QueryPlan = {
  originalQuery: "23. chapter",
  normalizedQuery: "23. chapter",
  expandedQueries: ["23. chapter", "twenty third chapter"],
  detectedEntities: [{ type: "ordinal", value: "23.", normalizedValue: "23", start: 0, end: 3 }],
  matchedAliases: []
};

const hit = (title: string, section: string, score: number): SearchHit => ({
  id: title,
  score,
  payload: {
    chunkId: title,
    documentId: title,
    url: null,
    title,
    language: "en",
    headingPath: [],
    chunkIndex: 0,
    totalChunks: 1,
    tokenCount: 10,
    contentHash: title,
    sourceFile: `${title}.md`,
    content: "content",
    metadata: { title, section }
  }
});

describe("HybridRanker", () => {
  it("allows generic metadata and title signals to beat a slightly higher vector score", () => {
    const ranker = new HybridRanker(DEFAULT_RETRIEVAL_CONFIG);
    const relevant = ranker.rank(plan, hit("Collected Works / Twenty Third Chapter", "Twenty Third Chapter", 0.4), plan.expandedQueries[1]!);
    const semanticOnly = ranker.rank(plan, hit("Unrelated Essay", "Other", 0.48), plan.expandedQueries[0]!);
    expect(relevant.score).toBeGreaterThan(semanticOnly.score);
    expect(relevant.scoreBreakdown.matchedFields).toEqual(expect.arrayContaining(["title", "section"]));
  });

  it("exposes an asynchronous future-reranker seam", async () => {
    const ranked = new HybridRanker(DEFAULT_RETRIEVAL_CONFIG).rank(plan, hit("Title", "Section", 0.5), "query");
    await expect(new NoopCandidateReranker().rerank(plan, [ranked])).resolves.toEqual([ranked]);
  });

  it("does not treat out-of-order title tokens as an exact structured reference", () => {
    const ranker = new HybridRanker(DEFAULT_RETRIEVAL_CONFIG);
    const exact = ranker.rank(plan, hit("Twenty Third Chapter", "Twenty Third Chapter", 0.4), "query");
    const scattered = ranker.rank(
      plan,
      hit("Twenty Second Chapter / Third Appendix", "Twenty Second Chapter", 0.5),
      "query"
    );
    expect(exact.scoreBreakdown.metadata).toBeGreaterThan(scattered.scoreBreakdown.metadata);
  });
});
