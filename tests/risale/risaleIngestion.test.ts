import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MarkdownChunker } from "../../src/chunking/chunker.js";
import type { TokenCounter } from "../../src/chunking/tokenCounter.js";
import { logger } from "../../src/config/logger.js";
import {
  canonicalRisaleUrl,
  parseRisaleCatalog,
  targetsForBooks
} from "../../src/risale/catalog.js";
import { RisaleCrawler, type RisaleHttpClient } from "../../src/risale/crawler.js";
import { RisalePageParser } from "../../src/risale/parser.js";
import type { RisaleRawPageMetadata } from "../../src/risale/types.js";

const catalogHtml = `
  <script>
    var books = [
      {"bookId":1,"name":"Sözler","pageCount":2,"language":{"locale":"tr"}},
      {"bookId":2,"name":"Mektubat","pageCount":1,"language":{"locale":"tr"}}
    ];
  </script>`;

const pageHtml = (section = "Birinci Söz") => `<!doctype html>
  <html><head><title>Risale-i Nur/Sözler/${section}/Alt Bölüm (s:1)</title></head>
  <body><noscript><html><body>
    <p class="baslik1">${section}</p>
    <p class="normal">Birinci özgün paragraf.</p>
    <p class="normal">İkinci özgün paragraf <span anlam="sözlük">metni</span>.</p>
  </body></html></noscript><footer>© eRisale örnek telif hakkı bildirimi.</footer></body></html>`;

const rawMetadata: RisaleRawPageMetadata = {
  knowledgeSource: "risale",
  language: "tr",
  bookId: 1,
  book: "Sözler",
  pageNo: 1,
  canonicalUrl: canonicalRisaleUrl(1, 1),
  fetchedAt: "2026-07-15T00:00:00.000Z",
  rawPath: "raw.html",
  contentHash: "hash"
};

class WordCounter implements TokenCounter {
  public count(text: string): number {
    return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  }
}

describe("Risale ingestion", () => {
  it("discovers every Turkish book and page from the public catalog", () => {
    const books = parseRisaleCatalog(catalogHtml);
    expect(books).toEqual([
      { bookId: 1, name: "Sözler", pageCount: 2 },
      { bookId: 2, name: "Mektubat", pageCount: 1 }
    ]);
    expect(targetsForBooks(books)).toHaveLength(3);
    expect(targetsForBooks(books)[2]?.canonicalUrl).toBe(canonicalRisaleUrl(2, 1));
  });

  it("extracts visible source text and hierarchy without paraphrasing", () => {
    const parsed = new RisalePageParser().parse(pageHtml(), rawMetadata);
    expect(parsed.markdown).toContain("Birinci özgün paragraf.");
    expect(parsed.markdown).toContain("İkinci özgün paragraf metni.");
    expect(parsed.markdown).not.toContain("sözlük");
    expect(parsed.markdown).not.toContain("footer");
    expect(parsed.metadata).toMatchObject({
      knowledgeSource: "risale",
      book: "Sözler",
      section: "Birinci Söz",
      subsection: "Alt Bölüm",
      canonicalUrl: canonicalRisaleUrl(1, 1),
      language: "tr"
    });
    expect(parsed.metadata.copyrightNotices.some((notice) => notice.includes("© eRisale"))).toBe(
      true
    );
  });

  it("preserves Risale metadata on every chunk using the existing chunker", () => {
    const parsed = new RisalePageParser().parse(pageHtml(), rawMetadata);
    const chunks = new MarkdownChunker(
      { targetTokens: 100, maxTokens: 200, overlapTokens: 10 },
      new WordCounter()
    ).chunk({
      markdownPath: "page.md",
      metadataPath: "page.metadata.json",
      relativePath: "book-01/page-0001.md",
      markdown: parsed.markdown,
      metadata: parsed.metadata
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.metadata).toMatchObject({
      knowledgeSource: "risale",
      book: "Sözler",
      section: "Birinci Söz",
      subsection: "Alt Bölüm",
      canonicalUrl: canonicalRisaleUrl(1, 1),
      language: "tr",
      chunkIndex: 0,
      totalChunks: chunks.length
    });
  });

  it("resumes, skips downloaded pages, and stores canonical metadata", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "risale-crawl-"));
    const calls: string[] = [];
    const http: RisaleHttpClient = {
      get: (url) => {
        calls.push(url);
        if (url.endsWith("/robots.txt"))
          return Promise.resolve({ status: 404, contentType: "text/html", body: "not found" });
        if (url.includes("locale=tr") && !url.includes("bookId="))
          return Promise.resolve({ status: 200, contentType: "text/html", body: catalogHtml });
        return Promise.resolve({ status: 200, contentType: "text/html", body: pageHtml() });
      }
    };
    const makeCrawler = () =>
      new RisaleCrawler(
        { dataDir, delayMs: 0, retries: 0, maxPages: 1, userAgent: "test-agent" },
        http,
        logger,
        () => Promise.resolve()
      );
    const first = await makeCrawler().run();
    const second = await makeCrawler().run();
    expect(first.downloadedThisRun).toBe(1);
    expect(second.downloadedThisRun).toBe(1);
    expect(second.skippedPages).toBeGreaterThanOrEqual(1);
    const metadata = JSON.parse(
      await readFile(join(dataDir, "raw", "book-01", "page-0001.metadata.json"), "utf8")
    ) as unknown;
    expect(metadata).toMatchObject({
      knowledgeSource: "risale",
      canonicalUrl: canonicalRisaleUrl(1, 1),
      language: "tr"
    });
    expect(calls.filter((url) => url.endsWith("/robots.txt"))).toHaveLength(2);
  });
});
