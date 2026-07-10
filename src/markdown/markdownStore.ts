import { dirname, join } from "node:path";
import type { MarkdownDocument } from "./types.js";
import { ensureDir, writeJson, writeTextFile } from "../utils/fs.js";

export class MarkdownStore {
  public constructor(private readonly markdownDir = "data/markdown") {}

  public async save(document: MarkdownDocument): Promise<void> {
    const markdownPath = join(this.markdownDir, document.relativePath).replace(/\.html$/i, ".md");
    await ensureDir(dirname(markdownPath));
    await writeTextFile(markdownPath, `${document.markdown}\n`);

    if (document.metadata !== null) {
      const metadataPath = markdownPath.replace(/\.md$/i, ".metadata.json");
      await writeJson(metadataPath, document.metadata);
    }
  }
}
