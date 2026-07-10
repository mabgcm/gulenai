import "../utils/webGlobals.js";
import * as cheerio from "cheerio";

export interface ParsedHtmlLinks {
  readonly title: string | null;
  readonly canonicalUrl: string | null;
  readonly links: readonly string[];
}

const bookLandingSelectors = [
  "[class*=book i]",
  "[id*=book i]",
  "[class*=chapter i]",
  "[id*=chapter i]",
  "[class*=kitap i]",
  "[id*=kitap i]",
  "[class*=bolum i]",
  "[id*=bolum i]",
  "[class*=bölüm i]",
  "[id*=bölüm i]",
  ".toc",
  "#toc"
];

const contentSelectors = [
  "article",
  "main",
  "[role=main]",
  ".content",
  "#content",
  ".entry-content",
  ".post-content",
  ".book",
  ".chapters",
  ".toc"
];

const chapterHrefPattern =
  /(?:chapter|article|makale|yazi|yazilar|kitap|bolum|bölüm|\/\d{1,4}[-/])/i;

const unique = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

const linksFrom = ($: cheerio.CheerioAPI, selector: string): readonly string[] =>
  $(selector)
    .find("a[href]")
    .map((_, element) => $(element).attr("href")?.trim() ?? "")
    .get()
    .filter((href) => href.length > 0);

export const parseHtmlLinks = (html: string): ParsedHtmlLinks => {
  const $ = cheerio.load(html);
  const titleText = $("title").first().text().trim();
  const canonicalHref = $('link[rel="canonical"]').first().attr("href")?.trim() ?? null;
  const allLinks = $("a[href]")
    .map((_, element) => $(element).attr("href")?.trim() ?? "")
    .get()
    .filter((href) => href.length > 0);
  const bodyText = $("body").text().slice(0, 5000);
  const isBookLanding =
    bookLandingSelectors.some((selector) => $(selector).length > 0) ||
    /\b(book|chapters?|contents?|kitap|bölüm|bolum|içindekiler)\b/i.test(bodyText);
  const contentLinks = unique(contentSelectors.flatMap((selector) => linksFrom($, selector)));
  const chapterLinks = contentLinks.filter((href) => chapterHrefPattern.test(href));
  const links = isBookLanding && chapterLinks.length > 0 ? chapterLinks : unique(allLinks);

  return {
    title: titleText.length > 0 ? titleText : null,
    canonicalUrl: canonicalHref,
    links
  };
};
