import type { StrictRagAnswer } from "./types.js";

export const formatAnswer = (question: string, result: StrictRagAnswer): string =>
  [
    "Question",
    "",
    question.trim(),
    "",
    "Answer",
    "",
    result.answer,
    "",
    "Confidence",
    "",
    `${result.confidence}%`,
    "",
    "Chunks Used",
    "",
    `${result.usedChunks.length}`,
    "",
    "Model",
    "",
    result.model
  ].join("\n");
