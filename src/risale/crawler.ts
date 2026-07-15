import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "../config/logger.js";
import { RobotsClient } from "../crawler/robots.js";
import { ensureDir, readJson, writeJson, writeTextFile } from "../utils/fs.js";
import { sha256 } from "../utils/hash.js";
import { sleep } from "../utils/time.js";
import { RISALE_SOURCE, parseRisaleCatalog, targetKey, targetsForBooks } from "./catalog.js";
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

export class FetchRisaleHttpClient implements RisaleHttpClient {
  public constructor(private readonly userAgent: string) {}

  public async get(url: string): Promise<{ status: number; contentType: string; body: string }> {
    const response = await fetch(url, { headers: { "user-agent": this.userAgent } });
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: await response.text()
    };
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
    const catalogResponse = await this.http.get(RISALE_SOURCE.catalogUrl);
    if (catalogResponse.status !== 200) {
      throw new Error(`eRisale catalog returned HTTP ${catalogResponse.status}`);
    }
    const books = parseRisaleCatalog(catalogResponse.body);
    const targets = targetsForBooks(books);
    const previous = await readJson<RisaleCrawlState>(this.statePath);
    const completed = new Set(previous?.completed ?? []);
    let failures: RisaleCrawlFailure[] = [...(previous?.failures ?? [])];
    let downloadedThisRun = 0;
    let skippedPages = 0;
    let attemptedThisRun = 0;

    const robots = await new RobotsClient(this.options.userAgent, this.logger, async (url) => {
      const response = await this.http.get(url);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`robots.txt returned HTTP ${response.status}`);
      }
      return response.body;
    }).load(RISALE_SOURCE.origin);
    const delayMs = Math.max(this.options.delayMs, robots.crawlDelayMs ?? 0);

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
        const response = await this.http.get(target.canonicalUrl);
        if (response.status !== 200 || !response.contentType.includes("text/html")) {
          throw new Error(`HTTP ${response.status} (${response.contentType})`);
        }
        return response.body;
      } catch (error: unknown) {
        lastError = error;
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
