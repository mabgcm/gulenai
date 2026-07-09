import { describe, expect, it } from "vitest";
import { formatSearchResults } from "../../src/search/searchFormatter.js";
import type { SearchResult } from "../../src/search/types.js";

const result: SearchResult = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  title: "Kırık Testi",
  url: "https://fgulen.com/article",
  headingPath: ["İhlas", "Samimiyet"],
  similarityScore: 0.94,
  markdown: "# İhlas",
  metadata: {
    chunkIds: ["chunk-1"],
    sourceFile: "tr/article.md",
    language: "tr",
    chunkIndex: 0,
    totalChunks: 1,
    tokenCount: 100,
    contentHash: "hash",
    merged: false
  }
};

describe("formatSearchResults", () => {
  it("formats top results", () => {
    expect(formatSearchResults([result])).toBe(
      [
        "Top Results",
        "",
        "1.",
        "Score: 0.94",
        "Book: Kırık Testi",
        "Heading:",
        "İhlas -> Samimiyet"
      ].join("\n")
    );
  });

  it("formats empty results", () => {
    expect(formatSearchResults([])).toBe("Top Results\n\nNo results found.");
  });
});
