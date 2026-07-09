import type { Logger } from "../config/logger.js";
import type { CrawlStore } from "../storage/crawlStore.js";
import type { CrawledPage, CrawlFailure, CrawlTarget, SourceConfig } from "../types/source.js";
import { sleep } from "../utils/time.js";
import type { Fetcher } from "./fetcher.js";
import { RobotsClient, type RobotsRules } from "./robots.js";
import { SitemapClient } from "./sitemap.js";
import { UrlPolicy } from "./urlPolicy.js";

export interface CrawlResult {
  readonly savedPages: number;
  readonly visitedPages: number;
  readonly failedPages: number;
  readonly queuedPages: number;
}

export class Crawler {
  private readonly policy: UrlPolicy;
  private readonly failures: CrawlFailure[] = [];
  private readonly visited = new Set<string>();
  private readonly queued = new Set<string>();
  private queue: CrawlTarget[] = [];
  private savedPages = 0;
  private robots: RobotsRules | null = null;
  private lastRequestAt = 0;

  public constructor(
    private readonly source: SourceConfig,
    private readonly fetcher: Fetcher,
    private readonly store: CrawlStore,
    private readonly logger: Logger
  ) {
    this.policy = new UrlPolicy(source);
  }

  public async run(): Promise<CrawlResult> {
    await this.store.init();
    await this.restoreOrSeedQueue();
    await this.loadRobotsAndSitemaps();

    this.logger.info(
      {
        source: this.source.name,
        queue: this.queue.length,
        visited: this.visited.size,
        maxPages: this.source.maxPages,
        maxDepth: this.source.maxDepth,
        concurrency: this.source.concurrency
      },
      "Starting crawl"
    );

    const workers = Array.from({ length: this.source.concurrency }, (_, index) =>
      this.worker(index + 1)
    );
    await Promise.all(workers);
    await this.persistState();

    return {
      savedPages: this.savedPages,
      visitedPages: this.visited.size,
      failedPages: this.failures.length,
      queuedPages: this.queue.length
    };
  }

  private async restoreOrSeedQueue(): Promise<void> {
    const state = await this.store.loadState();
    if (state !== null && state.queue.length > 0) {
      this.queue = [...state.queue];
      for (const item of state.queue) {
        this.queued.add(item.url);
      }
      for (const item of state.visited) {
        this.visited.add(item);
      }
      this.failures.push(...state.failed);
      this.savedPages = state.savedPages;
      return;
    }

    for (const seed of this.source.seeds) {
      const normalized = this.policy.normalize(seed);
      if (normalized !== null && this.policy.isAllowed(normalized, 0)) {
        this.enqueue({ url: normalized, depth: 0 });
      }
    }
  }

  private async loadRobotsAndSitemaps(): Promise<void> {
    const firstSeed = this.source.seeds[0];
    if (firstSeed === undefined) {
      throw new Error("At least one crawl seed is required");
    }

    const origin = new URL(firstSeed).origin;
    const robotsClient = new RobotsClient(this.source.userAgent, this.logger, (url) =>
      this.fetcher.fetchText(url)
    );
    this.robots = this.source.respectRobots
      ? await robotsClient.load(origin)
      : { sitemaps: [], crawlDelayMs: null, isAllowed: () => true };

    const sitemapClient = new SitemapClient(this.logger, (url) => this.fetcher.fetchText(url));
    const sitemapUrls = await sitemapClient.discover(origin, this.robots.sitemaps);
    for (const sitemapUrl of sitemapUrls) {
      const normalized = this.policy.normalize(sitemapUrl);
      if (normalized !== null && this.policy.isAllowed(normalized, 0)) {
        this.enqueue({ url: normalized, depth: 0 });
      }
    }

    if (sitemapUrls.length > 0) {
      this.logger.info({ discovered: sitemapUrls.length }, "Added sitemap URLs to crawl queue");
    }
  }

  private async worker(workerId: number): Promise<void> {
    while (this.savedPages < this.source.maxPages) {
      const target = this.dequeue();
      if (target === null) {
        return;
      }

      if (this.visited.has(target.url)) {
        continue;
      }

      if (!this.canFetch(target.url)) {
        this.visited.add(target.url);
        continue;
      }

      this.visited.add(target.url);
      await this.waitForCrawlDelay();

      try {
        const page = await this.fetchWithRetry(target);
        await this.handlePage(page, target.depth);
        this.logger.info({ workerId, url: target.url, status: page.status }, "Crawled page");
      } catch (error: unknown) {
        const failure: CrawlFailure = {
          url: target.url,
          depth: target.depth,
          error: error instanceof Error ? error.message : String(error),
          attempts: this.source.retries + 1,
          failedAt: new Date().toISOString()
        };
        this.failures.push(failure);
        this.logger.warn({ workerId, failure }, "Page crawl failed");
      }

      await this.persistState();
    }
  }

  private dequeue(): CrawlTarget | null {
    const item = this.queue.shift();
    if (item === undefined) {
      return null;
    }

    return item;
  }

  private enqueue(target: CrawlTarget): void {
    if (this.queued.has(target.url) || this.visited.has(target.url)) {
      return;
    }

    if (!this.policy.isAllowed(target.url, target.depth)) {
      return;
    }

    this.queued.add(target.url);
    this.queue.push(target);
  }

  private canFetch(url: string): boolean {
    if (this.robots === null) {
      return true;
    }

    return this.robots.isAllowed(url);
  }

  private async waitForCrawlDelay(): Promise<void> {
    const robotsDelay = this.robots?.crawlDelayMs ?? 0;
    const delayMs = Math.max(this.source.crawlDelayMs, robotsDelay);
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = Math.max(0, delayMs - elapsed);
    await sleep(waitMs);
    this.lastRequestAt = Date.now();
  }

  private async fetchWithRetry(target: CrawlTarget): Promise<CrawledPage> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.source.retries; attempt += 1) {
      try {
        return await this.fetcher.fetchPage(target.url);
      } catch (error: unknown) {
        lastError = error;
        const backoffMs = 500 * (attempt + 1);
        this.logger.warn(
          {
            url: target.url,
            attempt: attempt + 1,
            maxAttempts: this.source.retries + 1,
            err: error
          },
          "Fetch attempt failed"
        );
        await sleep(backoffMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async handlePage(page: CrawledPage, depth: number): Promise<void> {
    const canonical =
      page.canonicalUrl === null ? null : this.policy.normalize(page.canonicalUrl, page.finalUrl);
    const canonicalOrFinal = canonical ?? this.policy.normalize(page.finalUrl) ?? page.finalUrl;

    if (canonicalOrFinal !== page.url && this.visited.has(canonicalOrFinal)) {
      return;
    }

    this.visited.add(canonicalOrFinal);

    if (page.status >= 200 && page.status < 300 && page.contentType.includes("text/html")) {
      await this.store.saveRawPage({ ...page, canonicalUrl: canonical });
      this.savedPages += 1;
    }

    if (depth >= this.source.maxDepth) {
      return;
    }

    for (const href of page.discoveredUrls) {
      const normalized = this.policy.normalize(href, page.finalUrl);
      if (normalized !== null) {
        this.enqueue({ url: normalized, depth: depth + 1 });
      }
    }
  }

  private async persistState(): Promise<void> {
    const state = this.store.buildState(this.queue, this.visited, this.failures, this.savedPages);
    await this.store.saveState(state);
  }
}
