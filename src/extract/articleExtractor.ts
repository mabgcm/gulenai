import "../utils/webGlobals.js";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { JSDOM } from "jsdom";

export interface ArticleExtractionResult {
  readonly cleanedHtml: string;
  readonly method: "semantic" | "readability";
}

const boilerplateSelectors = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  "[aria-label*='breadcrumb' i]",
  ".nav",
  ".navbar",
  ".menu",
  ".header",
  ".footer",
  ".sidebar",
  ".cookie",
  ".cookie-banner",
  ".cookie-consent",
  ".advertisement",
  ".advertising",
  ".ad",
  ".ads",
  ".newsletter",
  ".popup",
  ".modal",
  ".social",
  ".share",
  ".comments",
  "#comments",
  ".comment-list",
  ".breadcrumb",
  ".breadcrumbs",
  ".pagination",
  ".pager",
  ".related",
  ".related-posts",
  ".recommended",
  "[class*='cookie' i]",
  "[class*='advert' i]",
  "[class*='newsletter' i]",
  "[class*='popup' i]",
  "[class*='share' i]",
  "[class*='comment' i]",
  "[class*='breadcrumb' i]",
  "[class*='pagination' i]",
  "[class*='related' i]",
  "[id*='cookie' i]",
  "[id*='advert' i]",
  "[id*='newsletter' i]",
  "[id*='popup' i]",
  "[id*='share' i]",
  "[id*='comment' i]",
  "[id*='breadcrumb' i]",
  "[id*='pagination' i]",
  "[id*='related' i]"
] as const;

const semanticSelectors = [
  "article",
  "main",
  ".content",
  ".post",
  ".entry",
  ".article",
  ".post-content",
  ".entry-content",
  ".article-content"
] as const;

const allowedTags = new Set([
  "article",
  "section",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "blockquote",
  "ol",
  "ul",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "code",
  "pre",
  "br",
  "hr",
  "figure",
  "figcaption",
  "span"
]);

const allowedAttributes = new Map<string, ReadonlySet<string>>([
  ["a", new Set(["href", "title"])],
  ["img", new Set(["src", "alt", "title", "width", "height"])],
  ["th", new Set(["colspan", "rowspan"])],
  ["td", new Set(["colspan", "rowspan"])]
]);

const removeBoilerplate = ($: cheerio.CheerioAPI): void => {
  $(boilerplateSelectors.join(",")).remove();
};

const isElement = (node: AnyNode): node is Element => "attribs" in node && "tagName" in node;

const scoreNode = ($: cheerio.CheerioAPI, element: Element): number => {
  const node = $(element);
  const text = node.text().replace(/\s+/g, " ").trim();
  const paragraphCount = node.find("p").length;
  const headingCount = node.find("h1,h2,h3,h4,h5,h6").length;
  const listCount = node.find("ol,ul").length;
  const tableCount = node.find("table").length;
  const linkTextLength = node.find("a").text().replace(/\s+/g, " ").trim().length;
  const linkDensity = text.length === 0 ? 0 : linkTextLength / text.length;

  return (
    text.length +
    paragraphCount * 80 +
    headingCount * 30 +
    listCount * 25 +
    tableCount * 50 -
    linkDensity * 300
  );
};

const selectSemanticArticle = ($: cheerio.CheerioAPI): cheerio.Cheerio<Element> | null => {
  let best: Element | null = null;
  let bestScore = 0;

  for (const selector of semanticSelectors) {
    $(selector).each((_, element) => {
      if (!isElement(element)) {
        return;
      }

      const score = scoreNode($, element);
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    });
  }

  if (best !== null && bestScore >= 100) {
    return $(best);
  }

  return null;
};

const sanitize = ($: cheerio.CheerioAPI): void => {
  $("*").each((_, element) => {
    if (!isElement(element)) {
      return;
    }

    const tagName = element.tagName?.toLowerCase();
    if (tagName === undefined || !allowedTags.has(tagName)) {
      $(element).replaceWith($(element).contents());
      return;
    }

    const allowed = allowedAttributes.get(tagName) ?? new Set<string>();
    for (const attribute of Object.keys(element.attribs ?? {})) {
      if (!allowed.has(attribute.toLowerCase())) {
        $(element).removeAttr(attribute);
      }
    }

    if (tagName === "a") {
      const href = $(element).attr("href");
      if (href !== undefined && /^(javascript|data):/i.test(href)) {
        $(element).removeAttr("href");
      }
    }

    if (tagName === "img") {
      const src = $(element).attr("src");
      if (src !== undefined && /^javascript:/i.test(src)) {
        $(element).removeAttr("src");
      }
    }
  });

  $("p,li,blockquote,td,th,h1,h2,h3,h4,h5,h6").each((_, element) => {
    const normalized = $(element).text().replace(/\s+/g, " ").trim();
    if (normalized.length === 0 && $(element).find("img").length === 0) {
      $(element).remove();
    }
  });
};

const wrapArticle = (innerHtml: string): string => {
  const $ = cheerio.load("<article></article>", null, false);
  $("article").html(innerHtml);
  sanitize($);
  return $.html()
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const readabilityExtract = (html: string, url: string | null): string | null => {
  const dom = new JSDOM(html, { url: url ?? "https://example.invalid/" });
  const readableArticle = new Readability(dom.window.document).parse();
  const content = readableArticle?.content;
  if (content === undefined || content === null || content.trim().length === 0) {
    return null;
  }

  const $ = cheerio.load(content, null, false);
  if (
    readableArticle?.title !== undefined &&
    readableArticle.title !== null &&
    $("h1,h2").length === 0
  ) {
    $.root().prepend(`<h1>${readableArticle.title}</h1>`);
  }

  return wrapArticle($.html());
};

export class ArticleExtractor {
  public extract(html: string, url: string | null): ArticleExtractionResult {
    const $ = cheerio.load(html);
    removeBoilerplate($);

    const semantic = selectSemanticArticle($);
    if (semantic !== null) {
      return {
        cleanedHtml: wrapArticle(semantic.html() ?? semantic.text()),
        method: "semantic"
      };
    }

    const readable = readabilityExtract(html, url);
    if (readable !== null) {
      return { cleanedHtml: readable, method: "readability" };
    }

    const body = $("body").html() ?? $.root().html() ?? "";
    return {
      cleanedHtml: wrapArticle(body),
      method: "readability"
    };
  }
}
