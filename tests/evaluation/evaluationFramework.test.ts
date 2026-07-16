import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNSUPPORTED_ANSWER } from "../../src/answer/strictRagAnswerEngine.js";
import type { CitedAnswer } from "../../src/citations/types.js";
import {
  EvaluationReportWriter,
  summarizeEvaluation
} from "../../src/evaluation/evaluationReport.js";
import { EvaluationRunner } from "../../src/evaluation/evaluationRunner.js";
import { loadEvaluationQuestions } from "../../src/evaluation/questionLoader.js";
import type { EvaluationQuestion, EvaluationResult } from "../../src/evaluation/types.js";

const question = (id: string): EvaluationQuestion => ({
  id,
  category: "concept",
  question: `Question ${id}`,
  difficulty: "medium"
});

const answer = (text: string, confidence: number, citationCount: number): CitedAnswer => ({
  question: "Question",
  answer: text,
  confidence,
  citations: Array.from({ length: citationCount }, (_, index) => ({
    id: index + 1,
    source: "fgulen",
    title: "Book",
    url: null,
    headingPath: ["Book"],
    chunkId: `chunk-${index}`,
    score: 0.9,
    similarityScore: 0.9,
    sourceFile: "book.md",
    excerpt: "Evidence",
    chunkIndex: index,
    totalChunks: citationCount
  })),
  citationGroups: [],
  sourceAnswer: {
    answer: text,
    confidence,
    usedChunks: [],
    ignoredChunks: [],
    estimatedTokens: 42,
    model: "test"
  }
});

describe("evaluation framework", () => {
  it("loads the committed benchmark questions", async () => {
    const questions = await loadEvaluationQuestions(
      join(process.cwd(), "tests", "evaluation", "questions.json")
    );
    expect(questions.length).toBeGreaterThan(0);
    expect(new Set(questions.map((item) => item.id)).size).toBe(questions.length);
  });

  it("measures and stores every answer without assigning a quality score", async () => {
    const responses = new Map([
      ["Question one", answer("A complete answer.", 80, 2)],
      ["Question two", answer(UNSUPPORTED_ANSWER, 0, 0)]
    ]);
    const results = await new EvaluationRunner({
      answer: (text) => {
        const response = responses.get(text);
        return response === undefined
          ? Promise.reject(new Error("missing fixture"))
          : Promise.resolve(response);
      }
    }).run([question("one"), question("two")]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      answer: "A complete answer.",
      confidence: 80,
      citationCount: 2,
      totalTokens: 42,
      answerLength: 18,
      fallbackAnswer: false
    });
    expect(results[1]?.fallbackAnswer).toBe(true);
    expect(results[0]).not.toHaveProperty("qualityScore");
  });

  it("writes date-partitioned JSON and Markdown summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "evaluation-report-"));
    const results: readonly EvaluationResult[] = [
      {
        ...question("one"),
        answer: "Longest answer",
        confidence: 80,
        citationCount: 2,
        citations: [],
        responseTimeMs: 120,
        totalTokens: 42,
        answerLength: 14,
        fallbackAnswer: false,
        error: null
      },
      {
        ...question("two"),
        answer: UNSUPPORTED_ANSWER,
        confidence: 0,
        citationCount: 0,
        citations: [],
        responseTimeMs: 80,
        totalTokens: 20,
        answerLength: UNSUPPORTED_ANSWER.length,
        fallbackAnswer: true,
        error: null
      }
    ];
    const paths = await new EvaluationReportWriter(root).write(
      results,
      new Date("2026-07-11T12:00:00.000Z")
    );
    const json = await readFile(paths.jsonPath, "utf8");
    const markdown = await readFile(paths.markdownPath, "utf8");

    expect(paths.jsonPath).toBe(join(root, "2026-07-11", "evaluation.json"));
    expect(JSON.parse(json)).toMatchObject({
      summary: {
        questionCount: 2,
        averageResponseTimeMs: 100,
        averageConfidence: 40,
        averageCitations: 1,
        zeroCitationQuestionIds: ["two"],
        fallbackQuestionIds: ["two"]
      }
    });
    expect(markdown).toContain("## Overall summary");
    expect(markdown).toContain("### Question");
    expect(markdown).toContain("### Answer");
    expect(summarizeEvaluation(results).completedCount).toBe(2);
  });
});
