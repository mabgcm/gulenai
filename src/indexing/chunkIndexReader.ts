import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  mapWithFilesystemConcurrency,
  readTextFile,
  withFilesystemConcurrency
} from "../utils/fs.js";
import type { ChunkJsonDocument, ChunkJsonMetadata } from "./types.js";

const walkJsonFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await withFilesystemConcurrency(() =>
    readdir(directory, { withFileTypes: true })
  );
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(path);
    }
  }

  return files.sort();
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const parseMetadata = (value: unknown, path: string): ChunkJsonMetadata => {
  if (!isObject(value)) {
    throw new Error(`Invalid chunk metadata in ${path}`);
  }

  if (
    typeof value.id !== "string" ||
    typeof value.sourceFile !== "string" ||
    typeof value.chunkIndex !== "number" ||
    typeof value.totalChunks !== "number" ||
    typeof value.tokenCount !== "number" ||
    typeof value.contentHash !== "string"
  ) {
    throw new Error(`Invalid chunk metadata fields in ${path}`);
  }

  return {
    id: value.id,
    sourceFile: value.sourceFile,
    title: nullableString(value.title),
    url: nullableString(value.url),
    language: nullableString(value.language),
    crawlDate: nullableString(value.crawlDate),
    chunkIndex: value.chunkIndex,
    totalChunks: value.totalChunks,
    tokenCount: value.tokenCount,
    contentHash: value.contentHash,
    knowledgeSource: nullableString(value.knowledgeSource),
    book: nullableString(value.book),
    section: nullableString(value.section),
    subsection: nullableString(value.subsection),
    canonicalUrl: nullableString(value.canonicalUrl),
    sourceAttribution: nullableString(value.sourceAttribution),
    copyrightNotices: Array.isArray(value.copyrightNotices)
      ? value.copyrightNotices.filter((notice): notice is string => typeof notice === "string")
      : []
  };
};

const parseChunkJson = (content: string, path: string): ChunkJsonDocument => {
  const parsed = JSON.parse(content) as unknown;
  if (!isObject(parsed)) {
    throw new Error(`Invalid chunk JSON in ${path}`);
  }

  if (typeof parsed.markdown !== "string" || typeof parsed.plainText !== "string") {
    throw new Error(`Invalid chunk JSON content in ${path}`);
  }

  return {
    metadata: parseMetadata(parsed.metadata, path),
    markdown: parsed.markdown,
    plainText: parsed.plainText
  };
};

export class ChunkIndexReader {
  public constructor(private readonly chunksDir = "data/chunks") {}

  public async readAll(): Promise<readonly ChunkJsonDocument[]> {
    const files = await walkJsonFiles(this.chunksDir);
    return mapWithFilesystemConcurrency(files, async (path) =>
      parseChunkJson(await readTextFile(path), path)
    );
  }
}
