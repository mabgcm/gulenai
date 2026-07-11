import { z } from "zod";
import { readJson } from "../utils/fs.js";
import type { EvaluationQuestion } from "./types.js";

const questionSchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().trim().min(1),
  question: z.string().trim().min(1),
  difficulty: z.enum(["easy", "medium", "hard"])
});

const questionsSchema = z
  .array(questionSchema)
  .min(1)
  .superRefine((questions, context) => {
    const ids = new Set<string>();
    questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate evaluation question id: ${question.id}`,
          path: [index, "id"]
        });
      }
      ids.add(question.id);
    });
  });

export const loadEvaluationQuestions = async (
  path: string
): Promise<readonly EvaluationQuestion[]> => {
  const value = await readJson<unknown>(path);
  if (value === null) {
    throw new Error(`Evaluation questions file not found: ${path}`);
  }
  return questionsSchema.parse(value);
};
