import type { Logger } from "../config/logger.js";
import { sleep } from "../utils/time.js";

const errorStatus = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const status = "status" in error ? error.status : null;
  return typeof status === "number" ? status : null;
};

const retryAfterMs = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null || !("headers" in error)) {
    return null;
  }

  const headers = error.headers;
  if (headers === null || typeof headers !== "object" || !("get" in headers)) {
    return null;
  }

  const get = headers.get;
  if (typeof get !== "function") {
    return null;
  }

  const retryAfter = get.call(headers, "retry-after") as unknown;
  if (typeof retryAfter !== "string") {
    return null;
  }

  const seconds = Number.parseFloat(retryAfter);
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 1000)) : null;
};

const isRetryable = (error: unknown): boolean => {
  const status = errorStatus(error);
  if (status === null) {
    return true;
  }

  return status === 408 || status === 409 || status === 429 || status >= 500;
};

export const withExponentialBackoff = async <T>(
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

      const retryAfter = retryAfterMs(error);
      const backoffMs = retryAfter ?? Math.min(30_000, 500 * 2 ** attempt);
      logger.warn(
        { ...context, err: error, attempt: attempt + 1, nextAttemptInMs: backoffMs },
        "Embedding request failed; retrying"
      );
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};
