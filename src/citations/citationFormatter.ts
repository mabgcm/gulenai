import type { CitedAnswer, Citation, CitationGroup } from "./types.js";

const headingText = (headingPath: readonly string[]): string =>
  headingPath.length > 0 ? headingPath.join("\n-> ") : "(none)";

const sourceLines = (citation: Citation): readonly string[] => [
  "Book:",
  citation.title ?? "(untitled)",
  "",
  "Heading:",
  headingText(citation.headingPath),
  "",
  "URL:",
  citation.url ?? "(unknown)",
  "",
  "Chunk:",
  citation.chunkId,
  "",
  "Score:",
  citation.score.toFixed(4),
  "",
  "Chunk Index:",
  `${citation.chunkIndex} of ${citation.totalChunks}`
];

const formatGroup = (group: CitationGroup): string =>
  [
    `[${group.id}]`,
    "",
    ...group.citations.flatMap((citation, index) => [
      ...(group.citations.length > 1 ? [`Source ${index + 1}`, ""] : []),
      ...sourceLines(citation),
      ...(index === group.citations.length - 1 ? [] : ["", "---", ""])
    ])
  ].join("\n");

export const formatCitedAnswerMarkdown = (answer: CitedAnswer): string =>
  [
    "Question",
    "",
    answer.question,
    "",
    "Answer",
    "",
    answer.answer,
    "",
    "Confidence",
    "",
    `${answer.confidence}%`,
    "",
    "Sources",
    "",
    answer.citationGroups.length > 0
      ? answer.citationGroups.map(formatGroup).join("\n\n")
      : "No source chunks were used."
  ].join("\n");

export const formatCitedAnswerCli = (answer: CitedAnswer): string =>
  [
    formatCitedAnswerMarkdown(answer),
    "",
    "Chunks Used",
    "",
    `${answer.sourceAnswer.usedChunks.length}`,
    "",
    "Model",
    "",
    answer.sourceAnswer.model
  ].join("\n");
