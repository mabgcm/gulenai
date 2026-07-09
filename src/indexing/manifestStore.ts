import { join } from "node:path";
import type { IndexManifests, IndexSummary } from "./types.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";

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
    const [documents, chunks] = await Promise.all([
      readJson<IndexManifests["documents"]>(this.documentsPath),
      readJson<IndexManifests["chunks"]>(this.chunksPath)
    ]);

    return {
      documents: documents ?? [],
      chunks: chunks ?? []
    };
  }

  public async save(manifests: IndexManifests, summary: IndexSummary): Promise<void> {
    await ensureDir(this.indexDir);
    await Promise.all([
      writeJson(this.documentsPath, manifests.documents),
      writeJson(this.chunksPath, manifests.chunks),
      writeJson(this.summaryPath, summary)
    ]);
  }

  public async loadSummary(): Promise<IndexSummary | null> {
    return readJson<IndexSummary>(this.summaryPath);
  }
}
