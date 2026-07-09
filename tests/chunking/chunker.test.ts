import { describe, expect, it } from "vitest";
import { MarkdownChunker } from "../../src/chunking/chunker.js";
import type { TokenCounter } from "../../src/chunking/tokenCounter.js";
import { OpenAiTokenCounter } from "../../src/chunking/tokenCounter.js";
import type { MarkdownInputDocument } from "../../src/chunking/types.js";

class WordTokenCounter implements TokenCounter {
  public count(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

const document = (
  markdown: string,
  metadata: Record<string, unknown> = {}
): MarkdownInputDocument => ({
  markdownPath: "data/markdown/en/article.md",
  metadataPath: "data/markdown/en/article.metadata.json",
  relativePath: "en/article.md",
  markdown,
  metadata: {
    title: "Article Title",
    url: "https://fgulen.com/en/article",
    language: "en",
    ...metadata
  }
});

const chunker = (targetTokens = 25, maxTokens = 35, overlapTokens = 5): MarkdownChunker =>
  new MarkdownChunker({ targetTokens, maxTokens, overlapTokens }, new WordTokenCounter());

describe("MarkdownChunker", () => {
  it("splits on heading boundaries and preserves metadata", () => {
    const chunks = chunker(18, 30, 4).chunk(
      document(
        [
          "# Root",
          "",
          "Intro paragraph with several words for the root section.",
          "",
          "## First",
          "",
          "First section paragraph has enough words to stand alone.",
          "",
          "## Second",
          "",
          "Second section paragraph has enough words to stand alone."
        ].join("\n")
      )
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.metadata.title).toBe("Article Title");
    expect(chunks[0]?.metadata.url).toBe("https://fgulen.com/en/article");
    expect(chunks[0]?.metadata.sourceFile).toBe("en/article.md");
    expect(chunks[0]?.metadata.totalChunks).toBe(chunks.length);
    expect(chunks.some((chunk) => chunk.markdown.includes("## First"))).toBe(true);
    expect(chunks.some((chunk) => chunk.markdown.includes("## Second"))).toBe(true);
  });

  it("splits oversized sections on paragraph boundaries", () => {
    const chunks = chunker(20, 28, 4).chunk(
      document(
        [
          "# Long Section",
          "",
          "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
          "",
          "one two three four five six seven eight nine ten eleven twelve",
          "",
          "red blue green yellow black white orange purple silver gold bronze copper"
        ].join("\n")
      )
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.markdown.includes("# Long Section"))).toBe(true);
    expect(chunks.every((chunk) => chunk.metadata.tokenCount <= 28)).toBe(true);
  });

  it("preserves nested heading hierarchy in every chunk metadata", () => {
    const chunks = chunker(14, 24, 3).chunk(
      document(
        [
          "# Book",
          "",
          "Opening paragraph text.",
          "",
          "## Chapter",
          "",
          "Chapter introduction paragraph text.",
          "",
          "### Lesson",
          "",
          "Lesson paragraph has enough words to create content.",
          "",
          "Another lesson paragraph adds more content."
        ].join("\n")
      )
    );

    const lessonChunk = chunks.find((chunk) => chunk.markdown.includes("Lesson paragraph"));
    expect(lessonChunk?.metadata.headingPath).toEqual(["Book", "Chapter", "Lesson"]);
  });

  it("handles Turkish content and word counts", () => {
    const chunks = chunker().chunk(
      document(
        [
          "# Gönül Dünyası",
          "",
          "İnsan, şefkat ve merhametle yücelir; çağın çilesi içinde ümit taşır."
        ].join("\n"),
        { title: "Gönül Dünyası", language: "tr" }
      )
    );

    expect(chunks[0]?.markdown).toContain("Gönül Dünyası");
    expect(chunks[0]?.plainText).toContain("şefkat");
    expect(chunks[0]?.metadata.language).toBe("tr");
    expect(chunks[0]?.metadata.wordCount).toBeGreaterThan(5);
  });

  it("handles English content with deterministic chunk IDs", () => {
    const input = document(
      [
        "# English",
        "",
        "A clear English paragraph for retrieval augmented generation.",
        "",
        "## Detail",
        "",
        "Another clear English paragraph with stable content."
      ].join("\n")
    );
    const firstRun = chunker(12, 22, 3).chunk(input);
    const secondRun = chunker(12, 22, 3).chunk(input);

    expect(firstRun.map((chunk) => chunk.metadata.id)).toEqual(
      secondRun.map((chunk) => chunk.metadata.id)
    );
  });

  it("keeps tables, blockquotes, and lists as atomic blocks", () => {
    const chunks = chunker(18, 32, 4).chunk(
      document(
        [
          "# Structures",
          "",
          "> Quoted text should stay together across the block.",
          "> The quote continues here.",
          "",
          "- First item",
          "  - Nested item",
          "- Second item",
          "",
          "| Topic | Meaning |",
          "| --- | --- |",
          "| Sabır | Patience |"
        ].join("\n")
      )
    );

    expect(chunks.some((chunk) => chunk.markdown.includes("> Quoted text"))).toBe(true);
    expect(chunks.some((chunk) => chunk.markdown.includes("  - Nested item"))).toBe(true);
    expect(chunks.some((chunk) => chunk.markdown.includes("| Topic | Meaning |"))).toBe(true);
  });

  it("adds overlap from previous chunk without splitting atomic blocks", () => {
    const chunks = chunker(16, 24, 6).chunk(
      document(
        [
          "# Overlap",
          "",
          "first paragraph alpha beta gamma delta epsilon zeta",
          "",
          "second paragraph eta theta iota kappa lambda mu",
          "",
          "third paragraph nu xi omicron pi rho sigma"
        ].join("\n")
      )
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.markdown).toContain("second paragraph eta theta");
  });

  it("uses OpenAI-compatible token counting", () => {
    const counter = new OpenAiTokenCounter();
    expect(counter.count("hello world")).toBe(2);
  });
});
