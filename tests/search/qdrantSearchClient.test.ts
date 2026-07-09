import { describe, expect, it } from "vitest";
import { buildQdrantFilterForTest } from "../../src/search/qdrantSearchClient.js";

describe("buildQdrantFilter", () => {
  it("builds exact-match payload filters", () => {
    expect(
      buildQdrantFilterForTest({
        language: "tr",
        documentId: "doc-1",
        title: "Kırık Testi",
        url: "https://fgulen.com/article",
        sourceFile: "tr/article.md"
      })
    ).toEqual({
      must: [
        { key: "language", match: { value: "tr" } },
        { key: "documentId", match: { value: "doc-1" } },
        { key: "title", match: { value: "Kırık Testi" } },
        { key: "url", match: { value: "https://fgulen.com/article" } },
        { key: "sourceFile", match: { value: "tr/article.md" } }
      ]
    });
  });

  it("omits empty filters", () => {
    expect(buildQdrantFilterForTest({})).toBeUndefined();
  });
});
