import { performance } from "node:perf_hooks";
import { UNSUPPORTED_ANSWER } from "../answer/strictRagAnswerEngine.js";
import type { CitedAnswer } from "../citations/types.js";
import type { EvaluationQuestion, EvaluationResult } from "./types.js";

export interface EvaluationAnswerPipeline {
  answer(question: string): Promise<CitedAnswer>;
}

const roundedMilliseconds = (value: number): number => Number(value.toFixed(2));

export class EvaluationRunner {
  public constructor(private readonly pipeline: EvaluationAnswerPipeline) {}

  public async run(questions: readonly EvaluationQuestion[]): Promise<readonly EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    for (const question of questions) {
      const startedAt = performance.now();
      try {
        const response = await this.pipeline.answer(question.question);
        results.push({
          ...question,
          answer: response.answer,
          confidence: response.confidence,
          citationCount: response.citations.length,
          citations: response.citations,
          responseTimeMs: roundedMilliseconds(performance.now() - startedAt),
          totalTokens: response.sourceAnswer.estimatedTokens,
          answerLength: response.answer.length,
          fallbackAnswer: response.answer.trim() === UNSUPPORTED_ANSWER,
          error: null
        });
      } catch (error: unknown) {
        results.push({
          ...question,
          answer: "",
          confidence: 0,
          citationCount: 0,
          citations: [],
          responseTimeMs: roundedMilliseconds(performance.now() - startedAt),
          totalTokens: 0,
          answerLength: 0,
          fallbackAnswer: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return results;
  }
}
