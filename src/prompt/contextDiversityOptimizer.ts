import type { SearchResult } from "../search/types.js";

const MAX_CHUNKS_PER_DOCUMENT = 2;
const SMALL_SIMILARITY_DIFFERENCE = 0.03;
const NEAR_DUPLICATE_OVERLAP = 0.8;

const bookKey = (chunk: SearchResult): string =>
  chunk.headingPath[0] ?? chunk.title ?? chunk.documentId;
const headingKey = (chunk: SearchResult): string => chunk.headingPath.join(" > ");

const terms = (markdown: string): ReadonlySet<string> =>
  new Set(
    markdown
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2)
  );

const overlap = (left: string, right: string): number => {
  const leftTerms = terms(left);
  const rightTerms = terms(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) {
      shared += 1;
    }
  }
  return shared / Math.min(leftTerms.size, rightTerms.size);
};

const isNearIdenticalNeighbour = (
  candidate: SearchResult,
  selected: readonly SearchResult[]
): boolean =>
  selected.some(
    (existing) =>
      existing.documentId === candidate.documentId &&
      Math.abs(existing.metadata.chunkIndex - candidate.metadata.chunkIndex) <= 1 &&
      overlap(existing.markdown, candidate.markdown) >= NEAR_DUPLICATE_OVERLAP
  );

const semanticOrder = (chunks: readonly SearchResult[]): readonly SearchResult[] =>
  [...chunks].sort(
    (left, right) =>
      right.similarityScore - left.similarityScore ||
      left.documentId.localeCompare(right.documentId) ||
      left.metadata.chunkIndex - right.metadata.chunkIndex ||
      left.chunkId.localeCompare(right.chunkId)
  );

export class ContextDiversityOptimizer {
  public optimize(chunks: readonly SearchResult[]): readonly SearchResult[] {
    const remaining = [...semanticOrder(chunks)];
    const selected: SearchResult[] = [];
    const documentCounts = new Map<string, number>();
    const representedBooks = new Set<string>();
    const representedHeadings = new Set<string>();

    while (remaining.length > 0) {
      const eligible = remaining.filter(
        (chunk) =>
          (documentCounts.get(chunk.documentId) ?? 0) < MAX_CHUNKS_PER_DOCUMENT &&
          !isNearIdenticalNeighbour(chunk, selected)
      );
      if (eligible.length === 0) {
        break;
      }

      const bestScore = eligible[0]!.similarityScore;
      const comparable = eligible.filter(
        (chunk) => bestScore - chunk.similarityScore <= SMALL_SIMILARITY_DIFFERENCE
      );
      const candidate = [...comparable].sort((left, right) => {
        const leftNewBook = representedBooks.has(bookKey(left)) ? 0 : 1;
        const rightNewBook = representedBooks.has(bookKey(right)) ? 0 : 1;
        const leftNewHeading = representedHeadings.has(headingKey(left)) ? 0 : 1;
        const rightNewHeading = representedHeadings.has(headingKey(right)) ? 0 : 1;
        const leftNewDocument = documentCounts.has(left.documentId) ? 0 : 1;
        const rightNewDocument = documentCounts.has(right.documentId) ? 0 : 1;
        return (
          rightNewBook - leftNewBook ||
          rightNewHeading - leftNewHeading ||
          rightNewDocument - leftNewDocument ||
          right.similarityScore - left.similarityScore ||
          remaining.indexOf(left) - remaining.indexOf(right)
        );
      })[0]!;

      selected.push(candidate);
      documentCounts.set(candidate.documentId, (documentCounts.get(candidate.documentId) ?? 0) + 1);
      representedBooks.add(bookKey(candidate));
      representedHeadings.add(headingKey(candidate));
      remaining.splice(remaining.indexOf(candidate), 1);
    }

    return selected;
  }
}
