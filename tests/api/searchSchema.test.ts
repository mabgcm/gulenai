import { describe, expect, it } from "vitest";
import { searchResultSchema } from "../../src/api/routes/knowledgeRoutes.js";

describe("search response schema", () => {
  it("exposes snippets without full markdown", () => {
    expect(searchResultSchema.properties).toHaveProperty("snippet");
    expect(searchResultSchema.properties).not.toHaveProperty("markdown");
    expect(searchResultSchema.required).toContain("snippet");
    expect(searchResultSchema.required).not.toContain("markdown");
  });
});
