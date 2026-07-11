import { join } from "node:path";
import { DefaultKnowledgeApiService } from "../api/services/knowledgeApiService.js";
import { loadConfig } from "../config/env.js";
import { readJson } from "../utils/fs.js";
import { EvaluationReportWriter } from "./evaluationReport.js";
import { EvaluationRunner } from "./evaluationRunner.js";
import { loadEvaluationQuestions } from "./questionLoader.js";

const packageVersion = async (): Promise<string> => {
  const value = await readJson<unknown>(join(process.cwd(), "package.json"));
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string"
  ) {
    return value.version;
  }
  return "unknown";
};

const main = async (): Promise<void> => {
  const questionsPath = join(process.cwd(), "tests", "evaluation", "questions.json");
  const questions = await loadEvaluationQuestions(questionsPath);
  const service = new DefaultKnowledgeApiService(loadConfig(), await packageVersion());
  const results = await new EvaluationRunner({
    answer: async (question) => service.answer({ question })
  }).run(questions);
  const paths = await new EvaluationReportWriter().write(results);
  process.stdout.write(
    `Evaluation complete: ${results.length} questions\n${paths.jsonPath}\n${paths.markdownPath}\n`
  );
  if (results.some((result) => result.error !== null)) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `Evaluation failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
