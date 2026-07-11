import { describe, expect, it } from "vitest";
import type { TokenCounter } from "../../src/chunking/tokenCounter.js";
import {
  StrictRagAnswerEngine,
  UNSUPPORTED_ANSWER
} from "../../src/answer/strictRagAnswerEngine.js";
import type { ChatCompletionClient, ChatCompletionRequest } from "../../src/answer/types.js";
import type { SearchResult } from "../../src/search/types.js";

class WordCounter implements TokenCounter {
  public count(text: string): number {
    return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  }
}

class FakeChatClient implements ChatCompletionClient {
  public calls = 0;
  public lastRequest: ChatCompletionRequest | null = null;

  public constructor(private readonly response: string) {}

  public async complete(request: ChatCompletionRequest): Promise<string> {
    await Promise.resolve();
    this.calls += 1;
    this.lastRequest = request;
    return this.response;
  }
}

const chunk = (overrides: {
  chunkId: string;
  score: number;
  markdown: string;
  title?: string;
  chunkIndex?: number;
}): SearchResult => ({
  chunkId: overrides.chunkId,
  documentId: "doc-1",
  title: overrides.title ?? "Kırık Testi",
  url: `https://example.test/${overrides.chunkId}`,
  headingPath: ["Kırık Testi", "İhlas"],
  similarityScore: overrides.score,
  markdown: overrides.markdown,
  metadata: {
    chunkIds: [overrides.chunkId],
    sourceFile: "doc.md",
    language: "tr",
    chunkIndex: overrides.chunkIndex ?? 0,
    totalChunks: 2,
    tokenCount: 50,
    contentHash: `hash-${overrides.chunkId}`,
    merged: false
  }
});

const options = {
  model: "test-model",
  temperature: 0,
  maxOutputTokens: 400,
  maxContextTokens: 1000
};

describe("StrictRagAnswerEngine", () => {
  it("generates supported answers with used chunk metadata", async () => {
    const chat = new FakeChatClient(
      JSON.stringify({
        answer: "İhlas, amellerin Allah rızasına bağlanmasıdır.",
        usedChunkIds: ["chunk-1", "chunk-2"],
        ignoredChunkIds: [],
        answerSupported: true,
        conflictingEvidence: false,
        evidenceComplete: true
      })
    );
    const result = await new StrictRagAnswerEngine(chat, new WordCounter()).answer(
      "İhlas nedir?",
      [
        chunk({ chunkId: "chunk-1", score: 0.9, markdown: "İhlas Allah rızası içindir." }),
        chunk({ chunkId: "chunk-2", score: 0.85, markdown: "Ameller ihlasla yapılmalıdır." })
      ],
      options
    );

    expect(result.answer).toContain("İhlas");
    expect(result.usedChunks.map((item) => item.chunkId)).toEqual(["chunk-1", "chunk-2"]);
    expect(result.confidence).toBeGreaterThan(80);
    expect(chat.calls).toBe(1);
  });

  it("requests structured Turkish synthesis while preserving grounding and citations", async () => {
    const chat = new FakeChatClient(
      JSON.stringify({
        answer: "Tanım ve açıklama. [chunk-1]",
        usedChunkIds: ["chunk-1"],
        ignoredChunkIds: [],
        answerSupported: true,
        conflictingEvidence: false,
        evidenceComplete: true
      })
    );
    await new StrictRagAnswerEngine(chat, new WordCounter()).answer(
      "İhlas nedir?",
      [chunk({ chunkId: "chunk-1", score: 0.9, markdown: "İhlas açıklaması." })],
      options
    );

    const system = chat.lastRequest?.messages[0]?.content ?? "";
    const user = chat.lastRequest?.messages[1]?.content ?? "";
    expect(system).toContain("Begin by defining the concept");
    expect(system).toContain("complete, connected paragraphs");
    expect(system).toContain("complementary viewpoints");
    expect(system).toContain("synthesize their compatible evidence");
    expect(system).toContain("Do not intentionally shorten an answer");
    expect(system).toContain("use only the supplied context");
    expect(system).toContain("exact supporting Context Chunk ID");
    expect(user).toContain("Synthesize all relevant evidence");
    expect(user).toContain('"usedChunkIds": ["chunk-id"]');
  });

  it("returns the required unsupported answer when the model marks context unsupported", async () => {
    const chat = new FakeChatClient(
      JSON.stringify({
        answer: "Bunu cevaplayamam.",
        usedChunkIds: [],
        ignoredChunkIds: ["chunk-1"],
        answerSupported: false,
        conflictingEvidence: false,
        evidenceComplete: false
      })
    );
    const result = await new StrictRagAnswerEngine(chat, new WordCounter()).answer(
      "Alakasız soru",
      [chunk({ chunkId: "chunk-1", score: 0.5, markdown: "İhlas hakkında metin." })],
      options
    );

    expect(result.answer).toBe(UNSUPPORTED_ANSWER);
    expect(result.confidence).toBe(0);
    expect(result.usedChunks).toHaveLength(0);
    expect(result.ignoredChunks.map((item) => item.chunkId)).toContain("chunk-1");
  });

  it("lowers confidence for conflicting context", async () => {
    const chat = new FakeChatClient(
      JSON.stringify({
        answer: "Metinler arasında tam uyum yoktur.",
        usedChunkIds: ["chunk-1", "chunk-2"],
        ignoredChunkIds: [],
        answerSupported: true,
        conflictingEvidence: true,
        evidenceComplete: false
      })
    );
    const result = await new StrictRagAnswerEngine(chat, new WordCounter()).answer(
      "Çelişki var mı?",
      [
        chunk({ chunkId: "chunk-1", score: 0.8, markdown: "Bir ifade.", title: "A" }),
        chunk({ chunkId: "chunk-2", score: 0.8, markdown: "Başka ifade.", title: "B" })
      ],
      options
    );

    expect(result.confidence).toBeLessThan(60);
  });

  it("returns low confidence for weak single-chunk support", async () => {
    const chat = new FakeChatClient(
      JSON.stringify({
        answer: "Kısa destekli cevap.",
        usedChunkIds: ["chunk-1"],
        ignoredChunkIds: [],
        answerSupported: true,
        conflictingEvidence: false,
        evidenceComplete: false
      })
    );
    const result = await new StrictRagAnswerEngine(chat, new WordCounter()).answer(
      "Soru",
      [chunk({ chunkId: "chunk-1", score: 0.2, markdown: "Zayıf bağlam." })],
      options
    );

    expect(result.confidence).toBeLessThan(50);
  });

  it("does not call the model for empty retrieval", async () => {
    const chat = new FakeChatClient("{}");
    const result = await new StrictRagAnswerEngine(chat, new WordCounter()).answer(
      "Boş?",
      [],
      options
    );

    expect(result.answer).toBe(UNSUPPORTED_ANSWER);
    expect(result.confidence).toBe(0);
    expect(chat.calls).toBe(0);
  });

  it("is deterministic for deterministic model output", async () => {
    const response = JSON.stringify({
      answer: "Deterministik cevap.",
      usedChunkIds: ["chunk-1"],
      ignoredChunkIds: [],
      answerSupported: true,
      conflictingEvidence: false,
      evidenceComplete: true
    });
    const first = await new StrictRagAnswerEngine(
      new FakeChatClient(response),
      new WordCounter()
    ).answer("Soru", [chunk({ chunkId: "chunk-1", score: 0.75, markdown: "Bağlam." })], options);
    const second = await new StrictRagAnswerEngine(
      new FakeChatClient(response),
      new WordCounter()
    ).answer("Soru", [chunk({ chunkId: "chunk-1", score: 0.75, markdown: "Bağlam." })], options);

    expect(first).toEqual(second);
  });
});
