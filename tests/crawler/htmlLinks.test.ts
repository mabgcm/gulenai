import { describe, expect, it } from "vitest";
import { parseHtmlLinks } from "../../src/crawler/htmlLinks.js";

describe("parseHtmlLinks", () => {
  it("extracts title, canonical link, and anchors", () => {
    const html = `
      <html>
        <head>
          <title>Example Article</title>
          <link rel="canonical" href="https://fgulen.com/article" />
        </head>
        <body>
          <a href="/next">Next</a>
          <a href="">Empty</a>
        </body>
      </html>
    `;

    expect(parseHtmlLinks(html)).toEqual({
      title: "Example Article",
      canonicalUrl: "https://fgulen.com/article",
      links: ["/next"]
    });
  });

  it("prioritizes chapter links on book landing pages", () => {
    const html = `
      <html>
        <head><title>Book</title></head>
        <body>
          <nav><a href="/login">Login</a><a href="/tag/nav">Tag</a></nav>
          <main class="book">
            <h1>Book Contents</h1>
            <a href="/books/example/chapter-1">Chapter 1</a>
            <a href="/books/example/chapter-2">Chapter 2</a>
            <a href="/privacy-policy">Privacy</a>
          </main>
        </body>
      </html>
    `;

    expect(parseHtmlLinks(html).links).toEqual([
      "/books/example/chapter-1",
      "/books/example/chapter-2"
    ]);
  });
});
