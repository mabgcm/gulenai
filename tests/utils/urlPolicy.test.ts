import { describe, expect, it } from "vitest";
import type { SourceConfig } from "../../src/types/source.js";
import { UrlPolicy } from "../../src/crawler/urlPolicy.js";

const source: SourceConfig = {
  name: "test",
  seeds: ["https://fgulen.com"],
  allowedDomains: ["fgulen.com"],
  includePaths: ["/"],
  excludePaths: ["/wp-admin"],
  languages: [],
  maxPages: 10,
  maxDepth: 2,
  concurrency: 1,
  retries: 0,
  crawlDelayMs: 0,
  respectRobots: true,
  userAgent: "test"
};

describe("UrlPolicy", () => {
  it("normalizes URLs and removes tracking parameters", () => {
    const policy = new UrlPolicy(source);
    expect(policy.normalize("HTTPS://FGULEN.COM/path/?utm_source=x&a=1#section")).toBe(
      "https://fgulen.com/path?a=1"
    );
  });

  it("rejects excluded paths and outside domains", () => {
    const policy = new UrlPolicy(source);
    expect(policy.isAllowed("https://fgulen.com/wp-admin/edit", 0)).toBe(false);
    expect(policy.isAllowed("https://example.com/article", 0)).toBe(false);
  });
});
