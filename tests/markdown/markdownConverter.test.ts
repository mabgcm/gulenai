import { describe, expect, it } from "vitest";
import { MarkdownConverter } from "../../src/markdown/markdownConverter.js";

const converter = new MarkdownConverter();

describe("MarkdownConverter", () => {
  it("converts and normalizes headings", () => {
    const markdown = converter.convert(`
      <article>
        <h3>Skipped Heading</h3>
        <p>Paragraph text.</p>
        <h6>Deep Heading</h6>
      </article>
    `);

    expect(markdown).toContain("# Skipped Heading");
    expect(markdown).toContain("## Deep Heading");
    expect(markdown).toContain("Paragraph text.");
  });

  it("preserves nested lists", () => {
    const markdown = converter.convert(`
      <article>
        <ul>
          <li>First
            <ol>
              <li>Nested one</li>
              <li>Nested two</li>
            </ol>
          </li>
          <li>Second</li>
        </ul>
      </article>
    `);

    expect(markdown).toContain("- First");
    expect(markdown).toContain("1. Nested one");
    expect(markdown).toContain("2. Nested two");
    expect(markdown).toContain("- Second");
  });

  it("preserves tables as Markdown tables", () => {
    const markdown = converter.convert(`
      <article>
        <table>
          <tr><th>Topic</th><th>Meaning</th></tr>
          <tr><td>Sabır</td><td>Patience</td></tr>
        </table>
      </article>
    `);

    expect(markdown).toContain("| Topic | Meaning |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| Sabır | Patience |");
  });

  it("preserves Turkish characters and normalizes Unicode", () => {
    const markdown = converter.convert(`
      <article lang="tr">
        <h1>Gönül Dünyası</h1>
        <p>İnsan, şefkat ve merhametle yücelir.</p>
      </article>
    `);

    expect(markdown).toContain("# Gönül Dünyası");
    expect(markdown).toContain("İnsan, şefkat ve merhametle yücelir.");
    expect(markdown).toBe(markdown.normalize("NFC"));
  });

  it("converts English pages with emphasis, links, blockquotes, and horizontal rules", () => {
    const markdown = converter.convert(
      `
        <article>
          <h1>English Page</h1>
          <p>Read <strong>carefully</strong> and <em>slowly</em>.</p>
          <p><a href="/en/next">Next article</a></p>
          <blockquote>A quoted passage.</blockquote>
          <hr />
        </article>
      `,
      "https://fgulen.com/en/page"
    );

    expect(markdown).toContain("# English Page");
    expect(markdown).toContain("**carefully**");
    expect(markdown).toContain("*slowly*");
    expect(markdown).toContain("[Next article](https://fgulen.com/en/next)");
    expect(markdown).toContain("> A quoted passage.");
    expect(markdown).toContain("---");
  });

  it("handles malformed HTML and removes invisible content", () => {
    const markdown = converter.convert(`
      <article>
        <h1>Broken
        <p>Visible paragraph
        <p hidden>Invisible paragraph</p>
        <span style="display:none">Also invisible</span>
      </article>
    `);

    expect(markdown).toContain("# Broken");
    expect(markdown).toContain("Visible paragraph");
    expect(markdown).not.toContain("Invisible paragraph");
    expect(markdown).not.toContain("Also invisible");
  });

  it("keeps image alt text and normalizes image URLs", () => {
    const markdown = converter.convert(
      `<article><p><img src="/images/book.jpg" alt="Book cover" title="Cover" /></p></article>`,
      "https://fgulen.com/en/page"
    );

    expect(markdown).toContain('![Book cover](https://fgulen.com/images/book.jpg "Cover")');
  });
});
