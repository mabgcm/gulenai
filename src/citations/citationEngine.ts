import type { StrictRagAnswer } from "../answer/types.js";
import { UNSUPPORTED_ANSWER } from "../answer/strictRagAnswerEngine.js";
import type { CitedAnswer, Citation, CitationGroup } from "./types.js";

const SENTENCE_ENDING = /([.!?。！？]+)(\s+|$)/g;

const dedupeCitations = (answer: StrictRagAnswer): readonly Citation[] => {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of answer.usedChunks) {
    if (seen.has(chunk.chunkId)) {
      continue;
    }
    seen.add(chunk.chunkId);
    citations.push({
      id: 1,
      title: chunk.title,
      url: chunk.url,
      headingPath: chunk.headingPath,
      chunkId: chunk.chunkId,
      score: chunk.similarityScore,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks
    });
  }
  return citations;
};

const citeEverySentence = (answer: string, citationId: number): string => {
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  let lastIndex = 0;
  let cited = "";
  let matched = false;
  for (const match of trimmed.matchAll(SENTENCE_ENDING)) {
    matched = true;
    const punctuation = match[1] ?? "";
    const separator = match[2] ?? "";
    const sentenceEnd = match.index + punctuation.length;
    cited += `${trimmed.slice(lastIndex, sentenceEnd)} [${citationId}]${separator}`;
    lastIndex = sentenceEnd + separator.length;
  }

  if (!matched) {
    return `${trimmed} [${citationId}]`;
  }

  if (lastIndex < trimmed.length) {
    cited += `${trimmed.slice(lastIndex).trimEnd()} [${citationId}]`;
  }
  return cited.trimEnd();
};

export class CitationEngine {
  public build(question: string, answer: StrictRagAnswer): CitedAnswer {
    const citations = dedupeCitations(answer);
    const citationGroups: readonly CitationGroup[] =
      citations.length > 0 ? [{ id: 1, citations }] : [];
    const citedText =
      citations.length === 0 || answer.answer.trim() === UNSUPPORTED_ANSWER
        ? answer.answer.trim()
        : citeEverySentence(answer.answer, 1);

    return {
      question: question.trim(),
      answer: citedText,
      confidence: answer.confidence,
      citations,
      citationGroups,
      sourceAnswer: answer
    };
  }
}
