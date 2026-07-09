import { appendFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CrawledPage, CrawlFailure, CrawlState, CrawlTarget } from "../types/source.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import { sha256, shortHash } from "../utils/hash.js";

export interface SavedRawPageMetadata {
  readonly id: string;
  readonly url: string;
  readonly finalUrl: string;
  readonly canonicalUrl: string | null;
  readonly status: number;
  readonly contentType: string;
  readonly title: string | null;
  readonly fetchedAt: string;
  readonly contentHash: string;
  readonly rawPath: string;
}

export class CrawlStore {
  private readonly crawlDir: string;
  private readonly rawDir: string;
  private readonly statePath: string;
  private readonly visitedPath: string;
  private readonly failuresPath: string;
  private readonly rawIndexPath: string;

  public constructor(private readonly dataDir = "data") {
    this.crawlDir = join(dataDir, "crawl");
    this.rawDir = join(dataDir, "raw");
    this.statePath = join(this.crawlDir, "state.json");
    this.visitedPath = join(this.crawlDir, "visited.txt");
    this.failuresPath = join(this.crawlDir, "failures.json");
    this.rawIndexPath = join(this.crawlDir, "raw-index.jsonl");
  }

  public async init(): Promise<void> {
    await Promise.all([ensureDir(this.crawlDir), ensureDir(this.rawDir)]);
  }

  public async loadState(): Promise<CrawlState | null> {
    return readJson<CrawlState>(this.statePath);
  }

  public async saveState(state: CrawlState): Promise<void> {
    await writeJson(this.statePath, state);
    await writeFile(
      this.visitedPath,
      `${state.visited.join("\n")}${state.visited.length ? "\n" : ""}`
    );
    await writeJson(this.failuresPath, state.failed);
  }

  public async saveRawPage(page: CrawledPage): Promise<SavedRawPageMetadata> {
    await this.init();
    const id = shortHash(page.canonicalUrl ?? page.finalUrl);
    const rawPath = join(this.rawDir, `${id}.html`);
    const metadata: SavedRawPageMetadata = {
      id,
      url: page.url,
      finalUrl: page.finalUrl,
      canonicalUrl: page.canonicalUrl,
      status: page.status,
      contentType: page.contentType,
      title: page.title,
      fetchedAt: page.fetchedAt,
      contentHash: sha256(page.html),
      rawPath
    };

    await writeFile(rawPath, page.html, "utf8");
    await appendFile(this.rawIndexPath, `${JSON.stringify(metadata)}\n`, "utf8");
    return metadata;
  }

  public async reset(): Promise<void> {
    await rm(this.dataDir, { recursive: true, force: true });
    await Promise.all([
      ensureDir(join(this.dataDir, "raw")),
      ensureDir(join(this.dataDir, "clean")),
      ensureDir(join(this.dataDir, "markdown")),
      ensureDir(join(this.dataDir, "chunks")),
      ensureDir(join(this.dataDir, "crawl"))
    ]);
  }

  public buildState(
    queue: readonly CrawlTarget[],
    visited: ReadonlySet<string>,
    failed: readonly CrawlFailure[],
    savedPages: number
  ): CrawlState {
    return {
      queue,
      visited: [...visited].sort(),
      failed,
      savedPages,
      updatedAt: new Date().toISOString()
    };
  }
}
