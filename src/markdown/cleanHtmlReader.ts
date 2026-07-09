import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { CleanHtmlDocument } from "./types.js";

const walkHtmlFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkHtmlFiles(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
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

export class CleanHtmlReader {
  public constructor(private readonly cleanDir = "data/clean") {}

  public async readAll(): Promise<readonly CleanHtmlDocument[]> {
    const htmlFiles = await walkHtmlFiles(this.cleanDir);
    return Promise.all(
      htmlFiles.map(async (htmlPath) => {
        const relativePath = relative(this.cleanDir, htmlPath);
        const metadataPath = htmlPath.replace(/\.html$/i, ".metadata.json");

        return {
          htmlPath,
          metadataPath,
          relativePath,
          html: await readFile(htmlPath, "utf8"),
          metadata: await readMetadata(metadataPath)
        };
      })
    );
  }
}
