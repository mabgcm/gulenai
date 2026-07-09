import "../utils/webGlobals.js";
import * as cheerio from "cheerio";
import type { ExtractedMetadata, RawDocument } from "./types.js";
import { sha256 } from "../utils/hash.js";

const textFromSelectors = ($: cheerio.CheerioAPI, selectors: readonly string[]): string | null => {
  for (const selector of selectors) {
    const value =
      $(selector).first().attr("content") ??
      $(selector).first().attr("datetime") ??
      $(selector).first().text();
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
};

const normalizeDate = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

export const countWords = (text: string): number => {
  const words = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu);
  return words?.length ?? 0;
};

export const buildMetadata = (
  raw: RawDocument,
  originalHtml: string,
  cleanedHtml: string
): ExtractedMetadata => {
  const original = cheerio.load(originalHtml);
  const clean = cheerio.load(cleanedHtml);
  const text = clean.root().text();
  const wordCount = countWords(text);

  const title =
    textFromSelectors(original, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      "title",
      "h1"
    ]) ?? textFromSelectors(clean, ["h1"]);

  const language =
    original("html").attr("lang")?.trim() ??
    textFromSelectors(original, ['meta[property="og:locale"]', 'meta[name="language"]']);

  const author = textFromSelectors(original, [
    'meta[name="author"]',
    'meta[property="article:author"]',
    '[rel="author"]',
    ".author",
    ".byline",
    '[class*="author"]'
  ]);

  const publishedDate = normalizeDate(
    textFromSelectors(original, [
      'meta[property="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="date"]',
      "time[datetime]",
      ".published",
      ".post-date",
      ".entry-date"
    ])
  );

  return {
    title,
    url:
      raw.url ?? textFromSelectors(original, ['meta[property="og:url"]', 'link[rel="canonical"]']),
    language: language?.replace("_", "-") ?? null,
    author,
    publishedDate,
    crawlDate: raw.crawlDate,
    contentHash: sha256(cleanedHtml),
    estimatedReadingTime: Math.max(1, Math.ceil(wordCount / 225)),
    wordCount
  };
};
