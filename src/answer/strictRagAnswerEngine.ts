import type { TokenCounter } from "../chunking/tokenCounter.js";
import { PromptAssembler } from "../prompt/promptAssembler.js";
import type { PromptChunk, TrimmedPromptChunk } from "../prompt/types.js";
import type { SearchResult } from "../search/types.js";
import type {
  AnswerChunkReference,
  AnswerGenerationOptions,
  ChatCompletionClient,
  ModelAnswerPayload,
  StrictRagAnswer
} from "./types.js";

export const UNSUPPORTED_ANSWER =
  "The indexed sources do not contain enough information to answer this question.";

const STRICT_SYSTEM_PROMPT = [
  "You are a strict retrieval-augmented answer generator.",
  "Answer ONLY from the supplied context.",
  "Never use outside knowledge.",
  "Never guess.",
  "Never hallucinate.",
  "Never fabricate references.",
  `If the answer is not supported by the retrieved context, answer exactly: "${UNSUPPORTED_ANSWER}"`,
  "Return JSON only."
].join(" ");

const STRICT_INSTRUCTIONS = [
  "Use only retrieved context.",
  "Do not use outside knowledge.",
  "If context does not support an answer, return the required insufficient-information sentence exactly.",
  "Report which chunk IDs directly support the answer.",
  "Report ignored chunk IDs for context chunks that were not used.",
  "Set answerSupported to false when the answer is not directly supported.",
  "Set conflictingEvidence to true if supplied chunks disagree.",
  "Set evidenceComplete to true only when the retrieved context fully answers the question."
];

const JSON_SCHEMA_INSTRUCTION = [
  "Return a JSON object with this exact shape:",
  "{",
  '  "answer": "string",',
  '  "usedChunkIds": ["chunk-id"],',
  '  "ignoredChunkIds": ["chunk-id"],',
  '  "answerSupported": true,',
  '  "conflictingEvidence": false,',
  '  "evidenceComplete": true',
  "}"
].join("\n");

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const parseModelPayload = (content: string): ModelAnswerPayload => {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed);
  const parsed = JSON.parse(jsonText) as unknown;
  if (!isObject(parsed) || typeof parsed.answer !== "string") {
    throw new Error("Answer model did not return a valid JSON answer payload");
  }

  return {
    answer: parsed.answer,
    usedChunkIds: parseStringArray(parsed.usedChunkIds),
    ignoredChunkIds: parseStringArray(parsed.ignoredChunkIds),
    answerSupported: typeof parsed.answerSupported === "boolean" ? parsed.answerSupported : true,
    conflictingEvidence:
      typeof parsed.conflictingEvidence === "boolean" ? parsed.conflictingEvidence : false,
    evidenceComplete: typeof parsed.evidenceComplete === "boolean" ? parsed.evidenceComplete : true
  };
};

const chunkReference = (chunk: PromptChunk): AnswerChunkReference => ({
  chunkId: chunk.metadata.chunkId,
  title: chunk.metadata.title,
  url: chunk.metadata.url,
  headingPath: chunk.metadata.headingPath,
  similarityScore: chunk.metadata.similarityScore,
  chunkIndex: chunk.metadata.chunkIndex,
  totalChunks: chunk.metadata.totalChunks,
  sourceFile: chunk.metadata.sourceFile,
  markdown: chunk.markdown
});

const trimmedReference = (chunk: TrimmedPromptChunk): AnswerChunkReference => ({
  chunkId: chunk.chunkId,
  title: chunk.title,
  url: null,
  headingPath: [],
  similarityScore: 0,
  chunkIndex: -1,
  totalChunks: 0,
  sourceFile: "",
  markdown: ""
});

const unique = <T>(items: readonly T[]): readonly T[] => [...new Set(items)];

const calculateAgreementScore = (usedChunks: readonly AnswerChunkReference[]): number => {
  if (usedChunks.length <= 1) {
    return usedChunks.length === 1 ? 8 : 0;
  }
  const counts = new Map<string, number>();
  for (const chunk of usedChunks) {
    const key = chunk.title ?? chunk.url ?? chunk.chunkId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  return Math.round((maxCount / usedChunks.length) * 15);
};

const calculateConfidence = (
  payload: ModelAnswerPayload,
  usedChunks: readonly AnswerChunkReference[]
): number => {
  if (!payload.answerSupported || payload.answer.trim() === UNSUPPORTED_ANSWER) {
    return 0;
  }
  if (usedChunks.length === 0) {
    return 10;
  }

  const averageSimilarity =
    usedChunks.reduce((sum, chunk) => sum + chunk.similarityScore, 0) / usedChunks.length;
  const retrievalScore = Math.min(45, Math.max(0, averageSimilarity * 60));
  const supportScore = Math.min(25, usedChunks.length * 8);
  const agreementScore = calculateAgreementScore(usedChunks);
  const completenessScore = payload.evidenceComplete ? 15 : 5;
  const conflictPenalty = payload.conflictingEvidence ? 30 : 0;

  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        retrievalScore + supportScore + agreementScore + completenessScore - conflictPenalty
      )
    )
  );
};

export class StrictRagAnswerEngine {
  private readonly assembler: PromptAssembler;

  public constructor(
    private readonly chatClient: ChatCompletionClient,
    private readonly tokenCounter: TokenCounter
  ) {
    this.assembler = new PromptAssembler(tokenCounter);
  }

  public async answer(
    question: string,
    retrievedChunks: readonly SearchResult[],
    options: AnswerGenerationOptions
  ): Promise<StrictRagAnswer> {
    const prompt = this.assembler.assemble(question, retrievedChunks, {
      maxContextTokens: options.maxContextTokens,
      systemPrompt: STRICT_SYSTEM_PROMPT,
      instructions: STRICT_INSTRUCTIONS
    });

    if (prompt.chunks.length === 0) {
      return {
        answer: UNSUPPORTED_ANSWER,
        confidence: 0,
        usedChunks: [],
        ignoredChunks: prompt.trimmedChunks.map(trimmedReference),
        estimatedTokens: prompt.estimatedTokens,
        model: options.model
      };
    }

    const availableById = new Map(prompt.chunks.map((chunk) => [chunk.metadata.chunkId, chunk]));
    const raw = await this.chatClient.complete({
      model: options.model,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      messages: [
        { role: "system", content: STRICT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [prompt.promptMarkdown, "", JSON_SCHEMA_INSTRUCTION].join("\n")
        }
      ]
    });
    const payload = parseModelPayload(raw);
    const validUsedIds = unique(payload.usedChunkIds).filter((chunkId) =>
      availableById.has(chunkId)
    );
    const usedChunks = validUsedIds.map((chunkId) => chunkReference(availableById.get(chunkId)!));
    const ignoredChunkIds = new Set([
      ...payload.ignoredChunkIds,
      ...prompt.chunks
        .map((chunk) => chunk.metadata.chunkId)
        .filter((chunkId) => !validUsedIds.includes(chunkId))
    ]);
    const ignoredChunks = [
      ...[...ignoredChunkIds]
        .map((chunkId) => availableById.get(chunkId))
        .filter((chunk): chunk is PromptChunk => chunk !== undefined)
        .map(chunkReference),
      ...prompt.trimmedChunks.map(trimmedReference)
    ];

    const normalizedPayload =
      usedChunks.length === 0 || !payload.answerSupported
        ? { ...payload, answer: UNSUPPORTED_ANSWER, answerSupported: false }
        : payload;
    const outputMarkdown = normalizedPayload.answer;
    const estimatedTokens =
      prompt.estimatedTokens +
      this.tokenCounter.count(raw) +
      this.tokenCounter.count(outputMarkdown);

    return {
      answer: outputMarkdown,
      confidence: calculateConfidence(normalizedPayload, usedChunks),
      usedChunks,
      ignoredChunks,
      estimatedTokens,
      model: options.model
    };
  }
}
