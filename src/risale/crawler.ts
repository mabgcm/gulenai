import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "../config/logger.js";
import { RobotsClient } from "../crawler/robots.js";
import { ensureDir, readJson, writeJson, writeTextFile } from "../utils/fs.js";
import { sha256 } from "../utils/hash.js";
import { sleep } from "../utils/time.js";
import {
  RISALE_CATALOG_SELECTOR,
  RISALE_SOURCE,
  parseRisaleCatalog,
  targetKey,
  targetsForBooks
} from "./catalog.js";
import type {
  RisaleCrawlFailure,
  RisaleCrawlState,
  RisaleCrawlSummary,
  RisalePageTarget,
  RisaleRawPageMetadata
} from "./types.js";

export interface RisaleCrawlerOptions {
  readonly dataDir: string;
  readonly delayMs: number;
  readonly retries: number;
  readonly maxPages: number;
  readonly userAgent: string;
}

export interface RisaleHttpClient {
  get(
    url: string
  ): Promise<{ readonly status: number; readonly contentType: string; readonly body: string }>;
}

const HTTP_TIMEOUT_MS = 30_000;

export class RisaleHttpTimeoutError extends Error {
  public constructor(
    public readonly url: string,
    public readonly elapsedMs: number
  ) {
    super(`HTTP request timed out after ${elapsedMs}ms: ${url}`);
    this.name = "RisaleHttpTimeoutError";
  }
}

export class FetchRisaleHttpClient implements RisaleHttpClient {
  public constructor(
    private readonly userAgent: string,
    private readonly request: typeof fetch = fetch
  ) {}

  public async get(url: string): Promise<{ status: number; contentType: string; body: string }> {
    const startedAt = performance.now();
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new RisaleHttpTimeoutError(url, Math.round(performance.now() - startedAt)));
      }, HTTP_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await this.request(url, {
            headers: { "user-agent": this.userAgent },
            signal: controller.signal
          });
          return {
            status: response.status,
            contentType: response.headers.get("content-type") ?? "",
            body: await response.text()
          };
        })(),
        timeoutPromise
      ]);
    } catch (error: unknown) {
      if (controller.signal.aborted && !(error instanceof RisaleHttpTimeoutError)) {
        throw new RisaleHttpTimeoutError(url, Math.round(performance.now() - startedAt));
      }
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

export class RisaleCrawler {
  private readonly statePath: string;
  private readonly rawDir: string;

  public constructor(
    private readonly options: RisaleCrawlerOptions,
    private readonly http: RisaleHttpClient,
    private readonly logger: Logger,
    private readonly wait: (milliseconds: number) => Promise<void> = sleep
  ) {
    this.statePath = join(options.dataDir, "crawl", "state.json");
    this.rawDir = join(options.dataDir, "raw");
  }

  public async run(): Promise<RisaleCrawlSummary> {
    await ensureDir(dirname(this.statePath));
    await ensureDir(this.rawDir);
    const robots = await new RobotsClient(this.options.userAgent, this.logger, async (url) => {
      const response = await this.requestWithRetries(url, "robots.txt");
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`robots.txt returned HTTP ${response.status}`);
      }
      return response.body;
    }).load(RISALE_SOURCE.origin);
    const delayMs = Math.max(this.options.delayMs, robots.crawlDelayMs ?? 0);

    this.logger.info({ catalogUrl: RISALE_SOURCE.catalogUrl }, "Starting catalog discovery");
    this.logger.info({ catalogUrl: RISALE_SOURCE.catalogUrl }, "Catalog URL");
    const catalogResponse = await this.requestWithRetries(RISALE_SOURCE.catalogUrl, "catalog");
    if (catalogResponse.status !== 200) {
      throw new Error(`eRisale catalog returned HTTP ${catalogResponse.status}`);
    }
    this.logger.info(
      { catalogUrl: RISALE_SOURCE.catalogUrl, htmlSize: catalogResponse.body.length },
      "HTML size"
    );
    this.logger.info(
      { catalogUrl: RISALE_SOURCE.catalogUrl, selector: RISALE_CATALOG_SELECTOR },
      "HTML parse start"
    );
    let books;
    try {
      books = parseRisaleCatalog(catalogResponse.body);
    } catch (error: unknown) {
      this.logger.error(
        {
          catalogUrl: RISALE_SOURCE.catalogUrl,
          htmlPreview: catalogResponse.body.slice(0, 500),
          selector: RISALE_CATALOG_SELECTOR,
          reason: error instanceof Error ? error.message : String(error)
        },
        "Catalog parsing produced zero books"
      );
      throw error;
    }
    this.logger.info({ catalogUrl: RISALE_SOURCE.catalogUrl }, "HTML parse complete");
    this.logger.info({ count: books.length }, "Books discovered");
    const targets = targetsForBooks(books);
    this.logger.info({ url: targets[0]?.canonicalUrl ?? null }, "First discovered book URL");
    this.logger.info(
      { catalogUrl: RISALE_SOURCE.catalogUrl, booksDiscovered: books.length },
      "Catalog discovery complete"
    );
    const previous = await readJson<RisaleCrawlState>(this.statePath);
    const completed = new Set(previous?.completed ?? []);
    let failures: RisaleCrawlFailure[] = [...(previous?.failures ?? [])];
    let downloadedThisRun = 0;
    let skippedPages = 0;
    let attemptedThisRun = 0;

    for (const target of targets) {
      if (this.options.maxPages > 0 && attemptedThisRun >= this.options.maxPages) break;
      if (!robots.isAllowed(target.canonicalUrl)) {
        skippedPages += 1;
        continue;
      }
      const key = targetKey(target);
      const rawPath = this.rawPath(target);
      if (completed.has(key) || (await this.exists(rawPath))) {
        completed.add(key);
        skippedPages += 1;
        continue;
      }

      attemptedThisRun += 1;
      if (delayMs > 0) await this.wait(delayMs);
      try {
        if (attemptedThisRun === 1) {
          this.logger.info({ url: target.canonicalUrl }, "First page request");
        }
        const html = await this.fetchPage(target);
        const metadata: RisaleRawPageMetadata = {
          ...target,
          knowledgeSource: "risale",
          language: "tr",
          fetchedAt: new Date().toISOString(),
          rawPath,
          contentHash: sha256(html)
        };
        await ensureDir(dirname(rawPath));
        await writeTextFile(rawPath, html);
        await writeJson(rawPath.replace(/\.html$/i, ".metadata.json"), metadata);
        completed.add(key);
        failures = failures.filter((failure) => targetKey(failure) !== key);
        downloadedThisRun += 1;
      } catch (error: unknown) {
        failures = failures.filter((failure) => targetKey(failure) !== key);
        failures.push({
          ...target,
          error: error instanceof Error ? error.message : String(error),
          attempts: this.options.retries + 1,
          failedAt: new Date().toISOString()
        });
      }
      await this.saveState(books, completed, failures);
    }

    await this.saveState(books, completed, failures);
    return {
      booksDiscovered: books.length,
      pagesDiscovered: targets.length,
      pagesDownloaded: completed.size,
      downloadedThisRun,
      skippedPages,
      failedPages: failures.length
    };
  }

  private async fetchPage(target: RisalePageTarget): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      try {
        const response = await this.request(target.canonicalUrl, "page", attempt + 1);
        if (response.status !== 200 || !response.contentType.includes("text/html")) {
          throw new Error(`HTTP ${response.status} (${response.contentType})`);
        }
        return response.body;
      } catch (error: unknown) {
        lastError = error;
        if (error instanceof RisaleHttpTimeoutError) {
          this.logger.warn(
            { url: error.url, elapsedMs: error.elapsedMs, attempt: attempt + 1 },
            "HTTP request timed out; applying retry policy"
          );
        }
        if (attempt < this.options.retries) await this.wait(500 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async request(
    url: string,
    stage: string,
    attempt = 1
  ): ReturnType<RisaleHttpClient["get"]> {
    const startedAt = performance.now();
    this.logger.info({ url, stage, attempt }, "HTTP request start");
    try {
      const response = await this.http.get(url);
      this.logger.info(
        {
          url,
          stage,
          attempt,
          status: response.status,
          elapsedMs: Math.round(performance.now() - startedAt)
        },
        "HTTP response received"
      );
      return response;
    } catch (error: unknown) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      this.logger.warn({ url, stage, attempt, elapsedMs, err: error }, "HTTP request failed");
      throw error;
    }
  }

  private async requestWithRetries(
    url: string,
    stage: string
  ): ReturnType<RisaleHttpClient["get"]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      try {
        return await this.request(url, stage, attempt + 1);
      } catch (error: unknown) {
        lastError = error;
        if (error instanceof RisaleHttpTimeoutError) {
          this.logger.warn(
            { url: error.url, elapsedMs: error.elapsedMs, attempt: attempt + 1 },
            "HTTP request timed out; applying retry policy"
          );
        }
        if (attempt < this.options.retries) await this.wait(500 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private rawPath(target: RisalePageTarget): string {
    return join(
      this.rawDir,
      `book-${String(target.bookId).padStart(2, "0")}`,
      `page-${String(target.pageNo).padStart(4, "0")}.html`
    );
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async saveState(
    books: RisaleCrawlState["books"],
    completed: ReadonlySet<string>,
    failures: readonly RisaleCrawlFailure[]
  ): Promise<void> {
    await writeJson(this.statePath, {
      books,
      completed: [...completed].sort(),
      failures,
      updatedAt: new Date().toISOString()
    } satisfies RisaleCrawlState);
  }
}
