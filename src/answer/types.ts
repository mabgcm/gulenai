import type { SearchResult } from "../search/types.js";

export interface AnswerChunkReference {
  readonly chunkId: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly headingPath: readonly string[];
  readonly similarityScore: number;
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly sourceFile?: string;
  readonly markdown?: string;
}

export interface StrictRagAnswer {
  readonly answer: string;
  readonly confidence: number;
  readonly usedChunks: readonly AnswerChunkReference[];
  readonly ignoredChunks: readonly AnswerChunkReference[];
  readonly estimatedTokens: number;
  readonly model: string;
}

export interface AnswerGenerationOptions {
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly maxContextTokens: number;
  readonly retrievalAudit?: {
    readonly embeddingModel: string;
    readonly topKRequested: number;
  };
}

export interface ChatCompletionMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface ChatCompletionRequest {
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly messages: readonly ChatCompletionMessage[];
}

export interface ChatCompletionClient {
  complete(request: ChatCompletionRequest): Promise<string>;
}

export interface ModelAnswerPayload {
  readonly answer: string;
  readonly usedChunkIds: readonly string[];
  readonly ignoredChunkIds: readonly string[];
  readonly answerSupported: boolean;
  readonly conflictingEvidence: boolean;
  readonly evidenceComplete: boolean;
}

export interface AnswerValidationCase {
  readonly question: string;
  readonly result: StrictRagAnswer;
  readonly responseTimeMs: number;
}

export interface RetrievedContext {
  readonly question: string;
  readonly chunks: readonly SearchResult[];
}
