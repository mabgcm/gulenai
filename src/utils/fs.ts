import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

export const writeJson = async <T>(path: string, value: T): Promise<void> => {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};
