import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtractedDocument } from "./types.js";
import { ensureDir, writeJson } from "../utils/fs.js";

export class CleanDocumentStore {
  public constructor(private readonly cleanDir = "data/clean") {}

  public async save(document: ExtractedDocument): Promise<void> {
    const htmlPath = join(this.cleanDir, document.relativePath);
    const metadataPath = htmlPath.replace(/\.html$/i, ".metadata.json");
    await ensureDir(dirname(htmlPath));
    await writeFile(htmlPath, `${document.cleanedHtml}\n`, "utf8");
    await writeJson(metadataPath, {
      ...document.metadata,
      extractionMethod: document.extractionMethod
    });
  }
}
