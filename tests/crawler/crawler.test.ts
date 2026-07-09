import { mkdtemp, rm } from "node:fs/promises";
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
    return {
      url,
      finalUrl: url,
      canonicalUrl: null,
      status: 200,
      contentType: "text/html; charset=utf-8",
      html: `<html><head><title>${url}</title></head><body><a href="/two">Two</a></body></html>`,
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

const source: SourceConfig = {
  name: "test",
  seeds: ["https://fgulen.com/one"],
  allowedDomains: ["fgulen.com"],
  includePaths: ["/"],
  excludePaths: [],
  languages: [],
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
    const crawler = new Crawler(source, fetcher, store, logger);

    const result = await crawler.run();

    expect(result.savedPages).toBe(2);
    expect(fetcher.fetched).toEqual(["https://fgulen.com/one", "https://fgulen.com/two"]);
    expect(result.failedPages).toBe(0);
  });
});
