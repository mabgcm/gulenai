import { join } from "node:path";
import type { QdrantChunkEntry, QdrantDocumentEntry, QdrantIndexSummary } from "./types.js";
import { readJson, writeJson } from "../utils/fs.js";

export class QdrantIndexStore {
  private readonly documentsPath: string;
  private readonly chunksPath: string;
  private readonly summaryPath: string;

  public constructor(private readonly indexDir = "data/index") {
    this.documentsPath = join(indexDir, "documents.json");
    this.chunksPath = join(indexDir, "chunks.json");
    this.summaryPath = join(indexDir, "summary.json");
  }

  public async loadDocuments(): Promise<readonly QdrantDocumentEntry[]> {
    return (await readJson<readonly QdrantDocumentEntry[]>(this.documentsPath)) ?? [];
  }

  public async loadChunks(): Promise<readonly QdrantChunkEntry[]> {
    return (await readJson<readonly QdrantChunkEntry[]>(this.chunksPath)) ?? [];
  }

  public async saveChunks(chunks: readonly QdrantChunkEntry[]): Promise<void> {
    await writeJson(this.chunksPath, chunks);
    await this.updateSummary(chunks);
  }

  private async updateSummary(chunks: readonly QdrantChunkEntry[]): Promise<void> {
    const existing = await readJson<QdrantIndexSummary>(this.summaryPath);
    await writeJson(this.summaryPath, {
      totalDocuments: existing?.totalDocuments ?? 0,
      totalChunks: chunks.length,
      pendingEmbeddings: chunks.filter((chunk) => chunk.embeddingStatus === "pending").length,
      changedDocuments: existing?.changedDocuments ?? 0,
      deletedDocuments: existing?.deletedDocuments ?? 0
    });
  }
}
