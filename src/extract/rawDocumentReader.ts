import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  mapWithFilesystemConcurrency,
  readTextFile,
  withFilesystemConcurrency
} from "../utils/fs.js";
import type { RawDocument, RawIndexRecord } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRawIndexRecord = (line: string): RawIndexRecord | null => {
  const parsed = JSON.parse(line) as unknown;
  if (!isObject(parsed)) {
    return null;
  }

  if (
    typeof parsed.id !== "string" ||
    typeof parsed.url !== "string" ||
    typeof parsed.finalUrl !== "string" ||
    typeof parsed.status !== "number" ||
    typeof parsed.contentType !== "string" ||
    typeof parsed.fetchedAt !== "string" ||
    typeof parsed.contentHash !== "string" ||
    typeof parsed.rawPath !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.id,
    url: parsed.url,
    finalUrl: parsed.finalUrl,
    canonicalUrl: typeof parsed.canonicalUrl === "string" ? parsed.canonicalUrl : null,
    status: parsed.status,
    contentType: parsed.contentType,
    title: typeof parsed.title === "string" ? parsed.title : null,
    fetchedAt: parsed.fetchedAt,
    contentHash: parsed.contentHash,
    rawPath: parsed.rawPath
  };
};

const walkHtmlFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await withFilesystemConcurrency(() => readdir(directory, { withFileTypes: true }));
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkHtmlFiles(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      files.push(path);
    }
  }

  return files.sort();
};

export class RawDocumentReader {
  public constructor(
    private readonly rawDir = "data/raw",
    private readonly rawIndexPath = "data/crawl/raw-index.jsonl"
  ) {}

  public async readAll(): Promise<readonly RawDocument[]> {
    const index = await this.readIndex();
    const files = await walkHtmlFiles(this.rawDir);

    return mapWithFilesystemConcurrency(files, async (rawPath) => {
      const html = await readTextFile(rawPath);
      const record = index.get(rawPath);
      const relativePath = relative(this.rawDir, rawPath);
      return {
        id: record?.id ?? relativePath.replace(/\.html$/i, ""),
        rawPath,
        relativePath,
        html,
        url: record?.canonicalUrl ?? record?.finalUrl ?? record?.url ?? null,
        crawlDate: record?.fetchedAt ?? null
      };
    });
  }

  private async readIndex(): Promise<ReadonlyMap<string, RawIndexRecord>> {
    try {
      const content = await readTextFile(this.rawIndexPath);
      const records = content
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseRawIndexRecord)
        .filter((record): record is RawIndexRecord => record !== null);

      return new Map(records.map((record) => [record.rawPath, record]));
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }
}
