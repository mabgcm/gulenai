import { describe, expect, it } from "vitest";
import { ConfigurableQueryUnderstanding, numberVariantsForTest } from "../../src/search/queryUnderstanding.js";
import { DEFAULT_RETRIEVAL_CONFIG } from "../../src/search/retrievalConfig.js";

describe("ConfigurableQueryUnderstanding", () => {
  it.each(["23. Söz", "23.söz", "23 söz"])("preserves and expands numeric input: %s", (query) => {
    const plan = new ConfigurableQueryUnderstanding(DEFAULT_RETRIEVAL_CONFIG).understand(query);
    expect(plan.originalQuery).toBe(query);
    expect(plan.expandedQueries.map((item) => item.toLocaleLowerCase("tr-TR"))).toContain("yirmi üçüncü söz");
    expect(plan.expandedQueries.map((item) => item.toLowerCase())).toContain("twenty third word".replace("word", "söz"));
  });

  it("normalizes roman numerals without corpus vocabulary", () => {
    const plan = new ConfigurableQueryUnderstanding(DEFAULT_RETRIEVAL_CONFIG).understand("XIX chapter");
    expect(plan.expandedQueries).toContain("19 chapter");
    expect(plan.detectedEntities).toContainEqual(expect.objectContaining({
      type: "roman-numeral",
      normalizedValue: "19"
    }));
  });

  it("expands aliases supplied only through configuration", () => {
    const config = {
      ...DEFAULT_RETRIEVAL_CONFIG,
      aliases: [{ canonical: "primary term", aliases: ["alternate name", "short name"] }]
    };
    const plan = new ConfigurableQueryUnderstanding(config).understand("Explain alternate name");
    expect(plan.matchedAliases).toEqual([{ canonical: "primary term", matched: "alternate name" }]);
    expect(plan.expandedQueries).toContain("Explain primary term");
    expect(plan.expandedQueries).toContain("Explain short name");
  });

  it("uses generic number algorithms for Turkish and English ordinals", () => {
    expect(numberVariantsForTest.turkishOrdinal(33)).toBe("otuz üçüncü");
    expect(numberVariantsForTest.englishOrdinal(33)).toBe("thirty third");
    expect(numberVariantsForTest.romanValue("XIX")).toBe(19);
  });

  it("composes configured translation aliases with numeric expansion", () => {
    const config = {
      ...DEFAULT_RETRIEVAL_CONFIG,
      aliases: [{ canonical: "Söz", aliases: ["Word"] }]
    };
    const plan = new ConfigurableQueryUnderstanding(config).understand("23. Söz");
    expect(plan.expandedQueries).toContain("twenty third Word");
  });

  it("normalizes written ordinals bidirectionally across configured languages", () => {
    const config = {
      ...DEFAULT_RETRIEVAL_CONFIG,
      aliases: [{ canonical: "Söz", aliases: ["Word"] }]
    };
    const plan = new ConfigurableQueryUnderstanding(config).understand("Twenty Third Word");
    expect(plan.expandedQueries).toContain("23. Söz");
    expect(plan.expandedQueries).toContain("yirmi üçüncü Söz");
  });
});
