import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MarkdownDocument } from "./types.js";
import { ensureDir, writeJson } from "../utils/fs.js";

export class MarkdownStore {
  public constructor(private readonly markdownDir = "data/markdown") {}

  public async save(document: MarkdownDocument): Promise<void> {
    const markdownPath = join(this.markdownDir, document.relativePath).replace(/\.html$/i, ".md");
    await ensureDir(dirname(markdownPath));
    await writeFile(markdownPath, `${document.markdown}\n`, "utf8");

    if (document.metadata !== null) {
      const metadataPath = markdownPath.replace(/\.md$/i, ".metadata.json");
      await writeJson(metadataPath, document.metadata);
    }
  }
}
