import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChunkContent, SearchHitPayload } from "./types.js";

const walkJsonFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
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

const parseMetadata = (value: unknown, path: string): SearchHitPayload => {
  if (!isObject(value)) {
    throw new Error(`Invalid chunk metadata in ${path}`);
  }
  if (
    typeof value.id !== "string" ||
    typeof value.sourceFile !== "string" ||
    !Array.isArray(value.headingPath) ||
    !value.headingPath.every((item) => typeof item === "string") ||
    typeof value.chunkIndex !== "number" ||
    typeof value.totalChunks !== "number" ||
    typeof value.tokenCount !== "number" ||
    typeof value.contentHash !== "string"
  ) {
    throw new Error(`Invalid chunk metadata fields in ${path}`);
  }

  return {
    chunkId: value.id,
    documentId: typeof value.documentId === "string" ? value.documentId : "",
    url: nullableString(value.url),
    title: nullableString(value.title),
    language: nullableString(value.language),
    headingPath: value.headingPath,
    chunkIndex: value.chunkIndex,
    totalChunks: value.totalChunks,
    tokenCount: value.tokenCount,
    contentHash: value.contentHash,
    sourceFile: value.sourceFile
  };
};

const parseChunk = (content: string, path: string): ChunkContent => {
  const parsed = JSON.parse(content) as unknown;
  if (!isObject(parsed) || typeof parsed.markdown !== "string") {
    throw new Error(`Invalid chunk JSON in ${path}`);
  }
  const metadata = parseMetadata(parsed.metadata, path);
  return { chunkId: metadata.chunkId, markdown: parsed.markdown, metadata };
};

export class ChunkContentStore {
  public constructor(private readonly chunksDir = "data/chunks") {}

  public async readByChunkId(): Promise<ReadonlyMap<string, ChunkContent>> {
    const files = await walkJsonFiles(this.chunksDir);
    const entries = await Promise.all(
      files.map(async (path) => {
        const chunk = parseChunk(await readFile(path, "utf8"), path);
        return [chunk.chunkId, chunk] as const;
      })
    );
    return new Map(entries);
  }
}
