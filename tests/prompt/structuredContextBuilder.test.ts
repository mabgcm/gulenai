import { describe, expect, it } from "vitest";
import { StructuredContextBuilder } from "../../src/prompt/structuredContextBuilder.js";
import type { SearchResult } from "../../src/search/types.js";

const chunk = (chunkId: string, heading: string, markdown: string): SearchResult => ({
  chunkId,
  documentId: `doc-${chunkId}`,
  title: "Kitap",
  url: null,
  headingPath: ["Kitap", heading],
  similarityScore: 0.9,
  markdown,
  metadata: {
    chunkIds: [chunkId, `${chunkId}-merged`],
    sourceFile: `${chunkId}.md`,
    language: "tr",
    chunkIndex: 0,
    totalChunks: 1,
    tokenCount: 10,
    contentHash: chunkId,
    merged: true
  }
});

describe("StructuredContextBuilder", () => {
  it("groups deterministically without changing content, IDs, or chunk membership", () => {
    const raw = [
      chunk("evidence", "Deliller", "  Özgün metin.\n\n\nAynen kalmalı.  "),
      chunk("example", "Örnekler", "Misal metni."),
      chunk("definition", "Tanım", "Kavramın mahiyeti.")
    ];
    const built = new StructuredContextBuilder().build(raw);

    expect(built.sections.map((section) => section.label)).toEqual([
      "Definition",
      "Supporting Evidence",
      "Examples"
    ]);
    expect(built.chunks.map((item) => item.chunkId)).toEqual(["definition", "evidence", "example"]);
    expect(new Set(built.chunks)).toEqual(new Set(raw));
    expect(built.chunks.find((item) => item.chunkId === "evidence")?.markdown).toBe(
      raw[0]?.markdown
    );
    expect(built.chunks.find((item) => item.chunkId === "evidence")?.metadata.chunkIds).toEqual([
      "evidence",
      "evidence-merged"
    ]);
    expect(new StructuredContextBuilder().build(raw)).toEqual(built);
  });
});
