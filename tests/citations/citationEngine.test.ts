import { describe, expect, it } from "vitest";
import type { StrictRagAnswer } from "../../src/answer/types.js";
import { UNSUPPORTED_ANSWER } from "../../src/answer/strictRagAnswerEngine.js";
import { CitationEngine } from "../../src/citations/citationEngine.js";
import { formatCitedAnswerMarkdown } from "../../src/citations/citationFormatter.js";

const baseAnswer = (overrides: Partial<StrictRagAnswer> = {}): StrictRagAnswer => ({
  answer:
    "İhlas, amelin Allah rızası için yapılmasıdır. [chunk-1] Kişi gösterişten uzak durur. [chunk-1]",
  confidence: 91,
  usedChunks: [
    {
      chunkId: "chunk-1",
      title: "Kırık Testi",
      url: "https://example.test/ihlas",
      headingPath: ["Kırık Testi", "İhlas"],
      similarityScore: 0.96,
      chunkIndex: 0,
      totalChunks: 3,
      sourceFile: "tr/kirik-testi.md",
      markdown:
        "# İhlas\n\n**İhlas**, amelin yalnız Allah rızası için yapılmasıdır. İnsan gösterişten uzak durur. Kalbini samimiyetle korur ve davranışlarını yalnızca Hakk'ın hoşnutluğuna yöneltir."
    }
  ],
  ignoredChunks: [],
  estimatedTokens: 500,
  model: "test-model",
  ...overrides
});

describe("CitationEngine", () => {
  it("maps chunk markers to a stable citation number", () => {
    const result = new CitationEngine().build("İhlas nedir?", baseAnswer());

    expect(result.answer).toBe(
      "İhlas, amelin Allah rızası için yapılmasıdır. [1] Kişi gösterişten uzak durur. [1]"
    );
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      id: 1,
      source: "fgulen",
      title: "Kırık Testi",
      url: "https://example.test/ihlas",
      chunkId: "chunk-1",
      score: 0.96,
      similarityScore: 0.96,
      sourceFile: "tr/kirik-testi.md",
      chunkIndex: 0,
      totalChunks: 3
    });
    expect(result.citations[0]?.excerpt).toContain("İhlas");
    expect(result.citations[0]?.excerpt).not.toContain("**");
    expect(result.citations[0]?.excerpt.length).toBeGreaterThanOrEqual(120);
    expect(result.citations[0]?.excerpt.length).toBeLessThanOrEqual(220);
  });

  it("preserves risale citation provenance", () => {
    const result = new CitationEngine().build(
      "Sözler nedir?",
      baseAnswer({
        usedChunks: [
          {
            ...baseAnswer().usedChunks[0]!,
            source: "risale",
            collection: "risale"
          }
        ]
      })
    );

    expect(result.citations[0]?.source).toBe("risale");
  });

  it("numbers different sources by first appearance", () => {
    const result = new CitationEngine().build(
      "İhlas nedir?",
      baseAnswer({
        answer: "Birinci kaynak. [chunk-2] İkinci kaynak. [chunk-1] Tekrar. [chunk-2]",
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

    expect(result.answer).toBe("Birinci kaynak. [1] İkinci kaynak. [2] Tekrar. [1]");
    expect(result.citationGroups).toHaveLength(2);
    expect(result.citations.map((citation) => citation.chunkId)).toEqual(["chunk-2", "chunk-1"]);
    expect(result.citations.map((citation) => citation.id)).toEqual([1, 2]);
  });

  it("accepts verbose model markers", () => {
    const result = new CitationEngine().build(
      "İhlas nedir?",
      baseAnswer({ answer: "Destekli cevap. [chunk-id: chunk-1]" })
    );
    expect(result.answer).toBe("Destekli cevap. [1]");
    expect(result.citations).toHaveLength(1);
  });

  it("reuses a number for different chunks from the same source", () => {
    const first = baseAnswer().usedChunks[0]!;
    const result = new CitationEngine().build(
      "İhlas nedir?",
      baseAnswer({
        answer: "Birinci bölüm. [chunk-1] İkinci bölüm. [chunk-2]",
        usedChunks: [first, { ...first, chunkId: "chunk-2", chunkIndex: 1 }]
      })
    );
    expect(result.answer).toBe("Birinci bölüm. [1] İkinci bölüm. [1]");
    expect(result.citations).toHaveLength(1);
  });

  it("adds a safe whole-answer marker when exactly one source is used", () => {
    const result = new CitationEngine().build(
      "İhlas nedir?",
      baseAnswer({ answer: "Tek kaynaktan destekli cevap." })
    );
    expect(result.answer).toBe("Tek kaynaktan destekli cevap. [1]");
    expect(result.citations).toHaveLength(1);
  });

  it("retains multiple model-reported sources when inline markers are omitted", () => {
    const first = baseAnswer().usedChunks[0]!;
    const result = new CitationEngine().build(
      "Question",
      baseAnswer({
        answer: "Supported answer without model-formatted markers.",
        usedChunks: [
          first,
          { ...first, chunkId: "chunk-2", url: "https://example.test/second", title: "Second" }
        ]
      })
    );
    expect(result.answer).toBe("Supported answer without model-formatted markers. [1][2]");
    expect(result.citations.map(({ chunkId }) => chunkId)).toEqual(["chunk-1", "chunk-2"]);
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
      answer: "A kaynağı. [chunk-a] B kaynağı. [chunk-b]",
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
      1, 2
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
