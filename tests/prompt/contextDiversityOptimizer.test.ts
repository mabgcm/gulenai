import { describe, expect, it } from "vitest";
import { ContextDiversityOptimizer } from "../../src/prompt/contextDiversityOptimizer.js";
import type { SearchResult } from "../../src/search/types.js";

const chunk = (
  chunkId: string,
  score: number,
  documentId: string,
  book: string,
  heading: string,
  chunkIndex = 0,
  markdown = `Distinct information for ${chunkId}`
): SearchResult => ({
  chunkId,
  documentId,
  title: book,
  url: null,
  headingPath: [book, heading],
  similarityScore: score,
  markdown,
  metadata: {
    chunkIds: [chunkId],
    sourceFile: `${documentId}.md`,
    language: "tr",
    chunkIndex,
    totalChunks: 5,
    tokenCount: 20,
    contentHash: chunkId,
    merged: false
  }
});

describe("ContextDiversityOptimizer", () => {
  const optimizer = new ContextDiversityOptimizer();

  it("keeps the highest semantic result first and caps a document at two chunks", () => {
    const optimized = optimizer.optimize([
      chunk("a", 0.95, "doc-a", "Book A", "One"),
      chunk("b", 0.9, "doc-a", "Book A", "Two", 2),
      chunk("c", 0.88, "doc-a", "Book A", "Three", 4),
      chunk("d", 0.86, "doc-b", "Book B", "One")
    ]);

    expect(optimized[0]?.chunkId).toBe("a");
    expect(optimized.filter((item) => item.documentId === "doc-a")).toHaveLength(2);
    expect(optimized.map((item) => item.chunkId)).toContain("d");
  });

  it("prefers a different book when similarity differences are small", () => {
    const optimized = optimizer.optimize([
      chunk("top", 0.95, "doc-a", "Book A", "One"),
      chunk("same-book", 0.94, "doc-b", "Book A", "Two"),
      chunk("new-book", 0.93, "doc-c", "Book B", "One")
    ]);

    expect(optimized.map((item) => item.chunkId)).toEqual(["top", "new-book", "same-book"]);
  });

  it("removes near-identical neighbouring chunks but retains distinct neighbours", () => {
    const repeated = "ortak kavram açıklama detay delil sonuç yaklaşım anlam içerik";
    const optimized = optimizer.optimize([
      chunk("top", 0.95, "doc-a", "Book A", "One", 0, repeated),
      chunk("duplicate", 0.94, "doc-a", "Book A", "One", 1, `${repeated} ek`),
      chunk("distinct", 0.93, "doc-a", "Book A", "Two", 1, "başka özgün görüş yeni katkı")
    ]);

    expect(optimized.map((item) => item.chunkId)).toEqual(["top", "distinct"]);
  });
});
