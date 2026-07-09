import { join } from "node:path";
import type { EmbeddingResult, EmbeddingVectorFile } from "./types.js";
import { readJson, writeJson } from "../utils/fs.js";

export class EmbeddingVectorStore {
  public constructor(private readonly embeddingsDir = "data/embeddings") {}

  public async load(chunkId: string): Promise<EmbeddingVectorFile | null> {
    return readJson<EmbeddingVectorFile>(this.pathFor(chunkId));
  }

  public async save(result: EmbeddingResult): Promise<EmbeddingVectorFile> {
    const vector: EmbeddingVectorFile = {
      chunkId: result.chunkId,
      contentHash: result.contentHash,
      model: result.model,
      dimensions: result.embedding.length,
      embedding: result.embedding,
      embeddedAt: result.embeddedAt
    };
    await writeJson(this.pathFor(result.chunkId), vector);
    return vector;
  }

  private pathFor(chunkId: string): string {
    return join(this.embeddingsDir, `${chunkId}.json`);
  }
}
