import "../utils/webGlobals.js";
import * as cheerio from "cheerio";

const invisibleSelectors = [
  "[hidden]",
  "[aria-hidden='true']",
  "[style*='display:none' i]",
  "[style*='display: none' i]",
  "[style*='visibility:hidden' i]",
  "[style*='visibility: hidden' i]",
  "script",
  "style",
  "noscript"
] as const;

const normalizeUrl = (value: string, baseUrl: string | null): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || /^(mailto|tel|#)/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = baseUrl === null ? new URL(trimmed) : new URL(trimmed, baseUrl);
    url.hash = url.hash.trim();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return trimmed;
  }
};

const normalizeHeadings = ($: cheerio.CheerioAPI): void => {
  let previousLevel = 0;

  $("h1,h2,h3,h4,h5,h6").each((_, element) => {
    const current = Number.parseInt(element.tagName.slice(1), 10);
    const normalized = previousLevel === 0 ? 1 : Math.min(current, previousLevel + 1);

    if (current !== normalized) {
      const replacement = $(`<h${normalized}></h${normalized}>`);
      replacement.html($(element).html() ?? "");
      $(element).replaceWith(replacement);
    }

    previousLevel = normalized;
  });
};

const removeEmptyElements = ($: cheerio.CheerioAPI): void => {
  let removed = true;

  while (removed) {
    removed = false;
    $("p,span,div,section,article,blockquote,li,strong,em,b,i").each((_, element) => {
      const node = $(element);
      const hasMedia = node.find("img,table,hr,ul,ol").length > 0;
      const text = node.text().replace(/\s+/g, " ").trim();
      if (!hasMedia && text.length === 0) {
        node.remove();
        removed = true;
      }
    });
  }
};

export const preprocessHtmlForMarkdown = (html: string, baseUrl: string | null): string => {
  const $ = cheerio.load(html.normalize("NFC"), null, false);
  $(invisibleSelectors.join(",")).remove();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (href !== undefined) {
      $(element).attr("href", normalizeUrl(href, baseUrl));
    }
  });

  $("img[src]").each((_, element) => {
    const src = $(element).attr("src");
    if (src !== undefined) {
      $(element).attr("src", normalizeUrl(src, baseUrl));
    }
  });

  normalizeHeadings($);
  removeEmptyElements($);

  return $.html();
};
