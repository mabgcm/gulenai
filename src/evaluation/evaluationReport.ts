import { join } from "node:path";
import { ensureDir, writeJson, writeTextFile } from "../utils/fs.js";
import type { EvaluationReport, EvaluationResult, EvaluationSummary } from "./types.js";

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));

const answerExtreme = (
  results: readonly EvaluationResult[],
  direction: "longest" | "shortest"
): { readonly id: string; readonly length: number } | null => {
  if (results.length === 0) return null;
  const ordered = [...results].sort((left, right) =>
    direction === "longest"
      ? right.answerLength - left.answerLength || left.id.localeCompare(right.id)
      : left.answerLength - right.answerLength || left.id.localeCompare(right.id)
  );
  return { id: ordered[0]!.id, length: ordered[0]!.answerLength };
};

export const summarizeEvaluation = (results: readonly EvaluationResult[]): EvaluationSummary => {
  const completed = results.filter((result) => result.error === null);
  return {
    questionCount: results.length,
    completedCount: completed.length,
    failedCount: results.length - completed.length,
    averageResponseTimeMs: average(completed.map((result) => result.responseTimeMs)),
    averageConfidence: average(completed.map((result) => result.confidence)),
    averageCitations: average(completed.map((result) => result.citationCount)),
    averageAnswerLength: average(completed.map((result) => result.answerLength)),
    longestAnswer: answerExtreme(completed, "longest"),
    shortestAnswer: answerExtreme(completed, "shortest"),
    zeroCitationQuestionIds: completed
      .filter((result) => result.citationCount === 0)
      .map((result) => result.id),
    fallbackQuestionIds: completed
      .filter((result) => result.fallbackAnswer)
      .map((result) => result.id)
  };
};

const listOrNone = (ids: readonly string[]): string =>
  ids.length === 0 ? "None" : ids.map((id) => `\`${id}\``).join(", ");

const renderResult = (result: EvaluationResult): string =>
  [
    `## ${result.id}`,
    "",
    `- Category: ${result.category}`,
    `- Difficulty: ${result.difficulty}`,
    `- Confidence: ${result.confidence}`,
    `- Citation count: ${result.citationCount}`,
    `- Execution time: ${result.responseTimeMs} ms`,
    `- Tokens: ${result.totalTokens}`,
    `- Answer length: ${result.answerLength} characters`,
    `- Error: ${result.error ?? "None"}`,
    "",
    "### Question",
    "",
    result.question,
    "",
    "### Answer",
    "",
    result.answer || "_(No answer produced.)_",
    ""
  ].join("\n");

export const renderEvaluationMarkdown = (report: EvaluationReport): string => {
  const { summary } = report;
  return [
    "# Evaluation Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Overall summary",
    "",
    `- Questions: ${summary.questionCount}`,
    `- Completed: ${summary.completedCount}`,
    `- Failed: ${summary.failedCount}`,
    `- Average response time: ${summary.averageResponseTimeMs} ms`,
    `- Average confidence: ${summary.averageConfidence}`,
    `- Average citations: ${summary.averageCitations}`,
    `- Average answer length: ${summary.averageAnswerLength} characters`,
    `- Longest answer: ${summary.longestAnswer === null ? "None" : `${summary.longestAnswer.id} (${summary.longestAnswer.length} characters)`}`,
    `- Shortest answer: ${summary.shortestAnswer === null ? "None" : `${summary.shortestAnswer.id} (${summary.shortestAnswer.length} characters)`}`,
    `- Questions producing zero citations: ${listOrNone(summary.zeroCitationQuestionIds)}`,
    `- Questions producing fallback answers: ${listOrNone(summary.fallbackQuestionIds)}`,
    "",
    ...report.results.map(renderResult)
  ].join("\n");
};

export class EvaluationReportWriter {
  public constructor(private readonly reportsRoot = join(process.cwd(), "reports", "evaluation")) {}

  public async write(
    results: readonly EvaluationResult[],
    generatedAt = new Date()
  ): Promise<{ readonly jsonPath: string; readonly markdownPath: string }> {
    const report: EvaluationReport = {
      generatedAt: generatedAt.toISOString(),
      summary: summarizeEvaluation(results),
      results
    };
    const directory = join(this.reportsRoot, report.generatedAt.slice(0, 10));
    const jsonPath = join(directory, "evaluation.json");
    const markdownPath = join(directory, "evaluation.md");
    await ensureDir(directory);
    await Promise.all([
      writeJson(jsonPath, report),
      writeTextFile(markdownPath, `${renderEvaluationMarkdown(report).trimEnd()}\n`)
    ]);
    return { jsonPath, markdownPath };
  }
}
