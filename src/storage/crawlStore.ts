import { appendFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { CrawlQualityState } from "../crawlQuality/types.js";
import type { CrawledPage, CrawlFailure, CrawlState, CrawlTarget } from "../types/source.js";
import {
  ensureDir,
  mapWithFilesystemConcurrency,
  readJson,
  withFilesystemConcurrency,
  writeJson,
  writeTextFile
} from "../utils/fs.js";
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
  private readonly qualityPath: string;

  public constructor(private readonly dataDir = "data") {
    this.crawlDir = join(dataDir, "crawl");
    this.rawDir = join(dataDir, "raw");
    this.statePath = join(this.crawlDir, "state.json");
    this.visitedPath = join(this.crawlDir, "visited.txt");
    this.failuresPath = join(this.crawlDir, "failures.json");
    this.rawIndexPath = join(this.crawlDir, "raw-index.jsonl");
    this.qualityPath = join(this.crawlDir, "quality-decisions.json");
  }

  public async init(): Promise<void> {
    await mapWithFilesystemConcurrency([this.crawlDir, this.rawDir], ensureDir);
  }

  public async loadState(): Promise<CrawlState | null> {
    return readJson<CrawlState>(this.statePath);
  }

  public async saveState(state: CrawlState): Promise<void> {
    await writeJson(this.statePath, state);
    await writeTextFile(
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

    await writeTextFile(rawPath, page.html);
    await withFilesystemConcurrency(() =>
      appendFile(this.rawIndexPath, `${JSON.stringify(metadata)}\n`, "utf8")
    );
    return metadata;
  }

  public rawPageIdForUrl(url: string): string {
    return shortHash(url);
  }

  public rawPathForId(id: string): string {
    return join(this.rawDir, `${id}.html`);
  }

  public async removeRawPageById(id: string): Promise<void> {
    await withFilesystemConcurrency(() => unlink(this.rawPathForId(id))).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    });
  }

  public async loadQualityState(): Promise<CrawlQualityState | null> {
    return readJson<CrawlQualityState>(this.qualityPath);
  }

  public async saveQualityState(state: CrawlQualityState): Promise<void> {
    await writeJson(this.qualityPath, state);
  }

  public async reset(): Promise<void> {
    await withFilesystemConcurrency(() => rm(this.dataDir, { recursive: true, force: true }));
    await mapWithFilesystemConcurrency(
      [
        "raw",
        "clean",
        "markdown",
        "chunks",
        "index",
        "embeddings",
        "prompts",
        "answers",
        "crawl"
      ],
      async (directory) => ensureDir(join(this.dataDir, directory))
    );
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
