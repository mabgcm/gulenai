import * as cheerio from "cheerio";
import { OpenAiTokenCounter } from "../chunking/tokenCounter.js";
import { sha256 } from "../utils/hash.js";
import { simHash, tokenizeForSimilarity } from "./simHash.js";
import type { CrawlQualityAnalysis, PageClassification } from "./types.js";

export interface ContentQualityConfig {
  readonly qualityThreshold: number;
  readonly minWordCount: number;
}

const BOILERPLATE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  ".nav",
  ".navbar",
  ".menu",
  ".sidebar",
  ".breadcrumb",
  ".breadcrumbs",
  ".pagination",
  ".related",
  ".tagcloud",
  ".share",
  ".social",
  ".language",
  ".lang",
  ".cookie",
  ".newsletter",
  ".ads",
  ".advertisement"
];

const CATEGORY_URL_PATTERN =
  /(?:^|\/)(category|categories|tag|tags|archive|archives|author|authors|topics?|index)(?:\/|$)/i;
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const countWords = (text: string): number => text.match(TOKEN_PATTERN)?.length ?? 0;

const normalizeText = (text: string): string =>
  text.toLocaleLowerCase("tr").normalize("NFKC").replace(/\s+/g, " ").trim();

const duplicatePercentage = (tokens: readonly string[]): number => {
  if (tokens.length === 0) {
    return 0;
  }

  const unique = new Set(tokens);
  return clamp(((tokens.length - unique.size) / tokens.length) * 100, 0, 100);
};

const textFor = ($: cheerio.CheerioAPI, selector: string): string =>
  $(selector)
    .toArray()
    .map((item) => $(item).text())
    .join(" ");

const classifyPage = (
  url: string,
  title: string | null,
  wordCount: number,
  linkDensity: number,
  navigationRatio: number,
  headingDensity: number,
  imageCount: number,
  classificationHints: readonly string[]
): PageClassification => {
  const haystack = `${url} ${title ?? ""} ${classificationHints.join(" ")}`.toLocaleLowerCase("tr");

  if (/\/(?:[a-z]{2}|[a-z]{2}-[a-z]{2})\/?$/i.test(new URL(url).pathname)) {
    return "language-selector";
  }
  if (/(tag|etiket)/i.test(haystack)) {
    return "tag";
  }
  if (/(archive|arsiv|arkiv)/i.test(haystack) || CATEGORY_URL_PATTERN.test(url)) {
    return "archive";
  }
  if (
    /(category|kategori|list of articles in category)/i.test(haystack) &&
    (wordCount < 800 || linkDensity > 15 || headingDensity > 10)
  ) {
    return "category";
  }
  if (
    /(table of contents|contents|içindekiler|list of articles)/i.test(haystack) &&
    (wordCount < 800 || linkDensity > 15 || headingDensity > 10)
  ) {
    return "table-of-contents";
  }
  if (/(author|yazar|shkruar nga)/i.test(haystack) && wordCount < 300) {
    return "author-listing";
  }
  if (imageCount >= 8 && wordCount < 250) {
    return "image-gallery";
  }
  if (navigationRatio > 45 || (linkDensity > 18 && wordCount < 450)) {
    return "navigation";
  }
  if (wordCount < 100 || headingDensity > 18) {
    return "low-quality";
  }
  return "article";
};

export class ContentQualityAnalyzer {
  private readonly tokenCounter = new OpenAiTokenCounter();

  public constructor(private readonly config: ContentQualityConfig) {}

  public analyze(url: string, html: string, title: string | null): CrawlQualityAnalysis {
    const $ = cheerio.load(html);
    $("script,style,noscript,template,svg").remove();

    const bodyText = normalizeText($("body").text());
    const bodyWordCount = countWords(bodyText);
    const mainText = normalizeText(
      $("article,main,.content,.post,.entry,.article").first().text() || bodyText
    );
    const wordCount = countWords(mainText);
    const tokenCount = this.tokenCounter.count(mainText);
    const linkCount = $("a[href]").length;
    const headingCount = $("h1,h2,h3,h4,h5,h6").length;
    const imageCount = $("img").length;
    const listItemCount = $("li").length;
    const tableRowCount = $("tr").length;
    const boilerplateText = normalizeText(
      BOILERPLATE_SELECTORS.map((selector) => textFor($, selector)).join(" ")
    );
    const linkText = normalizeText(
      $("a")
        .toArray()
        .map((item) => $(item).text())
        .join(" ")
    );

    const textDensity =
      html.length === 0 ? 0 : clamp((mainText.length / html.length) * 100, 0, 100);
    const headingDensity = wordCount === 0 ? 0 : clamp((headingCount / wordCount) * 1000, 0, 100);
    const navigationRatio =
      bodyWordCount === 0 ? 0 : clamp((countWords(linkText) / bodyWordCount) * 100, 0, 100);
    const linkDensity = wordCount === 0 ? 0 : clamp((linkCount / wordCount) * 100, 0, 100);
    const boilerplateRatio =
      bodyWordCount === 0
        ? 0
        : clamp((countWords(boilerplateText) / Math.max(1, bodyWordCount)) * 100, 0, 100);
    const tokens = tokenizeForSimilarity(mainText);
    const duplicate = duplicatePercentage(tokens);
    const classification = classifyPage(
      url,
      title,
      wordCount,
      linkDensity,
      navigationRatio,
      headingDensity,
      imageCount,
      [
        $("h1,h2,h3").text(),
        $(".category,.tag,.tags,.archive,.breadcrumb,.pagination").text(),
        listItemCount > 20 || tableRowCount > 12 ? "list of articles in category" : ""
      ]
    );

    const wordScore = clamp((wordCount / Math.max(1, this.config.minWordCount)) * 35, 0, 35);
    const densityScore = clamp(textDensity * 0.2, 0, 20);
    const structureScore = classification === "article" ? 15 : 0;
    const penalty =
      navigationRatio * 0.18 + linkDensity * 0.25 + boilerplateRatio * 0.22 + duplicate * 0.05;
    const qualityScore = Math.round(
      clamp(wordScore + densityScore + structureScore + 30 - penalty, 0, 100)
    );

    const nonIndexableClassifications = new Set<PageClassification>([
      "category",
      "tag",
      "archive",
      "table-of-contents",
      "index",
      "language-selector",
      "image-gallery",
      "author-listing",
      "navigation",
      "low-quality"
    ]);
    const indexable =
      !nonIndexableClassifications.has(classification) &&
      wordCount >= this.config.minWordCount &&
      qualityScore >= this.config.qualityThreshold;
    const reason = indexable
      ? "quality threshold passed"
      : classification !== "article"
        ? `classified as ${classification}`
        : `quality score ${qualityScore} below threshold ${this.config.qualityThreshold}`;

    return {
      url,
      title,
      language: new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? null,
      classification,
      qualityScore,
      indexable,
      reason,
      normalizedTextHash: sha256(mainText),
      simHash: simHash(tokens),
      metrics: {
        wordCount,
        tokenCount,
        textDensity: Math.round(textDensity * 100) / 100,
        headingDensity: Math.round(headingDensity * 100) / 100,
        navigationRatio: Math.round(navigationRatio * 100) / 100,
        linkCount,
        linkDensity: Math.round(linkDensity * 100) / 100,
        duplicatePercentage: Math.round(duplicate * 100) / 100,
        boilerplateRatio: Math.round(boilerplateRatio * 100) / 100
      }
    };
  }
}
