import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname } from "node:path";

const parseFilesystemConcurrency = (): number => {
  const raw = process.env.FS_CONCURRENCY;
  if (raw === undefined || raw.trim() === "") {
    return 32;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 32;
};

let activeFilesystemJobs = 0;
const pendingFilesystemJobs: Array<() => void> = [];

const runNextFilesystemJob = (): void => {
  const next = pendingFilesystemJobs.shift();
  if (next !== undefined) {
    next();
  }
};

export const filesystemConcurrency = (): number => parseFilesystemConcurrency();

export const filesystemConcurrencyStats = (): {
  readonly concurrency: number;
  readonly active: number;
  readonly pending: number;
} => ({
  concurrency: filesystemConcurrency(),
  active: activeFilesystemJobs,
  pending: pendingFilesystemJobs.length
});

export const withFilesystemConcurrency = async <T>(operation: () => Promise<T>): Promise<T> => {
  const acquire = async (): Promise<void> => {
    if (activeFilesystemJobs < filesystemConcurrency()) {
      activeFilesystemJobs += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      pendingFilesystemJobs.push(() => {
        activeFilesystemJobs += 1;
        resolve();
      });
    });
  };

  await acquire();
  try {
    return await operation();
  } finally {
    activeFilesystemJobs = Math.max(0, activeFilesystemJobs - 1);
    runNextFilesystemJob();
  }
};

export const mapWithFilesystemConcurrency = async <T, U>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<U>
): Promise<readonly U[]> => {
  const results: U[] = new Array<U>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await mapper(item, index);
      }
    }
  };

  const workerCount = Math.min(filesystemConcurrency(), Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => worker()));
  return results;
};

export const ensureDir = async (path: string): Promise<void> => {
  await withFilesystemConcurrency(() => mkdir(path, { recursive: true }));
};

export const readTextFile = async (path: string): Promise<string> => {
  return withFilesystemConcurrency(() => fsReadFile(path, "utf8"));
};

export const writeTextFile = async (path: string, content: string): Promise<void> => {
  await withFilesystemConcurrency(() => fsWriteFile(path, content, "utf8"));
};

export const writeJson = async <T>(path: string, value: T): Promise<void> => {
  await ensureDir(dirname(path));
  await writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

export const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    const content = await readTextFile(path);
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};
