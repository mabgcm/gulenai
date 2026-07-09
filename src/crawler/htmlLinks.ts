import "../utils/webGlobals.js";
import * as cheerio from "cheerio";

export interface ParsedHtmlLinks {
  readonly title: string | null;
  readonly canonicalUrl: string | null;
  readonly links: readonly string[];
}

export const parseHtmlLinks = (html: string): ParsedHtmlLinks => {
  const $ = cheerio.load(html);
  const titleText = $("title").first().text().trim();
  const canonicalHref = $('link[rel="canonical"]').first().attr("href")?.trim() ?? null;
  const links = $("a[href]")
    .map((_, element) => $(element).attr("href")?.trim() ?? "")
    .get()
    .filter((href) => href.length > 0);

  return {
    title: titleText.length > 0 ? titleText : null,
    canonicalUrl: canonicalHref,
    links
  };
};
