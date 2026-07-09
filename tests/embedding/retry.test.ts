import pino from "pino";
import { describe, expect, it } from "vitest";
import { withExponentialBackoff } from "../../src/embedding/retry.js";

class RetryableTestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly headers?: { get(name: string): string | null }
  ) {
    super(`Retryable ${status}`);
  }
}

describe("withExponentialBackoff", () => {
  it("retries retryable errors", async () => {
    let calls = 0;

    const result = await withExponentialBackoff(
      async () => {
        await Promise.resolve();
        calls += 1;
        if (calls === 1) {
          throw new RetryableTestError(500);
        }
        return "ok";
      },
      1,
      pino({ enabled: false }),
      {}
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("handles rate limit retry-after headers", async () => {
    let calls = 0;

    const result = await withExponentialBackoff(
      async () => {
        await Promise.resolve();
        calls += 1;
        if (calls === 1) {
          throw new RetryableTestError(429, {
            get: (name: string) => (name.toLowerCase() === "retry-after" ? "0" : null)
          });
        }
        return "ok";
      },
      1,
      pino({ enabled: false }),
      {}
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
