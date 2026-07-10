import type { SearchHit } from "./types.js";

export const normalizeSearchText = (value: string): string =>
  value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

export const titleMatchBonus = (query: string, title: string | null): number => {
  if (title === null) {
    return 0;
  }

  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(title);
  if (normalizedQuery.length === 0 || normalizedTitle.length === 0) {
    return 0;
  }
  if (normalizedTitle === normalizedQuery) {
    return 0.25;
  }
  if (normalizedTitle.startsWith(normalizedQuery)) {
    return 0.15;
  }
  if (normalizedTitle.includes(normalizedQuery)) {
    return 0.1;
  }
  return 0;
};

export const rerankHitByTitle = (query: string, hit: SearchHit): SearchHit => ({
  ...hit,
  score: hit.score + titleMatchBonus(query, hit.payload.title)
});
