import { describe, expect, it } from "vitest";
import { titleMatchBonus } from "../../src/search/titleReranker.js";

describe("titleMatchBonus", () => {
  it("adds 0.25 for an exact normalized title match", () => {
    expect(titleMatchBonus("İhlâs!", "ihlas")).toBe(0.25);
  });

  it("adds 0.15 when the normalized title starts with the query", () => {
    expect(titleMatchBonus("isik evler", "Işık Evler (1)")).toBe(0.15);
  });

  it("adds 0.10 when the normalized title contains the query", () => {
    expect(titleMatchBonus("iman", "Hususî Bir Açıdan İman")).toBe(0.1);
  });

  it("adds no bonus when the normalized title does not match", () => {
    expect(titleMatchBonus("sabır", "İhlas ve Samimiyet")).toBe(0);
  });
});
