import { dirname, join } from "node:path";
import type { ExtractedDocument } from "./types.js";
import { ensureDir, writeJson, writeTextFile } from "../utils/fs.js";

export class CleanDocumentStore {
  public constructor(private readonly cleanDir = "data/clean") {}

  public async save(document: ExtractedDocument): Promise<void> {
    const htmlPath = join(this.cleanDir, document.relativePath);
    const metadataPath = htmlPath.replace(/\.html$/i, ".metadata.json");
    await ensureDir(dirname(htmlPath));
    await writeTextFile(htmlPath, `${document.cleanedHtml}\n`);
    await writeJson(metadataPath, {
      ...document.metadata,
      extractionMethod: document.extractionMethod
    });
  }
}
