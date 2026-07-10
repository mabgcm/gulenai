import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  mapWithFilesystemConcurrency,
  readTextFile,
  withFilesystemConcurrency
} from "../utils/fs.js";
import type { CleanHtmlDocument } from "./types.js";

const walkHtmlFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await withFilesystemConcurrency(() => readdir(directory, { withFileTypes: true }));
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
    return JSON.parse(await readTextFile(metadataPath)) as Record<string, unknown>;
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
    return mapWithFilesystemConcurrency(htmlFiles, async (htmlPath) => {
      const relativePath = relative(this.cleanDir, htmlPath);
      const metadataPath = htmlPath.replace(/\.html$/i, ".metadata.json");

      return {
        htmlPath,
        metadataPath,
        relativePath,
        html: await readTextFile(htmlPath),
        metadata: await readMetadata(metadataPath)
      };
    });
  }
}
