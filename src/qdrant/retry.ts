import type { Logger } from "../config/logger.js";
import { sleep } from "../utils/time.js";

const errorStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  return typeof error.status === "number" ? error.status : null;
};

const isRetryable = (error: unknown): boolean => {
  const status = errorStatus(error);
  return status === null || status === 408 || status === 409 || status === 429 || status >= 500;
};

export const withQdrantRetry = async <T>(
  operation: () => Promise<T>,
  retries: number,
  logger: Logger,
  context: Record<string, unknown>
): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= retries || !isRetryable(error)) {
        break;
      }

      const backoffMs = Math.min(30_000, 500 * 2 ** attempt);
      logger.warn(
        { ...context, err: error, attempt: attempt + 1, nextAttemptInMs: backoffMs },
        "Qdrant request failed; retrying"
      );
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};
