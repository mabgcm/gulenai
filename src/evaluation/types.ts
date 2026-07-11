import type { Citation } from "../citations/types.js";

export type EvaluationDifficulty = "easy" | "medium" | "hard";

export interface EvaluationQuestion {
  readonly id: string;
  readonly category: string;
  readonly question: string;
  readonly difficulty: EvaluationDifficulty;
}

export interface EvaluationResult {
  readonly id: string;
  readonly category: string;
  readonly question: string;
  readonly difficulty: EvaluationDifficulty;
  readonly answer: string;
  readonly confidence: number;
  readonly citationCount: number;
  readonly citations: readonly Citation[];
  readonly responseTimeMs: number;
  readonly totalTokens: number;
  readonly answerLength: number;
  readonly fallbackAnswer: boolean;
  readonly error: string | null;
}

export interface EvaluationSummary {
  readonly questionCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly averageResponseTimeMs: number;
  readonly averageConfidence: number;
  readonly averageCitations: number;
  readonly averageAnswerLength: number;
  readonly longestAnswer: { readonly id: string; readonly length: number } | null;
  readonly shortestAnswer: { readonly id: string; readonly length: number } | null;
  readonly zeroCitationQuestionIds: readonly string[];
  readonly fallbackQuestionIds: readonly string[];
}

export interface EvaluationReport {
  readonly generatedAt: string;
  readonly summary: EvaluationSummary;
  readonly results: readonly EvaluationResult[];
}
