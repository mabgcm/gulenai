import { describe, expect, it } from "vitest";
import type { SourceConfig } from "../../src/types/source.js";
import { UrlPolicy } from "../../src/crawler/urlPolicy.js";

const source: SourceConfig = {
  name: "test",
  seeds: ["https://fgulen.com"],
  allowedDomains: ["fgulen.com"],
  includePaths: ["/"],
  excludePaths: ["/wp-admin"],
  includePatterns: [],
  excludePatterns: [],
  languages: [],
  qualityThreshold: 45,
  minWordCount: 120,
  duplicateSimHashDistance: 3,
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
    expect(
      policy.normalize("HTTPS://FGULEN.COM/path/?utm_source=x&tmpl=component&print=1&a=1#section")
    ).toBe("https://fgulen.com/path?a=1");
  });

  it("rejects excluded paths and outside domains", () => {
    const policy = new UrlPolicy(source);
    expect(policy.isAllowed("https://fgulen.com/wp-admin/edit", 0)).toBe(false);
    expect(policy.isAllowed("https://example.com/article", 0)).toBe(false);
  });

  it("supports include and exclude URL patterns", () => {
    const policy = new UrlPolicy({
      ...source,
      includePatterns: ["/tr/"],
      excludePatterns: ["kategori"]
    });
    expect(policy.isAllowed("https://fgulen.com/tr/makale", 0)).toBe(true);
    expect(policy.isAllowed("https://fgulen.com/en/article", 0)).toBe(false);
    expect(policy.isAllowed("https://fgulen.com/tr/kategori/test", 0)).toBe(false);
  });

  it("filters languages by the first path segment", () => {
    const policy = new UrlPolicy({ ...source, languages: ["tr"] });
    expect(policy.isAllowed("https://fgulen.com/tr/makale", 0)).toBe(true);
    expect(policy.isAllowed("https://fgulen.com/en/article", 0)).toBe(false);
    expect(policy.isAllowed("https://fgulen.com", 0)).toBe(true);
  });
});
