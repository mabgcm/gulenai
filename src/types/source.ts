export interface SourceConfig {
  readonly name: string;
  readonly seeds: readonly string[];
  readonly allowedDomains: readonly string[];
  readonly includePaths: readonly string[];
  readonly excludePaths: readonly string[];
  readonly languages: readonly string[];
  readonly maxPages: number;
  readonly maxDepth: number;
  readonly concurrency: number;
  readonly retries: number;
  readonly crawlDelayMs: number;
  readonly respectRobots: boolean;
  readonly userAgent: string;
}

export interface CrawlTarget {
  readonly url: string;
  readonly depth: number;
}

export interface CrawledPage {
  readonly url: string;
  readonly finalUrl: string;
  readonly canonicalUrl: string | null;
  readonly status: number;
  readonly contentType: string;
  readonly html: string;
  readonly title: string | null;
  readonly discoveredUrls: readonly string[];
  readonly fetchedAt: string;
}

export interface CrawlFailure {
  readonly url: string;
  readonly depth: number;
  readonly error: string;
  readonly attempts: number;
  readonly failedAt: string;
}

export interface CrawlState {
  readonly queue: readonly CrawlTarget[];
  readonly visited: readonly string[];
  readonly failed: readonly CrawlFailure[];
  readonly savedPages: number;
  readonly updatedAt: string;
}
