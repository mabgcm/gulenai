import { describe, expect, it } from "vitest";
import { ContentQualityAnalyzer } from "../../src/crawlQuality/contentQualityAnalyzer.js";
import { hammingDistance, simHash, tokenizeForSimilarity } from "../../src/crawlQuality/simHash.js";

const analyzer = new ContentQualityAnalyzer({ qualityThreshold: 45, minWordCount: 80 });

const words = (prefix: string, count: number): string =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ");

describe("ContentQualityAnalyzer", () => {
  it("marks article-like pages as indexable", () => {
    const result = analyzer.analyze(
      "https://fgulen.com/tr/makale/ornek",
      `<html><body><article><h1>Örnek Makale</h1><p>${words("hikmet", 180)}</p><blockquote>Sabır ve ümit.</blockquote></article></body></html>`,
      "Örnek Makale"
    );

    expect(result.indexable).toBe(true);
    expect(result.classification).toBe("article");
    expect(result.language).toBe("tr");
    expect(result.metrics.wordCount).toBeGreaterThan(100);
  });

  it("detects table-of-contents and category pages as non-indexable", () => {
    const rows = Array.from(
      { length: 20 },
      (_, index) => `<li><a href="/tr/yazi-${index}">Yazı ${index}</a></li>`
    ).join("");
    const result = analyzer.analyze(
      "https://fgulen.com/tr/kategori/test",
      `<html><body><main><h1>List of articles in category</h1><ul>${rows}</ul></main></body></html>`,
      "Kategori"
    );

    expect(result.indexable).toBe(false);
    expect(["category", "archive", "table-of-contents", "navigation"]).toContain(
      result.classification
    );
  });

  it("detects language selector pages as non-indexable", () => {
    const result = analyzer.analyze(
      "https://fgulen.com/en/",
      `<html><body><main><a href="/tr/">Türkçe</a><a href="/en/">English</a></main></body></html>`,
      "Home"
    );

    expect(result.indexable).toBe(false);
    expect(result.classification).toBe("language-selector");
  });

  it("creates stable similarity hashes for near-duplicate text", () => {
    const first = simHash(tokenizeForSimilarity(`Fethullah Gülen ${words("service", 80)}`));
    const second = simHash(tokenizeForSimilarity(`Fethullah Gulen ${words("service", 80)}`));

    expect(hammingDistance(first, second)).toBeLessThanOrEqual(8);
  });
});
