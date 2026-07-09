import { describe, expect, it } from "vitest";
import type { TokenCounter } from "../../src/chunking/tokenCounter.js";
import { PromptAssembler } from "../../src/prompt/promptAssembler.js";
import type { SearchResult } from "../../src/search/types.js";

class WordTokenCounter implements TokenCounter {
  public count(text: string): number {
    return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  }
}

const result = (overrides: {
  chunkId: string;
  score: number;
  markdown: string;
  chunkIndex?: number;
  chunkIds?: readonly string[];
  merged?: boolean;
  title?: string;
}): SearchResult => ({
  chunkId: overrides.chunkId,
  documentId: "doc-1",
  title: overrides.title ?? "Kırık Testi",
  url: `https://example.test/${overrides.chunkId}`,
  headingPath: ["Book", "Chapter"],
  similarityScore: overrides.score,
  markdown: overrides.markdown,
  metadata: {
    chunkIds: overrides.chunkIds ?? [overrides.chunkId],
    sourceFile: `${overrides.chunkId}.md`,
    language: "tr",
    chunkIndex: overrides.chunkIndex ?? 0,
    totalChunks: 4,
    tokenCount: overrides.markdown.split(/\s+/).length,
    contentHash: `hash-${overrides.chunkId}`,
    merged: overrides.merged ?? false
  }
});

describe("PromptAssembler", () => {
  const assembler = new PromptAssembler(new WordTokenCounter());

  it("preserves retrieval-score ordering", () => {
    const prompt = assembler.assemble(
      "What is sincerity?",
      [
        result({ chunkId: "low", score: 0.4, markdown: "low score content" }),
        result({ chunkId: "high", score: 0.9, markdown: "high score content" })
      ],
      { maxContextTokens: 200 }
    );

    expect(prompt.chunks.map((chunk) => chunk.metadata.chunkId)).toEqual(["high", "low"]);
    expect(prompt.promptMarkdown.indexOf("Chunk ID: high")).toBeLessThan(
      prompt.promptMarkdown.indexOf("Chunk ID: low")
    );
  });

  it("trims lowest-ranked chunks when context exceeds the budget", () => {
    const prompt = assembler.assemble(
      "Question",
      [
        result({ chunkId: "first", score: 0.9, markdown: "one two three four" }),
        result({ chunkId: "second", score: 0.8, markdown: "five six seven eight" })
      ],
      { maxContextTokens: 35 }
    );

    expect(prompt.chunks.map((chunk) => chunk.metadata.chunkId)).toEqual(["first"]);
    expect(prompt.trimmedChunks).toHaveLength(1);
    expect(prompt.trimmedChunks[0]?.chunkId).toBe("second");
  });

  it("preserves metadata and merged chunk IDs", () => {
    const prompt = assembler.assemble(
      "Question",
      [
        result({
          chunkId: "merged-main",
          score: 0.95,
          markdown: "merged content",
          chunkIds: ["a", "b"],
          merged: true,
          title: "Prizma"
        })
      ],
      { maxContextTokens: 100 }
    );

    expect(prompt.chunks[0]?.metadata).toMatchObject({
      title: "Prizma",
      url: "https://example.test/merged-main",
      headingPath: ["Book", "Chapter"],
      chunkId: "merged-main",
      chunkIds: ["a", "b"],
      merged: true
    });
    expect(prompt.promptMarkdown).toContain("Chunk IDs: a, b");
  });

  it("reports estimated prompt tokens", () => {
    const prompt = assembler.assemble(
      "Question",
      [result({ chunkId: "first", score: 0.9, markdown: "context words" })],
      { maxContextTokens: 100 }
    );

    expect(prompt.estimatedTokens).toBe(new WordTokenCounter().count(prompt.promptMarkdown));
    expect(prompt.estimatedTokens).toBeGreaterThan(prompt.chunks[0]?.estimatedTokens ?? 0);
  });

  it("generates deterministic prompt markdown and JSON fields", () => {
    const chunks = [result({ chunkId: "stable", score: 0.7, markdown: "stable context" })];
    const first = assembler.assemble("Stable?", chunks, { maxContextTokens: 100 });
    const second = assembler.assemble("Stable?", chunks, { maxContextTokens: 100 });

    expect(first.promptMarkdown).toBe(second.promptMarkdown);
    expect(JSON.stringify(first.chunks)).toBe(JSON.stringify(second.chunks));
    expect(first.trimmedChunks).toEqual(second.trimmedChunks);
  });
});
