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
});
