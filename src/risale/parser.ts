import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { Logger } from "../config/logger.js";
import { MarkdownConverter } from "../markdown/markdownConverter.js";
import { ensureDir, readJson, readTextFile, writeJson, writeTextFile } from "../utils/fs.js";
import { RISALE_SOURCE } from "./catalog.js";
import type { RisaleParseSummary, RisaleRawPageMetadata } from "./types.js";

const walkHtml = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkHtml(path)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files.sort();
};

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];

export interface ParsedRisalePage {
  readonly cleanedHtml: string;
  readonly markdown: string;
  readonly metadata: {
    readonly knowledgeSource: "risale";
    readonly book: string;
    readonly section: string;
    readonly subsection: string | null;
    readonly canonicalUrl: string;
    readonly url: string;
    readonly language: "tr";
    readonly title: string;
    readonly sourceAttribution: string;
    readonly copyrightNotices: readonly string[];
    readonly fetchedAt: string;
  };
}

export class RisalePageParser {
  private readonly converter = new MarkdownConverter();

  public parse(html: string, raw: RisaleRawPageMetadata): ParsedRisalePage {
    const outer = cheerio.load(html);
    const title = outer("title").first().text().trim();
    const path = title
      .replace(/\s*\(s:\s*\d+\)\s*$/i, "")
      .split("/")
      .map((item) => item.trim());
    const section = path[2];
    if (section === undefined || section.length === 0) {
      throw new Error(`No source section title at ${raw.canonicalUrl}`);
    }
    const subsectionParts = path.slice(3).filter(Boolean);
    const noscriptHtml = outer("noscript").first().html();
    if (noscriptHtml === null)
      throw new Error(`No visible noscript content at ${raw.canonicalUrl}`);
    const nestedStart = noscriptHtml.search(/<html\b/i);
    const contentHtml = nestedStart >= 0 ? noscriptHtml.slice(nestedStart) : noscriptHtml;
    const content = cheerio.load(contentHtml);
    content("script,style,noscript,nav,header,footer,aside,iframe,form").remove();
    content("p.baslik1").each((_, element) => {
      content(element).replaceWith(`<h1>${content(element).html() ?? ""}</h1>`);
    });
    content("span.altBaslik1").each((_, element) => {
      content(element).replaceWith(`<strong>${content(element).html() ?? ""}</strong>`);
    });
    content("*").each((_, element) => {
      for (const attribute of Object.keys((element as Element).attribs ?? {}))
        content(element).removeAttr(attribute);
    });
    const body = content("body").first();
    const cleanedHtml = body.html()?.trim() ?? "";
    if (body.text().replace(/\s+/g, " ").trim().length === 0) {
      throw new Error(`No visible Turkish text at ${raw.canonicalUrl}`);
    }
    const copyrightNotices = unique(
      outer("body *")
        .toArray()
        .filter((element) =>
          /(?:©|copyright|telif hakk|hakları saklı)/i.test(outer(element).text())
        )
        .filter(
          (element) =>
            !outer(element)
              .children()
              .toArray()
              .some((child) =>
                /(?:©|copyright|telif hakk|hakları saklı)/i.test(outer(child).text())
              )
        )
        .map((element) => outer(element).text().replace(/\s+/g, " ").trim())
        .filter(Boolean)
    );
    const markdown = this.converter.convert(cleanedHtml, raw.canonicalUrl);
    return {
      cleanedHtml,
      markdown,
      metadata: {
        knowledgeSource: "risale",
        book: raw.book,
        section,
        subsection: subsectionParts.length === 0 ? null : subsectionParts.join(" / "),
        canonicalUrl: raw.canonicalUrl,
        url: raw.canonicalUrl,
        language: "tr",
        title: path.slice(1).join(" / ") || raw.book,
        sourceAttribution: RISALE_SOURCE.attribution,
        copyrightNotices,
        fetchedAt: raw.fetchedAt
      }
    };
  }
}

export class RisaleParsingPipeline {
  public constructor(
    private readonly dataDir: string,
    private readonly parser: RisalePageParser,
    private readonly logger: Logger
  ) {}

  public async run(): Promise<RisaleParseSummary> {
    const rawDir = join(this.dataDir, "raw");
    const markdownDir = join(this.dataDir, "markdown");
    await ensureDir(markdownDir);
    const files = await walkHtml(rawDir);
    let pagesParsed = 0;
    let failedPages = 0;
    for (const rawPath of files) {
      try {
        const metadataPath = rawPath.replace(/\.html$/i, ".metadata.json");
        const raw = await readJson<RisaleRawPageMetadata>(metadataPath);
        if (raw === null) throw new Error(`Missing raw metadata: ${metadataPath}`);
        const parsed = this.parser.parse(await readTextFile(rawPath), raw);
        const relativePath = relative(rawDir, rawPath).replace(/\.html$/i, ".md");
        const markdownPath = join(markdownDir, relativePath);
        await ensureDir(dirname(markdownPath));
        await writeTextFile(markdownPath, `${parsed.markdown}\n`);
        await writeJson(markdownPath.replace(/\.md$/i, ".metadata.json"), parsed.metadata);
        pagesParsed += 1;
      } catch (error: unknown) {
        failedPages += 1;
        this.logger.error(
          { err: error, rawPath, file: basename(rawPath) },
          "Risale page parse failed"
        );
      }
    }
    return { pagesParsed, failedPages };
  }
}
