import { describe, expect, it } from "vitest";
import { normalizeSearchQuery } from "../../src/search/queryNormalizer.js";

describe("normalizeSearchQuery", () => {
  it.each([
    ["ihlass", "ihlas"],
    ["İHLASS nedir?", "ihlas nedir?"],
    ["riyaa", "riya"],
    ["  İhlâs   nedir? ", "İhlâs nedir?"]
  ])("normalizes %s", (query, expected) => {
    expect(normalizeSearchQuery(query)).toBe(expected);
  });
});
