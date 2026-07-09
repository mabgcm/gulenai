import { join } from "node:path";
import type { EmbeddingChunkManifestEntry, EmbeddingIndexSummary } from "./types.js";
import { readJson, writeJson } from "../utils/fs.js";

export class EmbeddingIndexManifestStore {
  private readonly chunksPath: string;
  private readonly summaryPath: string;

  public constructor(private readonly indexDir = "data/index") {
    this.chunksPath = join(indexDir, "chunks.json");
    this.summaryPath = join(indexDir, "summary.json");
  }

  public async loadChunks(): Promise<readonly EmbeddingChunkManifestEntry[]> {
    return (await readJson<readonly EmbeddingChunkManifestEntry[]>(this.chunksPath)) ?? [];
  }

  public async saveChunks(chunks: readonly EmbeddingChunkManifestEntry[]): Promise<void> {
    await writeJson(this.chunksPath, chunks);
    await this.updateSummary(chunks);
  }

  public async updateSummary(chunks: readonly EmbeddingChunkManifestEntry[]): Promise<void> {
    const existing = await readJson<EmbeddingIndexSummary>(this.summaryPath);
    const summary: EmbeddingIndexSummary = {
      totalDocuments: existing?.totalDocuments ?? 0,
      totalChunks: chunks.length,
      pendingEmbeddings: chunks.filter((chunk) => chunk.embeddingStatus === "pending").length,
      changedDocuments: existing?.changedDocuments ?? 0,
      deletedDocuments: existing?.deletedDocuments ?? 0
    };
    await writeJson(this.summaryPath, summary);
  }
}
