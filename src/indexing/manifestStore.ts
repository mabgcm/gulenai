import { join } from "node:path";
import type { IndexManifests, IndexSummary } from "./types.js";
import { ensureDir, mapWithFilesystemConcurrency, readJson, writeJson } from "../utils/fs.js";

export class ManifestStore {
  private readonly documentsPath: string;
  private readonly chunksPath: string;
  private readonly summaryPath: string;

  public constructor(private readonly indexDir = "data/index") {
    this.documentsPath = join(indexDir, "documents.json");
    this.chunksPath = join(indexDir, "chunks.json");
    this.summaryPath = join(indexDir, "summary.json");
  }

  public async load(): Promise<IndexManifests> {
    const [documents, chunks] = await mapWithFilesystemConcurrency(
      [this.documentsPath, this.chunksPath],
      async (path) => readJson<IndexManifests["documents"] | IndexManifests["chunks"]>(path)
    );

    return {
      documents: (documents as IndexManifests["documents"] | null) ?? [],
      chunks: (chunks as IndexManifests["chunks"] | null) ?? []
    };
  }

  public async save(manifests: IndexManifests, summary: IndexSummary): Promise<void> {
    await ensureDir(this.indexDir);
    await mapWithFilesystemConcurrency(
      [
        [this.documentsPath, manifests.documents],
        [this.chunksPath, manifests.chunks],
        [this.summaryPath, summary]
      ] as const,
      async ([path, value]) => writeJson(path, value)
    );
  }

  public async loadSummary(): Promise<IndexSummary | null> {
    return readJson<IndexSummary>(this.summaryPath);
  }
}
