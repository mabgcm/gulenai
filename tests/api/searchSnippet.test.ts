import { describe, expect, it } from "vitest";
import { createSearchSnippet } from "../../src/api/searchSnippet.js";

describe("createSearchSnippet", () => {
  it("returns the first meaningful paragraph and removes headings", () => {
    expect(
      createSearchSnippet("# Işık Evler\n\nİlk anlamlı paragraf.\n\nİkinci paragraf.")
    ).toBe("İlk anlamlı paragraf.");
  });

  it("keeps complete sentences when truncating", () => {
    const firstSentence = `${"Anlamlı kelime ".repeat(12).trim()}.`;
    const markdown = `${firstSentence} ${"Devam eden uzun cümle ".repeat(20)}`;
    const snippet = createSearchSnippet(markdown);

    expect(snippet).toBe(`${firstSentence}...`);
    expect(snippet.length).toBeLessThanOrEqual(350);
  });

  it("truncates long single sentences at a word boundary", () => {
    const snippet = createSearchSnippet("kelime ".repeat(100));

    expect(snippet.length).toBeLessThanOrEqual(350);
    expect(snippet.endsWith("...")).toBe(true);
    expect(snippet.at(-4)).not.toBe(" ");
  });
});
