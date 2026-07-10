import { describe, expect, it } from "vitest";
import { createCitationExcerpt } from "../../src/citations/citationExcerpt.js";

describe("createCitationExcerpt", () => {
  it("selects a sentence-aware excerpt near the center of a chunk", () => {
    const beginning = `${"Başlangıç bölümü açıklama içerir ".repeat(5).trim()}.`;
    const middle = `MERKEZ bölüm **Türkçe** karakterleri korur: ş, ğ, ı, ö, ü, ç. ${"Anlamlı destek cümlesi ".repeat(3).trim()}.`;
    const ending = `${"Son bölüm başka ayrıntılar içerir ".repeat(5).trim()}.`;
    const excerpt = createCitationExcerpt(`# Başlık\n\n${beginning} ${middle} ${ending}`);

    expect(excerpt).toContain("MERKEZ");
    expect(excerpt).toContain("ş, ğ, ı, ö, ü, ç");
    expect(excerpt).not.toContain("**");
    expect(excerpt.length).toBeGreaterThanOrEqual(120);
    expect(excerpt.length).toBeLessThanOrEqual(220);
  });
});
