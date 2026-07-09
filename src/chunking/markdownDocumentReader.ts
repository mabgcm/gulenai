import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { MarkdownInputDocument } from "./types.js";

const walkMarkdownFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(path);
    }
  }

  return files.sort();
};

const readMetadata = async (metadataPath: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

export class MarkdownDocumentReader {
  public constructor(private readonly markdownDir = "data/markdown") {}

  public async readAll(): Promise<readonly MarkdownInputDocument[]> {
    const markdownFiles = await walkMarkdownFiles(this.markdownDir);
    return Promise.all(
      markdownFiles.map(async (markdownPath) => {
        const relativePath = relative(this.markdownDir, markdownPath);
        const metadataPath = markdownPath.replace(/\.md$/i, ".metadata.json");

        return {
          markdownPath,
          metadataPath,
          relativePath,
          markdown: await readFile(markdownPath, "utf8"),
          metadata: await readMetadata(metadataPath)
        };
      })
    );
  }
}
