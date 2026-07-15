import type { RisaleBook, RisalePageTarget } from "./types.js";

export const RISALE_SOURCE = {
  id: "risale",
  name: "Risale-i Nur Külliyatı",
  language: "tr",
  origin: "https://www.erisale.com",
  catalogUrl: "https://www.erisale.com/index.jsp?locale=tr",
  attribution: "eRisale — Risale-i Nur Külliyatı"
} as const;

export const RISALE_CATALOG_SELECTOR = "JavaScript variable: var books = [...]";

const isBook = (value: unknown): value is RisaleBook =>
  typeof value === "object" &&
  value !== null &&
  "bookId" in value &&
  typeof value.bookId === "number" &&
  "name" in value &&
  typeof value.name === "string" &&
  "pageCount" in value &&
  typeof value.pageCount === "number";

export const parseRisaleCatalog = (html: string): readonly RisaleBook[] => {
  const json = html.match(/\bvar\s+books\s*=\s*(\[[\s\S]*?\]);/)?.[1];
  if (json === undefined) throw new Error("eRisale Turkish book catalog was not found");
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error("eRisale book catalog is not an array");
  const books = parsed.filter(isBook).filter((book) => book.pageCount > 0 && book.name.trim());
  if (books.length !== parsed.length || books.length === 0) {
    throw new Error("eRisale book catalog contains invalid entries");
  }
  return books.map((book) => ({
    bookId: book.bookId,
    name: book.name.trim(),
    pageCount: book.pageCount
  }));
};

export const canonicalRisaleUrl = (bookId: number, pageNo: number): string =>
  `${RISALE_SOURCE.origin}/index.jsp?bookId=${bookId}&locale=tr&pageNo=${pageNo}`;

export const targetsForBooks = (books: readonly RisaleBook[]): readonly RisalePageTarget[] =>
  books.flatMap((book) =>
    Array.from({ length: book.pageCount }, (_, index) => ({
      bookId: book.bookId,
      book: book.name,
      pageNo: index + 1,
      canonicalUrl: canonicalRisaleUrl(book.bookId, index + 1)
    }))
  );

export const targetKey = (target: Pick<RisalePageTarget, "bookId" | "pageNo">): string =>
  `${target.bookId}:${target.pageNo}`;
