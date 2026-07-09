import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MarkdownChunk, MarkdownInputDocument } from "./types.js";
import { ensureDir, writeJson } from "../utils/fs.js";

export class ChunkStore {
  public constructor(private readonly chunksDir = "data/chunks") {}

  public async saveDocumentChunks(
    document: MarkdownInputDocument,
    chunks: readonly MarkdownChunk[]
  ): Promise<void> {
    const documentDir = join(this.chunksDir, document.relativePath.replace(/\.md$/i, ""));
    await rm(documentDir, { recursive: true, force: true });
    await ensureDir(documentDir);

    await Promise.all(
      chunks.map(async (chunk) => {
        const chunkPath = join(
          documentDir,
          `${String(chunk.metadata.chunkIndex).padStart(4, "0")}-${chunk.metadata.id}.json`
        );
        await ensureDir(dirname(chunkPath));
        await writeJson(chunkPath, chunk);
      })
    );
  }
}
