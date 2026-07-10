import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  mapWithFilesystemConcurrency,
  readTextFile,
  withFilesystemConcurrency
} from "../utils/fs.js";
import type { ChunkJsonForEmbedding } from "./types.js";

const walkJsonFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await withFilesystemConcurrency(() => readdir(directory, { withFileTypes: true }));
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

const parseChunk = (content: string, path: string): ChunkJsonForEmbedding => {
  const parsed = JSON.parse(content) as unknown;
  if (!isObject(parsed) || !isObject(parsed.metadata)) {
    throw new Error(`Invalid chunk JSON in ${path}`);
  }

  if (
    typeof parsed.metadata.id !== "string" ||
    typeof parsed.metadata.contentHash !== "string" ||
    typeof parsed.metadata.sourceFile !== "string" ||
    typeof parsed.markdown !== "string" ||
    typeof parsed.plainText !== "string"
  ) {
    throw new Error(`Invalid chunk JSON fields in ${path}`);
  }

  return {
    metadata: {
      id: parsed.metadata.id,
      contentHash: parsed.metadata.contentHash,
      sourceFile: parsed.metadata.sourceFile
    },
    markdown: parsed.markdown,
    plainText: parsed.plainText
  };
};

export class ChunkPayloadReader {
  public constructor(private readonly chunksDir = "data/chunks") {}

  public async readById(): Promise<ReadonlyMap<string, ChunkJsonForEmbedding>> {
    const files = await walkJsonFiles(this.chunksDir);
    const entries = await mapWithFilesystemConcurrency(files, async (path) => {
      const chunk = parseChunk(await readTextFile(path), path);
      return [chunk.metadata.id, chunk] as const;
    });

    return new Map(entries);
  }
}
