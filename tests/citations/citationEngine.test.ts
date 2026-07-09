import { describe, expect, it } from "vitest";
import type { StrictRagAnswer } from "../../src/answer/types.js";
import { UNSUPPORTED_ANSWER } from "../../src/answer/strictRagAnswerEngine.js";
import { CitationEngine } from "../../src/citations/citationEngine.js";
import { formatCitedAnswerMarkdown } from "../../src/citations/citationFormatter.js";

const baseAnswer = (overrides: Partial<StrictRagAnswer> = {}): StrictRagAnswer => ({
  answer: "İhlas, amelin Allah rızası için yapılmasıdır. Kişi gösterişten uzak durur.",
  confidence: 91,
  usedChunks: [
    {
      chunkId: "chunk-1",
      title: "Kırık Testi",
      url: "https://example.test/ihlas",
      headingPath: ["Kırık Testi", "İhlas"],
      similarityScore: 0.96,
      chunkIndex: 0,
      totalChunks: 3
    }
  ],
  ignoredChunks: [],
  estimatedTokens: 500,
  model: "test-model",
  ...overrides
});

describe("CitationEngine", () => {
  it("adds a single citation to every answer sentence", () => {
    const result = new CitationEngine().build("İhlas nedir?", baseAnswer());

    expect(result.answer).toBe(
      "İhlas, amelin Allah rızası için yapılmasıdır. [1] Kişi gösterişten uzak durur. [1]"
    );
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      id: 1,
      title: "Kırık Testi",
      url: "https://example.test/ihlas",
      chunkId: "chunk-1",
      score: 0.96,
      chunkIndex: 0,
      totalChunks: 3
    });
  });

  it("groups multiple supporting chunks under one citation marker", () => {
    const result = new CitationEngine().build(
      "İhlas nedir?",
      baseAnswer({
        usedChunks: [
          ...baseAnswer().usedChunks,
          {
            chunkId: "chunk-2",
            title: "Prizma",
            url: "https://example.test/prizma",
            headingPath: ["Prizma", "Samimiyet"],
            similarityScore: 0.91,
            chunkIndex: 1,
            totalChunks: 3
          }
        ]
      })
    );

    expect(result.answer).toContain("[1]");
    expect(result.citationGroups).toHaveLength(1);
    expect(result.citationGroups[0]?.citations.map((citation) => citation.chunkId)).toEqual([
      "chunk-1",
      "chunk-2"
    ]);
    expect(result.citations.map((citation) => citation.id)).toEqual([1, 1]);
  });

  it("eliminates duplicate chunks", () => {
    const duplicate = baseAnswer().usedChunks[0]!;
    const result = new CitationEngine().build(
      "İhlas nedir?",
      baseAnswer({ usedChunks: [duplicate, duplicate] })
    );

    expect(result.citations.map((citation) => citation.chunkId)).toEqual(["chunk-1"]);
  });

  it("assigns deterministic citation numbering", () => {
    const answer = baseAnswer({
      usedChunks: [
        {
          chunkId: "chunk-b",
          title: "B",
          url: "https://example.test/b",
          headingPath: ["B"],
          similarityScore: 0.8,
          chunkIndex: 1,
          totalChunks: 2
        },
        {
          chunkId: "chunk-a",
          title: "A",
          url: "https://example.test/a",
          headingPath: ["A"],
          similarityScore: 0.9,
          chunkIndex: 0,
          totalChunks: 2
        }
      ]
    });

    expect(new CitationEngine().build("Soru", answer)).toEqual(
      new CitationEngine().build("Soru", answer)
    );
    expect(new CitationEngine().build("Soru", answer).citations.map((item) => item.id)).toEqual([
      1,
      1
    ]);
  });

  it("does not fabricate citations when no chunk is available", () => {
    const result = new CitationEngine().build(
      "Tevekkül nedir?",
      baseAnswer({ answer: UNSUPPORTED_ANSWER, confidence: 0, usedChunks: [] })
    );

    expect(result.answer).toBe(UNSUPPORTED_ANSWER);
    expect(result.citations).toEqual([]);
    expect(result.citationGroups).toEqual([]);
  });

  it("renders grouped citations in Markdown", () => {
    const markdown = formatCitedAnswerMarkdown(new CitationEngine().build("İhlas?", baseAnswer()));

    expect(markdown).toContain("Sources");
    expect(markdown).toContain("[1]");
    expect(markdown).toContain("Book:\nKırık Testi");
    expect(markdown).toContain("Chunk:\nchunk-1");
  });
});
