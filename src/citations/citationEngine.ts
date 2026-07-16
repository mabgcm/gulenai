import type { StrictRagAnswer } from "../answer/types.js";
import { UNSUPPORTED_ANSWER } from "../answer/strictRagAnswerEngine.js";
import type { CitedAnswer, Citation, CitationGroup } from "./types.js";
import { createCitationExcerpt } from "./citationExcerpt.js";

const CHUNK_MARKER = /\[(?:chunk-id:\s*)?([a-z0-9-]+)\]/gi;

const titleCaseSlug = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");

const collectionTitleFromUrl = (url: string | null): string | null => {
  if (url === null) return null;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const worksIndex = segments.indexOf("eserleri");
    const slug = worksIndex >= 0 ? segments[worksIndex + 1] : undefined;
    return slug === undefined ? null : titleCaseSlug(slug);
  } catch {
    return null;
  }
};

const dedupeCitations = (answer: StrictRagAnswer): readonly Citation[] => {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of answer.usedChunks) {
    if (seen.has(chunk.chunkId)) continue;
    seen.add(chunk.chunkId);
    citations.push({
      id: 0,
      source: chunk.source ?? "fgulen",
      title: chunk.title,
      collectionTitle: collectionTitleFromUrl(chunk.url),
      url: chunk.url,
      headingPath: chunk.headingPath,
      chunkId: chunk.chunkId,
      score: chunk.similarityScore,
      similarityScore: chunk.similarityScore,
      sourceFile: chunk.sourceFile ?? "",
      excerpt: createCitationExcerpt(chunk.markdown ?? ""),
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks
    });
  }
  return citations;
};

const numberCitations = (
  answer: string,
  citations: readonly Citation[]
): { answer: string; citations: readonly Citation[]; groups: readonly CitationGroup[] } => {
  const byChunkId = new Map(citations.map((citation) => [citation.chunkId, citation]));
  const idBySource = new Map<string, number>();
  const ordered: Citation[] = [];
  const numberedAnswer = answer.replace(CHUNK_MARKER, (marker, chunkId: string) => {
    const citation = byChunkId.get(chunkId);
    if (citation === undefined) return marker;
    const sourceKey = citation.url ?? (citation.sourceFile || citation.chunkId);
    let id = idBySource.get(sourceKey);
    if (id === undefined) {
      id = idBySource.size + 1;
      idBySource.set(sourceKey, id);
      ordered.push({ ...citation, id });
    }
    return `[${id}]`;
  });
  if (ordered.length === 0 && citations.length === 1) {
    const citation = { ...citations[0]!, id: 1 };
    return {
      answer: `${answer} [1]`,
      citations: [citation],
      groups: [{ id: 1, citations: [citation] }]
    };
  }
  return {
    answer: numberedAnswer,
    citations: ordered,
    groups: ordered.map((citation) => ({ id: citation.id, citations: [citation] }))
  };
};

export class CitationEngine {
  public build(question: string, answer: StrictRagAnswer): CitedAnswer {
    const citations = dedupeCitations(answer);
    const numbered =
      citations.length === 0 || answer.answer.trim() === UNSUPPORTED_ANSWER
        ? { answer: answer.answer.trim(), citations: [], groups: [] }
        : numberCitations(answer.answer.trim(), citations);

    return {
      question: question.trim(),
      answer: numbered.answer,
      confidence: answer.confidence,
      citations: numbered.citations,
      citationGroups: numbered.groups,
      sourceAnswer: answer
    };
  }
}
