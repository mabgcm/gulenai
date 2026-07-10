import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  mapWithFilesystemConcurrency,
  readTextFile,
  withFilesystemConcurrency
} from "../utils/fs.js";
import type {
  EmbeddingVectorFile,
  QdrantChunkPayloadFile,
  QdrantChunkPayloadMetadata
} from "./types.js";

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

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const parseVector = (content: string, path: string): EmbeddingVectorFile => {
  const parsed = JSON.parse(content) as unknown;
  if (!isObject(parsed)) {
    throw new Error(`Invalid embedding vector file ${path}`);
  }

  if (
    typeof parsed.chunkId !== "string" ||
    typeof parsed.contentHash !== "string" ||
    typeof parsed.model !== "string" ||
    typeof parsed.dimensions !== "number" ||
    !Array.isArray(parsed.embedding) ||
    !parsed.embedding.every((item) => typeof item === "number") ||
    typeof parsed.embeddedAt !== "string"
  ) {
    throw new Error(`Invalid embedding vector fields in ${path}`);
  }

  return {
    chunkId: parsed.chunkId,
    contentHash: parsed.contentHash,
    model: parsed.model,
    dimensions: parsed.dimensions,
    embedding: parsed.embedding,
    embeddedAt: parsed.embeddedAt
  };
};

const parseChunkMetadata = (value: unknown, path: string): QdrantChunkPayloadMetadata => {
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
    id: value.id,
    sourceFile: value.sourceFile,
    url: nullableString(value.url),
    title: nullableString(value.title),
    language: nullableString(value.language),
    headingPath: value.headingPath,
    chunkIndex: value.chunkIndex,
    totalChunks: value.totalChunks,
    tokenCount: value.tokenCount,
    contentHash: value.contentHash
  };
};

const parseChunk = (content: string, path: string): QdrantChunkPayloadFile => {
  const parsed = JSON.parse(content) as unknown;
  if (
    !isObject(parsed) ||
    typeof parsed.markdown !== "string" ||
    typeof parsed.plainText !== "string"
  ) {
    throw new Error(`Invalid chunk payload file ${path}`);
  }

  return {
    metadata: parseChunkMetadata(parsed.metadata, path),
    markdown: parsed.markdown,
    plainText: parsed.plainText
  };
};

export class EmbeddingVectorReader {
  public constructor(private readonly embeddingsDir = "data/embeddings") {}

  public async readByChunkId(): Promise<ReadonlyMap<string, EmbeddingVectorFile>> {
    const files = await walkJsonFiles(this.embeddingsDir);
    const entries = await mapWithFilesystemConcurrency(files, async (path) => {
      const vector = parseVector(await readTextFile(path), path);
      return [vector.chunkId, vector] as const;
    });
    return new Map(entries);
  }
}

export class QdrantChunkPayloadReader {
  public constructor(private readonly chunksDir = "data/chunks") {}

  public async readByChunkId(): Promise<ReadonlyMap<string, QdrantChunkPayloadFile>> {
    const files = await walkJsonFiles(this.chunksDir);
    const entries = await mapWithFilesystemConcurrency(files, async (path) => {
      const chunk = parseChunk(await readTextFile(path), path);
      return [chunk.metadata.id, chunk] as const;
    });
    return new Map(entries);
  }
}
