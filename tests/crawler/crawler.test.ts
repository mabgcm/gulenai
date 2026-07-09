import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { Crawler } from "../../src/crawler/crawler.js";
import type { Fetcher } from "../../src/crawler/fetcher.js";
import { CrawlStore } from "../../src/storage/crawlStore.js";
import type { CrawledPage, SourceConfig } from "../../src/types/source.js";

class MockFetcher implements Fetcher {
  public readonly fetched: string[] = [];

  public async fetchPage(url: string): Promise<CrawledPage> {
    await Promise.resolve();
    this.fetched.push(url);
    const links = url.endsWith("/one") ? ["/two", "https://outside.test/nope"] : [];
    const prefix = url.endsWith("/one") ? "knowledge" : "wisdom";
    const paragraph = Array.from({ length: 130 }, (_, index) => `${prefix}${index}`).join(" ");
    return {
      url,
      finalUrl: url,
      canonicalUrl: null,
      status: 200,
      contentType: "text/html; charset=utf-8",
      html: `<html><head><title>${url}</title></head><body><article><h1>${url}</h1><p>${paragraph}</p><a href="/two">Two</a></article></body></html>`,
      title: url,
      discoveredUrls: links,
      fetchedAt: new Date("2026-01-01T00:00:00.000Z").toISOString()
    };
  }

  public async fetchText(url: string): Promise<string> {
    await Promise.resolve();
    if (url.endsWith("/robots.txt")) {
      return "User-agent: *\nAllow: /\n";
    }
    return "<urlset></urlset>";
  }

  public async close(): Promise<void> {}
}

class CategoryFirstFetcher implements Fetcher {
  public readonly fetched: string[] = [];

  public async fetchPage(url: string): Promise<CrawledPage> {
    await Promise.resolve();
    this.fetched.push(url);
    const articleText = Array.from({ length: 160 }, (_, index) => `article${index}`).join(" ");
    const isCategory = url.endsWith("/tr");
    return {
      url,
      finalUrl: url,
      canonicalUrl: null,
      status: 200,
      contentType: "text/html",
      html: isCategory
        ? `<html><body><main><h1>List of articles in category</h1><a href="/tr/article">Article</a><a href="/tr/other">Other</a></main></body></html>`
        : `<html><body><article><h1>Article</h1><p>${articleText}</p></article></body></html>`,
      title: isCategory ? "Category" : "Article",
      discoveredUrls: isCategory ? ["/tr/article"] : [],
      fetchedAt: "2026-01-01T00:00:00.000Z"
    };
  }

  public async fetchText(): Promise<string> {
    await Promise.resolve();
    return "User-agent: *\nAllow: /\n";
  }

  public async close(): Promise<void> {}
}

const source: SourceConfig = {
  name: "test",
  seeds: ["https://fgulen.com/one"],
  allowedDomains: ["fgulen.com"],
  includePaths: ["/"],
  excludePaths: [],
  includePatterns: [],
  excludePatterns: [],
  languages: [],
  qualityThreshold: 0,
  minWordCount: 1,
  duplicateSimHashDistance: 3,
  maxPages: 5,
  maxDepth: 1,
  concurrency: 1,
  retries: 0,
  crawlDelayMs: 0,
  respectRobots: true,
  userAgent: "test"
};

describe("Crawler", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("crawls breadth-first, persists state, and filters outside domains", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-crawler-"));
    const fetcher = new MockFetcher();
    const store = new CrawlStore(tempDir);
    const logger = pino({ enabled: false });
    const crawler = new Crawler(source, fetcher, store, logger, join(tempDir, "reports"));

    const result = await crawler.run();

    expect(result.savedPages).toBe(2);
    expect(fetcher.fetched).toEqual(["https://fgulen.com/one", "https://fgulen.com/two"]);
    expect(result.failedPages).toBe(0);
  });

  it("does not save category pages but still follows their links", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gulenai-crawler-"));
    const fetcher = new CategoryFirstFetcher();
    const store = new CrawlStore(tempDir);
    const logger = pino({ enabled: false });
    const crawler = new Crawler(
      {
        ...source,
        seeds: ["https://fgulen.com/tr"],
        languages: ["tr"],
        maxPages: 1,
        maxDepth: 1
      },
      fetcher,
      store,
      logger,
      join(tempDir, "reports")
    );

    const result = await crawler.run();
    const rawFiles = await readdir(join(tempDir, "raw"));

    expect(fetcher.fetched).toEqual(["https://fgulen.com/tr", "https://fgulen.com/tr/article"]);
    expect(result.savedPages).toBe(1);
    expect(rawFiles.filter((file) => file.endsWith(".html"))).toHaveLength(1);
  });
});
