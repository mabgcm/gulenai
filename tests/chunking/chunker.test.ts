import { describe, expect, it } from "vitest";
import { MarkdownChunker } from "../../src/chunking/chunker.js";

describe("chunker", () => {
  it("chunks markdown on block boundaries and carries metadata", () => {
    const chunker = new MarkdownChunker({ chunkSizeTokens: 10, overlapTokens: 3 });
    const chunks = chunker.chunk({
      id: "page-1",
      metadata: { url: "https://fgulen.com/article", language: "en" },
      markdown: [
        "# Heading",
        "",
        "This first paragraph has several words.",
        "",
        "- list item one",
        "- list item two",
        "",
        "> quoted text stays together"
      ].join("\n")
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.metadata.url).toBe("https://fgulen.com/article");
    expect(chunks[0]?.text.startsWith("# Heading")).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("- list item one\n- list item two"))).toBe(
      true
    );
  });
});
